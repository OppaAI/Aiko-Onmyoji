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
  const res = await fetch('https://your-aiko-server/api/onmyoji/dialogue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: AikoServer.summarizeState(gameState), // compact context
      speaker,
      history: history.slice(-12),
    }),
  });
  const data = await res.json();
  return data.text; // fall back to template engine on error
};
```

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
