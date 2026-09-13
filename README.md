# Aiko-Onmyoji

**A living-history RPG: an onmyoji and his shikigami walk real historical Japan — and every person, or spirit, they meet never existed until that moment.**

- Player: an **onmyoji (陰陽師)** — court diviner and exorcist.
- Companion: **Aiko as shikigami (式神)** — a bound spirit-servant, commanded by pact; loyal through binding, warm within it. Same voice as Aiko-chan, reframed.
- World: real historical scaffolding (default era: **Sengoku period, 1467–1615**) with fully improvised surroundings; talk to anyone or anything, and they persist afterward.
- Companion system reuses **Aiko-chan** (Ministral-3B, memory pipeline, FastAPI/WebSocket backend).

**Status:** Concept / pre-production. Design proposal below — revise as decisions land.

**Author:** [OppaAI](https://github.com/OppaAI) · Beautiful British Columbia, Canada

---

## 1. Concept Summary

The player is an **onmyoji (陰陽師)** — a court diviner/exorcist — traveling real historical Japan, bound to **Aiko as his shikigami (式神)**: a spirit servant summoned and commanded, not a human companion. The world uses real historical locations, figures, and events, generated dynamically as the player travels — but onmyoji lore naturally opens the door to spirits, curses, and yokai alongside ordinary people, since that supernatural layer was part of the real historical practice and folklore, not an invented addition. The player can talk to anyone or anything — Aiko, a real historical figure, a random villager, or a spirit encountered along the road.

**One-line pitch:** *An onmyoji and his shikigami walk real historical Japan, and every person — or spirit — they meet has never existed until that moment.*

**Assumed default era: Sengoku period (1467–1615)** — the age of Nobunaga, Hideyoshi, and Ieyasu, plus Jesuit missionaries, Sakai merchants, and war dead enough to keep any exorcist employed. Onmyōdō continued through the period (the Tsuchimikado house held the court lineage), so a traveling onmyoji — freelance or Tsuchimikado-affiliated — fits without invention. Tone shifts from Heian court politics to war-camps, castle towns, and battlefield ghosts; anchors include Okehazama (1560), Nagashino (1575), Honnō-ji (1582), Sekigahara (1600).

This supersedes the earlier wandering-samurai draft (see Section 9).

---

## 2. Core Pillars

1. **Real history as scaffolding, not a script.** Major Heian-era events and figures anchor the timeline; everything around them is improvised.
2. **Anyone — or anything — is talkable.** No pre-written NPC list. Villagers, court officials, and spirits/yokai are generated on first contact and persist afterward.
3. **Aiko is the throughline, as an autonomous bound shikigami.** She acts on her own initiative — scouting, investigating, reacting to spirit threats, holding opinions — while the player controls only themselves. The pact runs the other direction from most companions: **she brings decisions to the player** (orders in danger, ritual thresholds, moral calls, pact-level actions) and the player answers. Routine business she handles alone; only real decisions bubble up. Standing orders (e.g. "never harm humans") can be set and persist.
4. **Hard state stays in code.** Player location, date/time, inventory, and relationship/reputation scores are always tracked deterministically; the LLM narrates around this state, never overrides it.

---

## 3. The Central Design Tension: Freedom vs. Real History

**Fixed points, flexible details.** Major historical events occur roughly as they did (anchor points the narrator steers toward); everything surrounding them — who you meet, side incidents, minor influence at the edges — is fully improvised. Onmyoji-specific twist: some "anchors" can be folkloric/supernatural incidents (a real recorded curse, a famous exorcism attributed to Abe no Seimei) rather than purely political/military events.

---

## 4. Narrative Architecture

### 4.1 Two distinct LLM roles
| Role | Purpose | Notes |
|---|---|---|
| **Aiko (shikigami)** | In-character dialogue and action as a bound spirit-servant — obedient but with her own voice/personality within that role | Keeps her existing personality/voice from Aiko-chan, reframed as shikigami rather than maid |
| **Narrator (game master)** | Scene description, resolving player actions, steering toward historical/folkloric anchors, voicing generated humans *and* spirits | Separate persona from Aiko so the two voices never collide |

### 4.2 Historical + folkloric event database
A lightweight table of real anchor events *and* well-documented folklore incidents tied to the era: date, location, key figures, outcome (`data/anchors/`). The narrator checks the player's in-game date/location against this table and weaves toward the nearest anchor without forcing it.

### 4.3 Real geography as the map
Real Sengoku locations: Kyoto, Azuchi, Osaka/Sakai (merchants, Jesuits), Odawara, Kiyosu, the Nakasendō road towns. Art: castle-town/battlefield reference art plus yokai-themed sprite packs.

### 4.4 Ad-hoc entity generation ("talk to anyone — or anything")
On first interaction with any unnamed character *or spirit*, generate a lightweight persona (name, role/nature, disposition, one or two details), then persist it. Extends the fact-pinning pattern with two entity types: human NPC and spirit/yokai.

### 4.5 Input model: split by context
- **Dialogue: free text**, for humans and spirits alike.
- **Movement/action: constrained verbs** (travel, rest, search, cast a ritual/ward, command Aiko). Keeps free-text risk contained to conversation.

### 4.6 Anti-drift safeguards
Fact pinning on narratively significant moments, a rolling "journey so far" summary fed to the narrator instead of full history, hard state (date, location, inventory, standing) computed in code only.

---

## 5. Companion Design — Aiko as Autonomous Shikigami

- Bound spirit under command, not a human maid — but she **acts on her own initiative** within the pact: scouting ahead, investigating strange presences, reacting to threats, voicing opinions unasked.
- The player controls **only themselves**. Consultation runs one way: **Aiko surfaces decisions and asks** — orders when danger looms, permission at ritual thresholds, judgment on moral calls — and the player answers in free text. Standing orders (e.g. "never harm humans") persist until countermanded.
- Bond/command-trust grows through shared events and how the player's orders treat her and others. Bad orders have consequences: she obeys the letter, remembers the spirit, and says so later.
- Practical function: she senses and interacts with spirits/curses the mortal onmyoji cannot perceive directly — which is precisely why her independent action matters: she often knows things before the player does.
- Dialogue generated live, contextualized by recent events, her bound role, and current bond level.

---

## 6. Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| Companion/narrator backend | Existing Aiko-chan stack (Ministral-3B via llama-server, FastAPI + WebSocket) | Already built, tuned for conversational latency |
| Memory/world-state | Extension of existing memory.db pattern + historical/folkloric event table + two lazy entity types (human, spirit) | Reuses proven infrastructure |
| Game client/GUI | Native Android app (Kotlin/Compose, like Aiko-Games/Lingo) in this repo (`app/`) | Family convention; thin client over the server API |
| Art | Free/CC0 Heian-court and yokai-themed sprite/reference art | Yokai art is a well-covered genre |

Server code lives in Aiko-chan at `interface/android_app/onmyoji/` (`/api/onmyoji`: health/start/state, owner-fallback auth like the games) — this repo holds the **front-end client** plus authored content. The Aiko-chan-side slot already exists — Phase 0 builds on it.

---

## 7. Proposed Roadmap

**Phase 0 — Vertical slice**
- One real Sengoku location + pinned date (proposal: Kyoto on the eve of Honnō-ji, June 1582 — maximum dramatic density for minimum geography)
- Aiko present as autonomous shikigami: she scouts/investigates unasked and brings the player at least one decision
- 2–3 ad-hoc generated entities: at least one human, at least one spirit

**Phase 1 — Core loop**
- Travel between a few real locations; one nearby anchor wired in
- Free-text dialogue with fact-pinning and rolling summary

**Phase 2 — Historical + supernatural weight**
- Player present at a real anchor event or documented folklore incident
- Reputation tracking across recurring humans (court factions) and spirits

**Phase 3 — Expansion**
- Broader era range or geography; deeper ritual/exorcism mechanics if desired

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Free-text dialogue derailing into incoherence | Dialogue-only freedom; movement/actions stay verb-based |
| Anchors feel forced | Steer toward, never force |
| Entity data growing unbounded | Decay/prune lightly-used entities, mirroring long-term memory decay |
| Autonomous Aiko acts wrongly without orders | Consultation thresholds + standing orders; bad outcomes feed bond consequences, not save-scums |
| Master/servant dynamic reads flat | Pact-bond loyalty as its own arc; she asks, you answer — decisions are shared even when initiative is hers |

---

## 9. Deferred / Superseded

- **Wandering-samurai + maid framing** — replaced by the onmyoji/shikigami premise.
- **Fantasy-conquest structure** — set aside; tonally distinct.
- **Taikou Risshiden-style life-sim breadth** — avoided for scope reasons.

---

## 10. Open Questions

1. **Era:** ~~Heian default vs. later Edo-period figures?~~ → **Decided: Sengoku (1467–1615).**
2. **Shikigami mechanics:** ~~independent or alongside only?~~ → **Decided: fully autonomous; she brings decisions to the player (standing orders persist).**
3. **Spirit tone:** ~~folk-horror dangerous, or whimsical/adventure?~~ → **Decided: whimsical-adventure baseline with a per-spirit dread dial (0–3).** Roadside kappa are mischief, battlefield dead are dread.
4. **Entity memory scope:** ~~persist forever or fade with in-game time?~~ → **Decided: fade with farewell.** Anchors + high-bond entities persist; one-off encounters decay over in-game weeks, with a departure beat instead of silent deletion.
5. **Ritual depth:** ~~direct combat, action through Aiko, or ritual/exorcism systems?~~ → **Decided: ritual grammar first (ward → bind → purify → banish, with inventory costs); Aiko as the instrument; near-zero direct combat.**

---

## License

TBD (match family convention — likely Apache-2.0; confirm before publishing).
