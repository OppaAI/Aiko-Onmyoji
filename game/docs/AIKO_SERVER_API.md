# Aiko Server API Contract — Sengoku Spirits

How to replace the game's built-in template dialogue with a live LLM backend
(e.g. the Aiko-chan FastAPI/WebSocket server).

## The seam

All dialogue in the game flows through one async function in `game/js/aiko.js`:

```js
AikoServer.generate({ gameState, speaker, history }) -> Promise<string>
```

- `gameState` — the full save-state object: `{ player, aiko, world }`
  (stats, HP/rei, karma −100…100, bond 0…100, location, date, inventory, quest flags, NPC memory).
- `speaker` — `'aiko'` | `'narrator'` | `<npcId>` (e.g. `'kappa'`, `'yurei'`, `'merchant'`).
- `history` — recent `[{ speaker, text }]` for conversational continuity.
- Returns plain dialogue text (no markup; the game renders it).

The default implementation answers from the template engine. **To go live,
monkey-patch `AikoServer.generate`** — no other game file needs to change:

```js
import { AikoServer } from './aiko.js';

AikoServer.generate = async ({ gameState, speaker, history }) => {
  try {
    const res = await fetch('https://your-aiko-server/api/onmyoji/dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: AikoServer.summarizeState(gameState), // compact context
        speaker,
        history: history.slice(-12),
      }),
    });
    if (!res.ok) {
      throw new Error(`Dialogue request failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (typeof data?.text !== 'string') {
      throw new TypeError('Dialogue response must contain a string `text` field');
    }
    return data.text;
  } catch (err) {
    // Server unreachable or bad response: fall back to the local template
    // engine so dialogue never hard-fails in-game.
    console.warn('[aiko-server] falling back to template engine:', err.message);
    return AikoTemplates.generate({ gameState, speaker, history });
  }
};
```

`AikoTemplates.generate` is the bundled offline template engine (same interface as
`AikoServer.generate`: `{ gameState, speaker, history }` → `string`).

## Compact state (`summarizeState`)

The server never needs the whole save blob. `summarizeState(gameState)` produces:

```json
{
  "player":  { "name": "...", "hp": 42, "maxHp": 60, "rei": 18, "level": 3,
               "karma": 25, "karmaTier": "kind", "gold": 120, "fame": 35,
               "honor": 50, "location": "Kyoto",
               "serving": "Oda (Retainer)", "courtRank": 1 },
  "aiko":    { "bond": 64, "mood": "loyal", "hp": 30 },
  "world":   { "date": "1570-06-01", "questFlags": { "hollow_bell": 2 },
               "latestNews": ["⚔ Battle of Anegawa ...", "..."] }
}
```

NPC speakers now also include dynamic daimyo ids (`daimyo_oda`,
`daimyo_takeda`, …) — each with a fixed personality voice (see
`js/factions.js` `DAIMYO_VOICES`: blunt Nobunaga, cheerful Hideyoshi,
patient Ieyasu, formal Shingen, honor-bound Kenshin, …). The compact state
tells you the current lord, so generate the right voice for the right year.

## Server-side responsibilities

1. **Aiko persona** — bound shikigami: loyal through the pact, warm within it,
   teasing but never cruel; speaks with knowledge of the compact state
   (she *notices* low HP, karma shifts, new locations — never ask the player
   for facts the state already contains).
2. **Narrator persona** — scene description and GM voice; steers toward
   historical anchors without railroading.
3. **NPC personas** — each `npcId` has a fixed voice (see `js/dialogue.js`
   `NPCS`: terse samurai, flowery noble, coin-obsessed merchant, proverbial
   elder, formal miko, punning kappa, fragmented yurei, stern monk).
   Keep voices consistent across calls; use `history` for continuity.
4. **Safety** — all content stays non-explicit; romance fades to black.
   Never override hard state (HP, karma, flags) — narrate around it.

## Suggested endpoint

`POST /api/onmyoji/dialogue` → `{ "text": "..." }`

Keep p95 latency under ~2s for dialogue; combat banter can be generated
lazily. Cache aggressively on `(speaker, stateHash)` — most idle lines repeat.

## Live implementation (`js/aiko_link.js`)

The seam above is implemented live against the real Aiko-chan Onmyoji game
server (Jetson-local FastAPI, default `http://<jetson-ip>:8090`):

