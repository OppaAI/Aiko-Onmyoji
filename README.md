# Aiko-Onmyoji

**Aiko Onmyoji: Sengoku Spirits** — a tile-walk historical sandbox RPG that
runs in the browser. You are an onmyōji (court diviner and exorcist)
wandering Sengoku Japan in the 1570s, with **Aiko**, your fox-spirit
shikigami, bound to your soul and snarking at your side.

**Run it:** no build step, no dependencies. Open `game/index.html` in a
browser (or serve the `game/` folder). Pure ES modules.

**Author:** [OppaAI](https://github.com/OppaAI) · Beautiful British Columbia, Canada

---

## How to play

- **Move:** arrow keys / WASD, click a tile, or the D-pad. The top bar shows
  the date, location, gold, karma, and HP.
- **Talk to Aiko** in the sidebar chat — she answers from a local banter
  engine, teases you, and reacts with a canvas mood face.
- **Command bar:** type commands (`help` lists them). Anything that isn't a
  command is treated as talking to Aiko.
- **Travel:** `travel north|south|east|west` walks off the edge of the known
  world into **procedurally generated lands** — villages, towns, cities,
  forests, rivers, caves, wilderness, palaces, ships, shrines, battlefields.
  The frontier is infinite and deterministic: the same lands are the same
  every visit, and the road back stays where you left it.
- **Core loops:** explore · recruit companions · bind shikigami · take bar
  missions (honorable or dark) · fight or capture hostiles · rest, pray, and
  trade in town buildings.

## Systems

- **Procedural infinite maps** (`game/js/mapgen.js`) — 13 scene types,
  seeded RNG (no `Math.random` in world gen), stable bidirectional links.
- **Buildings with interiors** (`game/js/places.js`) — bars, shops,
  weaponsmiths, inns, brothels, shrines, houses. Enter them (`enter the
  bar`), drink, trade, rest, pray, knock; each interior has an exit warp.
- **Mission boards + NPC requests** (`game/js/missions.js`) — bar postings
  mix good work (capture criminals, exterminate demons) with dark work
  (kidnapping, assassination) that costs karma; daimyo and elders also offer
  personal commissions (`request work from <name>`).
- **Hostiles + map melee** (`game/js/hostiles.js`) — bandits, ninja, rogue
  samurai, deserters, demons, wolves and boars spawn per scene and date;
  `fight <name>` for one exchange per command, `capture <name>` to take a
  target alive (below half HP). Fall and Aiko drags you to the Forest Shrine.
- **Party** (`game/js/party.js`) — `recruit <name>`: the willing join free,
  sellswords cost 50 gold, demons take a blood-pact; cap 4 companions.
- **Shikigami** (`game/js/party.js`) — `bind <name>` binds people, demons,
  and animals, **max 7 including Aiko**. Aiko is permanent and can never be
  released; the rest can. `shikigami attack|follow|hide` sets orders.
- **Animals** — sparse deterministic wildlife (deer, rabbits, birds, dogs,
  monkeys); the odd wild boar or wolf is hostile.
- **NPC dialogue** (`game/js/dialogue.js`) — topic-driven conversations:
  help/exploit choices, daimyo audiences, and romance arcs for explicitly
  adult NPCs (see policy below).
- **Stats** — HP/Rei/ATK/DEF, gold, EXP/levels, fame, honor, **karma**
  (−100…100), bond with Aiko, court rank, per-faction reputation, news log.
- **Capability limits** — the player is mortal: no flying, no walking on
  water (`~`), no passing walls, trees, buildings, or locked doors. Aiko, a
  spirit, drifts over anything but the void.

## Adult content policy

🔞 text content exists ONLY for explicitly-adult female NPCs (flagged
`adult: true` in `game/js/dialogue.js`, ages stated in narration — all in
their 20s–30s), and may be consensual or forced depending on the player's
actions; forced encounters cost karma, provoke guards, and can turn
factions hostile. Portraits are non-explicit;
adult content is dialogue-text only, behind 🔞 topic labels. **Aiko is never
a romantic or sexual subject** — she stays strictly platonic, as do all
minors and ambiguous-age NPCs. No explicit imagery is generated; no image
assets ship with the game (all sprites are procedurally generated).

## Command reference

`go north|south|east|west` · `travel north|south|east|west` · `enter the
bar|shop|inn|shrine|house|brothel` · `exit` · `missions` · `accept mission
<n>` · `abandon <name>` · `capture <name>` · `buy|sell <item>` · `shop` ·
`recruit <name>` · `dismiss <name>` · `disband` · `party` · `bind <name>` ·
`release shikigami <name>` · `shikigami` · `shikigami attack|follow|hide` ·
`summon <name>` · `request` / `request work from <name>` · `talk to <name>`
· `kiss|give|bow|fight <name>` · `aiko fly|land|hide` · `possess <name>` ·
`release` · `rest` · `open|unlock door` · `where am i` · `help`

## Tech

| | |
|---|---|
| Client | Static HTML + CSS + canvas (`game/index.html`, `game/css/`) |
| Code | ES modules, zero dependencies, zero build (`game/js/`, one module per system) |
| Art | Procedurally generated pixel sprites (`game/js/sprites.js`); emoji fallbacks for portraits — `game/assets/` is intentionally empty |
| State | `game/js/state.js`; save in localStorage (`aiko_onmyoji_save_v2`) |
| Docs | `game/docs/GAME_DESIGN.md` (systems), `game/docs/AIKO_SERVER_API.md` (dormant server-adapter seam) |

## Repo layout

- `game/` — the shipped web game (the thing to open and play).
- `game/js/` — game modules; `main.js` wires everything to the DOM.
- `game/docs/` — design docs.
- `data/anchors/` — historical anchor data (used by older modules).
- `app/` — dormant native-Android scaffold from the concept phase; not part
  of the shipped game.

## License

TBD (match family convention — likely Apache-2.0; confirm before publishing).
