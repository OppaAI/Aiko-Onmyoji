# GAME_DESIGN.md — Aiko Onmyoji: Sengoku Spirits (Historical Sandbox)

## 1. High-level
Turn-based web RPG (no build step; open `game/index.html`, or serve the
folder). Free-roam map, bold moral choices, a teasing companion, and
irreverent humor in an original historical sandbox.

**Adult content policy:** 🔞 text content exists ONLY for explicitly-adult
female NPCs (flagged `adult: true` in `js/dialogue.js`, ages stated in
narration — all in their 20s–30s), and is always fully consensual. Portraits
are non-explicit; the adult content lives in dialogue text only, behind 🔞
topic labels. **Aiko is never a romantic or sexual subject** — she is
young/minor-coded and stays strictly platonic, as do all minors and any
ambiguous-age NPCs (e.g. miko_hana). No explicit imagery is generated.

**Romanceable adults:** six commoner women (Hanae, Yae, Tsubaki, Koharu,
Ayame, Okiku) plus three daimyo princesses (Iroha of the Oda at Azuchi, Yū
of the Takeda at Kōfu, Setsu of the Uesugi at Kasugayama). Each has an
evening → 🔞 night → daily lover-visit arc, with text-based 🔞 night topics
("🌙 Share her futon", "🌙 Spend the night together"). The explicit content
lives in the dialogue text; the imagery stays non-explicit. (Note:
`js/scenes.js` holds an older, currently unwired hotspot-scene module that
references CG filenames which do not ship with the game — it is not used by
the UI.)

**Fantasy:** You are a wandering onmyōji in Sengoku Japan, starting in the
6th month of 1570. Aiko, your bound shikigami, fights and snarks beside you.
**There is no script and no chosen one:** real history unfolds on its real
dates (1570–1590) with or without you. Meet the daimyo, serve them, betray
them, get rich, or wander free. Your story is yours.

## 2. The slow clock (`js/state.js`)
- Date: `{ y, m, d, hour }`. Actions cost **hours** (audience 3h, prayer 2h,
  talk 1h); travel and missions cost **days**; inns rest till morning.
- Japanese era names: Eiroku → Genki (1570) → Tenshō (1573) → Bunroku.
- Time moves slowly on purpose — savor it. History fires while you walk.

## 3. Real history (`js/history.js`)
`EVENTS` is a date-sorted table of real events: Anegawa (1570-06-28),
Mikatagahara (1573-01-25), Nagashino (1575-05-21), Tedorigawa (1577-11-23),
the burning of Mt. Hiei (1571), the fall of the Ashikaga (1573), Honnō-ji
(1582-06-02), Yamazaki, Shizugatake, Odawara (1590), and more.
- `processDate(s)` fires every event between the last processed date and
  today: news entries, faction destruction, strength changes, discoveries.
- **Joinable battles:** if you're near when a battle fires, a banner offers
  you a side. Win your skirmish with enough impact (fame + rank + level +
  bond ≥ 110) and **history flips**: `skipIf` flags cancel downstream events
  (e.g. winning Anegawa for the Asai saves them from 1573 destruction).
- After 1590-08 the scripted timeline ends: "history from here is unwritten."

## 4. Factions & daimyo (`js/factions.js`)
11 powers: Oda (→Toyotomi under Hideyoshi after 1582-06-13), Tokugawa,
Takeda (Shingen → Katsuyori 1573), Uesugi (Kenshin → Kagekatsu 1578), Mōri,
Asai, Asakura, Hongan-ji, Ashikaga Shogunate, Hōjō, Imperial Court.
- Daimyo successions and capital moves (Gifu → Azuchi 1576) are date-driven.
- Daimyo portraits resolve via `daimyoPortrait(s, fid)` to a portrait label
  plus an emoji fallback (`js/dialogue.js` `ARCHETYPES` / `npcPortraitFor`).
  No image assets ship with the game (`game/assets/` is empty); all on-map
  sprites are procedurally generated pixel art (`js/sprites.js`), seeded so
  each NPC's look is stable.
- **Audiences** at a clan's seat: pledge service, request missions/aid,
  present gifts (tea sets impress Nobunaga), ask about the realm (daimyo
  gossip hints at upcoming historical events), duel their champion, or take
  leave. 14 distinct daimyo voices.
- **Service ranks:** Guest → Retainer → Samurai → Officer → Castellan, with
  monthly stipends and generated missions (battle / errand / intrigue).
  Switching lords costs honor; destroyed houses leave you rōnin.
- The **Imperial Court** grants court ranks by fame — legitimacy as currency.

## 5. World & travel (`js/tilemaps.js`, `js/engine.js`, `js/mapgen.js`)
The game is a **tile-walk edition**: a canvas overworld (arrow keys / WASD /
click-to-move / D-pad), procedurally drawn sprite NPCs, warps between maps,
and a command bar. Hand-authored tile maps (Kyoto, Sakai, Gifu, …) live in
`js/tilemaps.js` alongside **procedurally generated infinite maps** (see
§11): `travel north|south|east|west` walks off the edge of the known world
into a newly generated map — village, town, city, outskirts, forest, river,
cave, wilderness, palace, ship, shrine, or battlefield. Edge warps plus the
recorded bidirectional links (`S.world.genLinks`, wired in `main.js`
`loadLocationEx`) keep the way back stable. Buildings (`h b p s i r` tiles),
water (`~`), trees, walls, and locked doors block the player (§19).