- **Private chat (Spirit Bond):** `POST /talk {to:"aiko", text}` — the whisper
  panel in `main.js`. The message carries a compact context line (master name,
  location, date, bond, karma) plus the player's words. Only the player hears
  this channel; NPCs never see it.
- **Aiko-proposed actions:** when the player asks Aiko to make something
  happen and she agrees, she appends `[DO:label|verb]` markers
  (verb ∈ `ward, divine, purify, scout, search, rest, watch, cheer`).
  `extractActions()` parses them into real action buttons; server verbs run
  through `POST /act`, local verbs resolve in the browser game.
- **Config:** server URL stored in `localStorage` (`aiko_onmyoji_server_url`);
  change it from the ⚙ link control in the whisper panel. Health check:
  `GET /api/onmyoji/health`.
- **Offline fallback:** when the server is unreachable, Aiko answers from the
  local template engine (`js/aiko.js`) and action buttons are hidden.

---

## Freeform actions — `POST /api/onmyoji/do`

The command bar sends the player's typed text to the server for freeform
understanding. Client entry point: `AikoServer.act({ text, gameState, hooks })`
in `js/aiko.js` (timeout + try/catch; any failure falls through to the
offline parser in `js/chat.js` — the command box never hard-fails).

### Request

```json
{
  "text": "tell Aiko to strike the bandit",
  "state": {
    "player":  { "name": "...", "hp": 42, "maxHp": 60, "rei": 18, "level": 3,
                 "karma": 25, "karmaTier": "kind", "gold": 120, "fame": 35,
                 "honor": 50, "location": "Kyoto", "serving": "Oda (Retainer)",
                 "courtRank": 1, "canFly": false, "canCrossWater": false },
    "aiko":    { "bond": 64, "mood": "loyal", "hp": 30 },
    "world":   { "date": "1570-06-01", "questFlags": { "hollow_bell": 2 },
                 "latestNews": ["⚔ Battle of Anegawa ..."] },
    "present": [ { "id": "lady_tsubaki", "kind": "npc", "name": "Lady Tsubaki",
                   "adult": true, "hostile": false, "disposition": "neutral" },
                 { "id": "h_kyoto_bandit_0", "kind": "npc", "name": "Road Bandit",
                   "adult": false, "hostile": true, "disposition": "hostile" } ],
    "party":   [ { "id": "aiko", "name": "Aiko", "kind": "fox" },
                 { "id": "shik_h_kyoto_bandit_0", "name": "Road Bandit", "kind": "human" } ]
  }
}
```

- `state` is `summarizeStateExtended(gameState)` (`js/aiko.js`): the base
  `summarizeState` plus `present` (nearby entities — `kind` is one of
  `npc | spirit | animal | demon | historical`; `adult` comes from the
  dialogue.js NPC records, the same source of truth as the game's adult
  gating), `party` (bound shikigami incl. Aiko), and hard capability flags
  `player.canFly: false`, `player.canCrossWater: false`.
- `narration` in the response is prose only — the client renders it as-is.

### Response

```json
{
  "ok": true,
  "refused": false,
  "reason": "",
  "intent":   { "verb": "strike", "target": "h_kyoto_bandit_0", "args": {},
                "aiko_command": true, "adult": false, "forced": false },
  "effects":  [ { "type": "karma", "delta": -3 }, { "type": "mp", "delta": -2 } ],
  "narration": "Aiko darts forward, claws flashing.",
  "journey": {}
}
```

### Intent schema

- `verb` — one of the fixed vocabulary below (anything else is ignored).
- `target` — entity id from `present`/`party`, or `""`.
- `args` — verb-specific, e.g. `{ "dir": "north" }` for travel/move,
  `{ "item": "salt pouch" }` for give, `{ "template": "tender" }` for intimate,
  `{ "sub": "follow" }` for command.
