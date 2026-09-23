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
evening → 🔞 night → daily lover-visit arc, and (once a lover) a
**🌙 Interactive night together** topic: a Dragon Knight 4-style scene with
clickable hotspots over tasteful CG art (`cg_bedroom_night.png`,
`cg_garden_moon.png`; see `js/scenes.js`). The explicit content lives in the
scene text; the imagery stays non-explicit.

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
- Each of the 14 daimyo styles has its own generated pixel-art portrait
  (`assets/daimyo_<style>.png`), resolved by `daimyoPortrait(s, fid)` so the
  right face appears in the right year. Abbot Kennyo and the Emperor included.
- **Audiences** at a clan's seat: pledge service, request missions/aid,
  present gifts (tea sets impress Nobunaga), ask about the realm (daimyo
  gossip hints at upcoming historical events), duel their champion, or take
  leave. 14 distinct daimyo voices.
- **Service ranks:** Guest → Retainer → Samurai → Officer → Castellan, with
  monthly stipends and generated missions (battle / errand / intrigue).
  Switching lords costs honor; destroyed houses leave you rōnin.
- The **Imperial Court** grants court ranks by fame — legitimacy as currency.

## 5. World & travel (`js/map.js`, `js/explore.js`)
19 locations: Kyoto, Sakai, Ōtsu, Gifu, Azuchi, Odani, Ichijōdani, Hamamatsu,
Kōfu, Kasugayama, Kōriyama, Odawara, Ishiyama Hongan-ji, Mt. Hiei,
Sekigahara, Kutsuki, Bamboo Forest, Old Shrine, Honnō-ji (locked until 1582).
Roads list travel **days**; danger ratings drive random encounters.
- **Explore mode** (`js/explore.js`): point-and-click district navigation in
  the Dragon Knight 4 style. Each location kind (capital, city, town, castle,
  village, temple, wilds) is a scene with positioned hotspots generated from
  live data — audience halls per seated faction, people, market, inn, shrine,
  gates, plus flavor spots (listen for rumors, watch the drills, rest in the
  shade, ask Aiko what she senses).

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

## 8. Aiko (`js/aiko.js`, `js/aiko_link.js`)
Template banter engine + `AikoServer` adapter seam (see AIKO_SERVER_API.md).
Aiko now muses on history: era dates, latest tidings, your service and fame,
daimyo you've met — and she remembers when you bend history.
- **Spirit Bond (private chat):** the 🦊 Whisper panel — a mind-to-mind
  channel only the player hears. When the Aiko-chan server link is live, the
  real Aiko (LLM, inner voice, subconscious) answers via `POST /talk`.
- **Ask her to make things happen:** tell Aiko what you want in the whisper
  box; when she agrees she appends `[DO:label|verb]` markers, which the game
  turns into real action buttons (ward, divine, scout, search, rest, watch…).
  Offline, she answers from local scripted lines instead.

## 9. Player stats
HP/Rei/ATK/DEF/AGI, gold, EXP/levels — plus **fame** (opens doors), **honor**
(betrayals cost it), **karma** (−100…100, spare/finish), **bond** (0…100),
court rank, per-faction reputation, and a 40-entry news log.

## 10. Screens
`title → map → location ⇄ dialogue / combat / missions → status / factions`,
plus `shop` and an optional `ending` epilogue. The location screen is the
**explore view**: a point-and-click scene with positioned hotspots. The top
bar shows the nengō date, service, fame, karma, bond, and location — plus the
🦊 Whisper toggle with a live-link status dot. Saves: `aiko_onmyoji_save_v2`.
Whisper panel and server URL (`aiko_onmyoji_server_url`) live outside the save.