## 6. Dialogue (`js/dialogue.js`)
Static NPCs (noble, merchant, samurai, elder, miko, kappa, yurei, monk) each
speak in a distinct style, with help / exploit / walk-away choices. Daimyo
are **dynamic NPCs** (`daimyo_<fid>`) built from live faction state via
`resolveNpc()` — the right lord, at the right capital, in the right year.

## 7. Combat (`js/combat.js`)
Unchanged core: attack / 5 onmyōdō spells / items / flee; Aiko orders
(scout/strike/heal/seal/auto); spare-or-finish at ≤30% HP (karma). Plus
`officerFor(s, label)` — level-scaled champions for duels and battle
skirmishes. Effect DSL supports `{combat:'officer'}`.

## 8. Aiko (`js/chat.js` → `AikoBrain`, `js/aiko.js`)
A local template banter engine — no server required. The sidebar chat is a
direct line to Aiko (greetings, teasing, hints, a canvas mood face); the
command bar parses game commands while anything else is just talking to her
(see §18). She deflects anything sexual, warmly and firmly, and stays
strictly platonic (§1). `js/aiko_link.js` holds a dormant server-adapter seam
(see `AIKO_SERVER_API.md`); it is not wired into the current UI.

## 9. Player stats
HP/Rei/ATK/DEF/AGI, gold, EXP/levels — plus **fame** (opens doors), **honor**
(betrayals cost it), **karma** (−100…100, spare/finish), **bond** (0…100),
court rank, per-faction reputation, and a 40-entry news log.

## 10. Screens
Title → canvas overworld + Aiko sidebar (chat log, mood face) + command bar
with quick-action buttons. Panels overlay the canvas: NPC topic browser,
building menus (bar / shop / inn / brothel / shrine / house), the mission
board, shop buy/sell, NPC request offers, and the save menu. The top bar
shows the nengō date, location, gold, karma tier, and HP. Saves:
`aiko_onmyoji_save_v2` in localStorage.

## 11. Procedural infinite maps (`js/mapgen.js`)
- `genMap(id, linkOverrides)` builds a full map for any `gen_<scene>_<n>`
  id. 13 scene types in `SCENE_TYPES`: village, town, small_city, big_city,
  outskirt, forest, river, cave, wilderness, palace, ship, shrine,
  battlefield.
- Pure seeded RNG (`rng('mapgen:' + id)`, mulberry32 over an xfnv1a hash —
  no `Math.random` anywhere in world gen): the same id yields byte-identical
  maps on every call, in every session.
- `neighborFor(parentId, dir)` (`rng('nb:' + parentId + ':' + dir)`) gives a
  stable neighbor id per parent+direction, so the frontier is consistent.
- `js/tilemaps.js` serves these: `getMap(id, links)` generates (and caches
  via `registerMap`) procedural maps on demand; `isGenId` detects them.
- Generated maps carry edge warps ("North road — Forest #7") whose targets
  are overridden by the recorded bidirectional links (`S.world.genLinks`),
  so traveling north and then back south returns you to the map you left.
- Generated scenes come populated: NPC spots with `genNpcs` records (the
  engine falls back to `map.genNpcs[id]` when `js/dialogue.js` has no entry),
  buildings, plus hostile and animal spawns (§14, §17).

## 12. Buildings & interiors (`js/places.js`)
- Kinds: house, bar, brothel, shop, weaponsmith, inn, shrine. Map tiles:
  `h` house, `b` bar, `p` brothel, `s` shop/weaponsmith, `i` inn, `r` shrine —
  all block movement.
- `enter the bar` / `go inside the inn` (or the building panel) calls
  `enterBuilding`: a per-building interior map (`<parentId>__in__<bldgId>`)
  is built once, registered via `TM.registerMap`, and loaded; it always has
  an exit warp back to the parent map. `exit` / `leave building` steps out.
- Building menus: **bar** — drink sake (5g, +10 HP), mission board, talk;
  **shop / weaponsmith** — buy/sell (selling returns half price;
  weaponsmiths stock blades and wards); **inn** — rest until morning (20g,
  full HP/Rei restore); **brothel** — meet the staff, talk; **shrine** —
  pray for a healing blessing (+25 HP, once per day); **house** — knock
  (flavor text, deterministic per day).

## 13. Missions (`js/missions.js`)
- **Bar mission boards:** `genBoardMissions(S, barId)` posts 4 commissions
  per bar, deterministic per bar, mixing good and dark work.
- Good work: *Bounty: Capture* (bring the criminal in alive for full pay —
  a corpse pays half) and *Extermination* (wipe out a demon pack of three).
  Dark work: *Abduction* (deliver the victim alive — killing them fails the
  job and costs 10 karma) and *Assassination*. Accepting dark work costs
  karma up front; turning it in costs more.