- `aiko_command` — true when the order is directed at Aiko/a shikigami
  (strike/command route to the shikigami attack flow instead of the player's).
- `adult` — true when the intent is romantic/sexual; the client re-checks
  the target against its own adult gating before running anything.
- `forced` — true for coercive intents; the client applies the deterministic
  forced consequences (karma −20, guard alert, coerced flag).

### Verb vocabulary (fixed)

`travel, rest, search, ward, strike, bind, flee, command, talk, recruit,
release, give, steal, kiss, intimate, work, possess, move`

The client maps each verb to its existing local handlers
(`js/aiko.js mapFreeformIntent` → `main.js execIntent`): strike → combat /
shikigami attack, kiss → kiss scene beats, intimate → intimate scene flow,
bind → shikigami binding (max 7 incl. Aiko), possess → Aiko possession, etc.
`search`/`ward` resolve purely via narration + effects (no local handler).

### Effect descriptors (fixed types)

| type | meaning |
|---|---|
| `{"type":"karma","delta":-30}` | player karma, clamped to −100…100 |
| `{"type":"faction","faction":"oda","delta":-20}` | faction rep change (id must be a known faction, e.g. oda/tokugawa/court; unknown ids are ignored) |
| `{"type":"mp","delta":-1}` | rei (spirit energy), clamped ≥ 0 |
| `{"type":"hp","delta":-2}` | HP, clamped 0…maxHp |
| `{"type":"bond","delta":0.02}` | Aiko bond, clamped 0…100 |
| `{"type":"gold","delta":50}` | gold, clamped ≥ 0 |
| `{"type":"item","item":"salt pouch","op":"give"\|"take"}` | inventory give/take |
| `{"type":"consequence","note":"..."}` | appended to the game news/journal log |
| `{"type":"flag","flag":"...","value":...}` | quest/world flag set |

Effects are applied deterministically by `applyServerEffects` (`js/aiko.js`).
Unknown descriptor types are ignored, never applied.

### Refusal contract

- `refused: true` (or `ok: false`) → the client shows `narration`/`reason`
  as system text and applies **no** effects and routes **no** intent.
- Capability rules the server enforces: the player **cannot** fly, walk on
  water, pass through walls, or teleport. Aiko **can** fly, cross water, and
  possess people — `aiko_command` intents may use those abilities.
- On any transport/parse failure the client silently falls through to the
  offline parser; after a failure it stays offline for 60s so typing stays
  snappy while the server is down.

### Adult-content policy

- 18+ content only for explicitly adult female NPCs (`adult: true` in
  dialogue.js). Never Aiko, never minors, never ambiguous-age NPCs
  (e.g. miko_hana).
- The client re-validates every romantic/sexual intent against its own
  `kissAllowed`/`sexAllowed` gating (`js/actions.js`) — the server's
  `adult` flag is advisory, not authoritative.
- `forced: true` ⇒ deterministic negative consequences: karma −20,
  `guard_alert` + `coerced_<npc>` flags, and a dark news entry.

### Offline fallback (no server)

`js/chat.js parseCommand()` handles freeform phrasing with zero network:

- `(tell|order|command|ask) aiko to (attack|strike|hit|kill|fight) <t>` →
  shikigami attack flow (hostiles: melee; the attack order is set)
- `(tell|order) <name> to (attack|strike) <t>` → named teammate attacks
- `(kill|murder|slay|assassinate|punch|smack) <t>` → combat (lethal path)
- `turn <t> into (my) shikigami` / `<t> as (my) shikigami` / `bind <t>` →
  shikigami binding (max 7 incl. Aiko; Aiko can never be released)
- `kiss <name>` → kiss scene beats (typed only; no preset button)
- `sleep with|make love to|have sex with|be intimate with|fuck <name>` →
  intimate scene flow for explicitly-adult NPCs only (same gating +
  forced-path consequences as the old 🔞 button)
- `(steal from|rob|pickpocket) <t>` → deterministic fallback: karma −5 +
  narration (no invented items/gold)
- `(talk to|speak to|greet) <t>` → talk
- Anything unmatched keeps the previous behavior (Aiko chat / unknown hint).

All old verb-first commands keep working unchanged.