- Flow: `accept mission <n>` at a bar → `spawnTarget` stashes the target
  def in `S.world.missionTargets[mapId]` → `js/hostiles.js` spawns it when
  you visit that map → kill or `capture <name>` it → `onTargetDown` marks
  the mission done/failed → `turnIn` at the giver for gold ± karma.
  `missions` shows the log; `abandon <name>` drops a commission.
- **NPC / daimyo requests:** `request` (or `request work from <name>`)
  asks a nearby NPC for work. `NPC_GIVERS` (`noble_fujiwara`,
  `elder_mosuke`, `merchant_daijiro`) offer personal commissions
  (`npcOffer` / `acceptNpcOffer`); the NPC panel gains request and turn-in
  buttons.

## 14. Hostiles & map melee (`js/hostiles.js`)
- `spawnForMap(world, S)` — deterministic per map + date. Forests and
  wilderness: wolves, boars, wild demons (1–3); caves: demons (2–4);
  battlefields: deserters and rogue samurai; villages/towns/outskirts:
  bandits and deserters; big cities: the odd stray ninja. Palaces, shrines,
  and ships spawn nothing. All spawns land on walkable tiles.
- **Map melee** (`fight <name>` or the attack action): one exchange per
  command — your strike, then party/shikigami assists, then the kill check
  (EXP + gold, karma loss for wanton killing of non-mission foes) or the
  hostile's retaliation. `capture <name>` binds a target weakened below half
  HP (refused above it) — the way to take bounties and kidnap victims alive.
- Falling to 0 HP: `hurtPlayer` fires the `onPlayerDeath` hook; Aiko drags
  you to the Forest Shrine, you wake healed minus a gold penalty
  (`Combat.defeatPenalty`).

## 15. Party (`js/party.js`)
- `recruit <name>` — team up with NPCs (and, via blood-pact, demons).
  Willingness is deterministic, first match wins: demon pact (100g, or
  karma ≤ −20 for a pact of fear) → loyal (helped them ≥ 2, joins free) →
  hired (50g) → fear (karma ≤ −30). Refused otherwise. Cap: 4 companions.
- `dismiss <name>` parts ways; `disband` sends everyone off. `party` lists
  who's with you. Recruits leave the map and follow as entities
  (`loadFollowers` rebuilds them after each `loadLocation`).

## 16. Shikigami (`js/party.js`)
- `bind <target>` binds NPCs, hostiles, or animals as shikigami — **max 7
  total, including Aiko**. Binding a person needs a reason (loyalty, 30g,
  or fear); animals and beaten foes submit more easily.
- **Aiko is permanent and can never be released** — `release shikigami
  aiko` is refused with "Aiko is bound to your soul forever. She cannot be
  released." Every other shikigami is releasable (`release shikigami
  <name>` / `free <name>`).
- `shikigami` lists the bound; `summon <name>` calls one forth;
  `shikigami attack|follow|hide` sets standing orders — on `attack` they
  strike alongside you in map melee (and add damage in duels via
  `assistDamage`); on `hide` they melt into the shadows (Aiko stays).
- Shikigami are distinct from party companions: the party fights beside you
  as people; shikigami are bound spirits under your orders.

## 17. Animals (`js/party.js`)
- Sparse ambient wildlife, deterministic per map (`spawnAnimals`):
  forests 4, wilderness/outskirts 3, villages 2, rivers 2, towns 1 — never
  in caves, palaces, ships, battlefields, or interiors. Village dogs, river
  birds, deer, rabbits, monkeys. ~8% of wild spawns are hostile boar/wolf
  (handled by the hostiles system).

## 18. Chat commands (`js/chat.js`, `js/main.js`)
`parseCommand` classifies input; `main.js` `execIntent` executes. Commands:
`go north|south|east|west` (also `up/down/left/right`) · `travel
north|south|east|west` (generate new lands) · `enter the
bar|shop|inn|shrine|house|brothel` · `exit` · `missions` · `accept mission
<n>` · `abandon <name>` · `capture <name>` · `buy|sell <item>` · `shop` ·
`recruit <name>` · `dismiss <name>` · `disband` · `party` · `bind <name>` ·
`release shikigami <name>` · `shikigami` · `shikigami attack|follow|hide` ·
`summon <name>` · `request` / `request work from <name>` · `talk to
<name>` · `kiss|give|bow|fight <name>` · `aiko fly|land|hide` · `possess
<name>` · `release` · `rest` · `open|unlock door` · `where am i` · `help`.
Anything else is treated as talking to Aiko.

## 19. Capability limits
- The player is mortal: **no flying and no walking on water** — `~` (water),
  `T` (trees), `#` (walls), buildings, and locked doors all block movement
  (`js/tilemaps.js` `isBlocked`); click-to-move pathfinding (BFS, ~200
  steps) routes around blockers. There is no jump, swim, or flight verb.
- Aiko is a spirit, not a person: with `spirit=true` she ignores every tile
  except the void (`' '`), so she can drift over water and walls while you
  walk around them.
