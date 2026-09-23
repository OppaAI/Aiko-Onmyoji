// game/js/places.js — buildings, enterable interiors, and place services.
//
// OWNED BY the buildings/places workstream. No other workstream edits this file.
//
// No DOM access. Mostly pure: mutates S and registers maps via tilemaps.js.
//
// Gen maps carry `buildings: [{id, kind, name, x, y}]` (kind in BUILDING_KINDS).
// enterBuilding() builds a 24x18 interior map id `${parentId}__in__${bldg.id}`,
// registers it (TM.registerMap, or TM.MAPS fallback), and returns the id.
// Generated NPCs live on the interior map in `map.genNpcs`:
//
//   genNpcs: { [npcId]: { name, archetype, gender?, adult?, desc?,
//                         greet?(s) -> beats,      // beats: [{who, text}]
//                         topics: [{ id, label, need?(s)->bool,
//                                    beats(s) -> [{who, text}],
//                                    effects?: [{gold:n}|{memory:[id,k,v]}|...] }] } }
//
// Beat `who` follows dialogue.js convention: 'n' = narrator, 'h' = hero,
// 'a' = Aiko, npcId = that NPC speaking.
//
// INTEGRATOR NOTE: dialogue.resolveNpc() and engine.loadLocation() currently
// only consult DLG.NPCS. Extend the lookup to `map.genNpcs[npcId]` first
// (interior maps carry their own genNpcs) before falling back to DLG.NPCS.
// Sprites: engine passes the rec to Spr.npcSpec(id, rec); archetypes used here
// are 'merchant', 'villager', 'courtesan', 'merchant_woman'.
//
// POLICY (hard): Aiko is never involved in brothel content. Brothel staff are
// explicitly adult women (adult:true, gender:'f'); no minors, no ambiguous-age
// characters. Adult content is dialogue-text only, non-explicit. main.js must
// gate the 'evening' topic and the brothel menu behind npc.adult === true.

import * as St from './state.js';
import { rng } from './sprites.js';
import * as TM from './tilemaps.js';

// ---------------------------------------------------------------------------
// Building kinds
// ---------------------------------------------------------------------------

export const BUILDING_KINDS = {
  house:       { name: 'House',          desc: 'A modest dwelling. Someone may be home.' },
  bar:         { name: 'Sake Bar',       desc: 'Warm lamplight, loud laughter, and the latest rumors.' },
  brothel:     { name: 'Pleasure House', desc: 'Lanterns glow behind lattice screens. Adults only.' },
  shop:        { name: 'General Shop',   desc: 'Provisions, charms, and curiosities for the road.' },
  weaponsmith: { name: 'Weaponsmith',    desc: 'Blades and wards, forged and blessed.' },
  inn:         { name: 'Inn',            desc: 'A hot bath, a warm futon, and breakfast at dawn.' },
  shrine:      { name: 'Wayside Shrine', desc: 'A quiet altar. The kami here are kind.' },
};

// Tile chars used by the map generator for each kind (documented for the
// procedural-map workstream): house 'h', bar 'b', brothel 'p', shop 's',
// weaponsmith 's' (shares the shop tile), inn 'i', shrine 'r'.
export const TILE_FOR_KIND = {
  house: 'h', bar: 'b', brothel: 'p', shop: 's',
  weaponsmith: 's', inn: 'i', shrine: 'r',
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Creates S.world.places (per-building runtime: stock, visited flags). */
export function ensureState(S) {
  if (!S.world.places) S.world.places = {};
  return S.world.places;
}

function _placesFor(S, bldgId) {
  ensureState(S);
  if (!S.world.places[bldgId]) S.world.places[bldgId] = {};
  return S.world.places[bldgId];
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Nearest building to (x, y) on world.map (or on `world` itself if it is a
 * raw map). Returns {bldg, dist} or null. kindOpt filters by building kind.
 */
export function findNearestBuilding(world, x, y, kindOpt = null, maxDist = 4) {
  const map = (world && world.map) ? world.map : world;
  const list = (map && map.buildings) || [];
  let best = null;
  for (const b of list) {
    if (kindOpt && b.kind !== kindOpt) continue;
    const d = Math.abs(b.x - x) + Math.abs(b.y - y);
    if (d > maxDist) continue;
    if (!best || d < best.dist) best = { bldg: b, dist: d };
  }
  return best;
}

/**
 * Enter a building: builds/registers its interior and returns the interior
 * map id the engine should load. `world` is the engine World (or anything
 * with .mapId); parent map defaults to S.player.location.
 */
export function enterBuilding(S, world, bldg) {
  ensureState(S);
  const parentId = (world && world.mapId) || S.player.location;
  const iid = ensureInterior(S, parentId, bldg);
  _placesFor(S, bldg.id).visited = true;
  return iid;
}

// ---------------------------------------------------------------------------
// Interior maps
// ---------------------------------------------------------------------------

const IW = 24, IH = 18;
const _registered = new Set(); // interior ids already registered this session

function _registerMap(id, map) {
  // tilemaps.js will export registerMap(id, map); fall back to direct MAPS
  // assignment if the procedural-maps workstream has not landed it yet.
  if (typeof TM.registerMap === 'function') TM.registerMap(id, map);
  else TM.MAPS[id] = map;
}

function _blank() {
  const t = [];
  for (let y = 0; y < IH; y++) {
    let row = '';
    for (let x = 0; x < IW; x++) row += (x === 0 || y === 0 || x === IW - 1 || y === IH - 1) ? '#' : '=';
    t.push(row);
  }
  return t;
}
function _set(t, x, y, ch) {
  if (x < 0 || y < 0 || x >= IW || y >= IH) return;
  t[y] = t[y].slice(0, x) + ch + t[y].slice(x + 1);
}
function _rect(t, x0, y0, x1, y1, ch) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) _set(t, x, y, ch);
}

// Beat helpers (dialogue.js convention: who 'n' = narrator).
const _narr = (text) => ({ who: 'n', text });
const _say = (id, text) => ({ who: id, text });

const BARKEEP_NAMES = ['Gon', 'Tomekichi', 'Hatsu', 'Denbei', 'Kakubei'];
const PATRON_KINDS = ['a tired porter', 'a traveling minstrel', 'an off-duty ashigaru', 'a sake-loving farmer', 'a shy pilgrim', 'a retired sailor'];
const COURTESAN_NAMES = ['Yūgiri', 'Kohana', 'Botan', 'Ayame', 'Fujino', 'Sakurako'];
const MAMA_NAMES = ['Osen', 'Kiku', 'Tama', 'Fuji'];
const SHOPKEEP_NAMES = ['Heiji', 'Kichibei', 'Masa', 'Shōbei'];
const SMITH_NAMES = ['Kanemasa', 'Tetsunosuke', 'Masakatsu', 'Jirōsaku'];
const INNKEEP_NAMES = ['Osada', 'Yone', 'Tomi', 'Hisa'];
const MONK_NAMES = ['Jinen', 'Sōtetsu', 'Ryōan'];
const VILLAGER_NAMES = ['Yoshimatsu', 'Otake', 'Heizō', 'Orin', 'Sukezaemon'];
const HOUSE_NAMES = ['House of the Peony', 'Willow House', 'Moonlight House', 'House of Chrysanthemums'];

function _pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

function _chatTopic(id, lines) {
  return { id: 'chat', label: '💬 Chat', beats: () => lines.map(t => _say(id, t)) };
}

// -- per-kind NPC factories ----------------------------------------------

function _mkBartender(r, iid) {
  const id = `${iid}__barkeep`;
  const name = 'Barkeep ' + _pick(r, BARKEEP_NAMES);
  const rec = {
    name, archetype: 'merchant', gender: 'm',
    desc: 'Keeps the bar, the sake, and the gossip flowing.',
    greet: () => [
      _narr(`${name} polishes a cup and nods at you.`),
      _say(id, `Welcome in, traveler. Sake's warm, the board's full, and the rumors are free-ish.`),
    ],
    topics: [
      _chatTopic(id, [
        `Heard the latest? The magistrate's men are hiring swords off the mission board — and some fellow with deeper pockets is hiring for work he'd rather not name.`,
        `Me? I pour. I listen. I forget. In that order.`,
      ]),
      {
        id: 'board', label: '📌 Ask about the mission board',
        beats: () => [
          _say(id, `That board by the door? Folk pin up work for blades and wits. Good coin for good deeds — and other coin for other deeds.`),
          _say(id, `Read it yourself. I just pour the sake.`),
          _narr('The mission board bristles with pinned slips of paper.'),
        ],
      },
    ],
  };
  return { id, rec, spot: [11, 3] };
}

function _mkPatron(r, iid, idx, spot) {
  const id = `${iid}__patron${idx}`;
  const kind = _pick(r, PATRON_KINDS);
  const name = kind.charAt(0).toUpperCase() + kind.slice(1);
  const rec = {
    name, archetype: 'villager',
    desc: `A bar patron — ${kind}.`,
    greet: () => [_say(id, `Hm? Oh — sit, sit. The night's young and the sake's cheap.`)],
    topics: [_chatTopic(id, [
      `They lean in conspiratorially, then forget what they were going to say and laugh.`,
      `Good sake, good company. What more does a soul need?`,
    ])],
  };
  return { id, rec, spot };
}

function _mkCourtesan(r, iid, houseName, idx, spot) {
  const id = `${iid}__courtesan${idx}`;
  const name = _pick(r, COURTESAN_NAMES) + ' of ' + houseName;
  const rec = {
    // POLICY: brothel staff are explicitly adult women, always.
    name, archetype: 'courtesan', gender: 'f', adult: true,
    desc: 'A courtesan of the house — an adult woman, by law and custom.',
    greet: () => [
      _narr('She greets you with a practiced, graceful bow, a smile behind her sleeve.'),
      _say(id, `Welcome to ${houseName}, traveler. I am ${name.split(' of ')[0]}. Will you share a cup with me?`),
    ],
    topics: [
      _chatTopic(id, [
        `A traveling onmyoji... you must have stories enough to fill a whole night.`,
        `The others say I laugh too loudly. I say the night is too short for quiet laughter.`,
      ]),
      {
        id: 'evening', label: '💗 Spend the evening together (🔞)',
        // POLICY: main.js must gate this topic behind npc.adult === true.
        // Text-only, non-explicit: romance and mood, never pornographic.
        beats: () => [
          _say(id, `Then sit with me a while. The night is long, and the sake is sweet.`),
          _narr('You share sake and quiet laughter as the lanterns burn low. What passes between two consenting adults stays between them.'),
          _say(id, `...Dawn comes too soon, doesn't it? Come back and see me again.`),
        ],
        effects: [{ gold: -50 }, { memory: [id, 'helped', 1] }],
      },
    ],
  };
  return { id, rec, spot };
}

function _mkMamaSan(r, iid, houseName, spot) {
  const id = `${iid}__mamasan`;
  const name = 'Mama-san ' + _pick(r, MAMA_NAMES);
  const rec = {
    name, archetype: 'merchant_woman', gender: 'f', adult: true,
    desc: `Runs ${houseName} with an iron fan and a soft heart.`,
    greet: () => [
      _say(id, `Welcome, welcome. Mind the girls are all grown women here — the house keeps it proper, whatever the hour.`),
      _say(id, `Fifty gold spends an evening with one of my ladies. Conversation, sake, and company — nothing more, nothing less.`),
    ],
    topics: [_chatTopic(id, [
      `Twenty years I've run this house, and I've seen lords and beggars cry the same tears.`,
      `Treat my girls kindly, and you'll always have a lantern lit for you here.`,
    ])],
  };
  return { id, rec, spot };
}

function _mkShopkeeper(r, iid, kind, spot) {
  const id = `${iid}__shopkeep`;
  const isSmith = kind === 'weaponsmith';
  const name = (isSmith ? 'Smith ' : 'Shopkeep ') + _pick(r, isSmith ? SMITH_NAMES : SHOPKEEP_NAMES);
  const rec = {
    name, archetype: 'merchant', gender: 'm',
    desc: isSmith ? 'A burly smith who blesses every blade he sells.' : 'A sharp-eyed shopkeeper who knows every coin in the province.',
    greet: () => [
      _say(id, isSmith
        ? `Blades and wards, friend. Every edge true, every ward blessed at dawn.`
        : `Welcome, welcome! Provisions, charms, curiosities — everything a traveler needs.`),
    ],
    topics: [
      _chatTopic(id, isSmith
        ? [`Steel remembers the hand that forged it. Treat a blade well and it will never fail you.`, `That new ritual blade? Forged under a full moon. Costs a fortune. Worth every coin.`]
        : [`Buy low, sell high, and never trust a merchant who smiles too much — present company included.`, `Fine silk? A gift for the court, that. The nobles eat it up.`]),
      {
        id: 'wares', label: '🛒 Ask about the wares',
        beats: () => [_say(id, `Have a look at the shelves — everything's priced fair. I buy, too, if you've goods to sell.`)],
      },
    ],
  };
  return { id, rec, spot };
}

function _mkInnkeeper(r, iid, spot) {
  const id = `${iid}__innkeep`;
  const name = 'Innkeep ' + _pick(r, INNKEEP_NAMES);
  const rec = {
    name, archetype: 'merchant', gender: 'f',
    desc: 'Runs a clean, quiet inn. The futons are always warm.',
    greet: () => [
      _say(id, `Welcome, traveler! A bath, a meal, and a warm futon — twenty gold, and you'll wake at dawn feeling reborn.`),
    ],
    topics: [
      _chatTopic(id, [
        `Travelers bring the best stories. A monk came through last week claiming he'd seen a kappa doing sums. Sums!`,
        `Rest well when you can. The roads only get stranger from here.`,
      ]),
    ],
  };
  return { id, rec, spot };
}

function _mkAttendant(r, iid, spot) {
  const id = `${iid}__attendant`;
  const name = 'Brother ' + _pick(r, MONK_NAMES);
  const rec = {
    name, archetype: 'elder', gender: 'm',
    desc: 'A quiet attendant who tends the altar.',
    greet: () => [
      _say(id, `The kami are kind to those who bow sincerely. Rest a moment — take their blessing with you.`),
    ],
    topics: [_chatTopic(id, [
      `I sweep these stones every morning. The wind undoes it by noon. Such is the way of things.`,
      `Pray, and the ache in your limbs will ease. The kami ask only sincerity — once a day.`,
    ])],
  };
  return { id, rec, spot };
}

function _mkResident(r, iid, spot) {
  const id = `${iid}__resident`;
  const name = _pick(r, VILLAGER_NAMES);
  const rec = {
    name, archetype: 'villager',
    desc: 'A local resident, home for the evening.',
    greet: () => [_say(id, `Oh! A visitor. Mind the step — come in, come in.`)],
    topics: [_chatTopic(id, [
      `Not much happens here, and we like it that way.`,
      `You're welcome to warm yourself a moment, but the futon's mine.`,
    ])],
  };
  return { id, rec, spot };
}

// -- layout builders -----------------------------------------------------

function _baseMap(parentId, bldg, iid, displayName) {
  const pmap = TM.getMap(parentId);
  const exitTs = _exitTile(parentId, bldg);
  return {
    id: iid,
    name: displayName,
    tiles: _blank(),
    spawns: { player: [12, 15] },
    npcSpots: {},
    genNpcs: {},
    warps: [{ x: 12, y: 17, to: parentId, ts: exitTs, label: 'Exit — ' + (pmap.name || parentId) }],
    lockedDoors: [],
    buildings: [],
    interiorOf: parentId,
    buildingKind: bldg.kind,
  };
}

/** Walkable tile adjacent to the building on the parent map (for the exit). */
function _exitTile(parentId, bldg) {
  const pmap = TM.getMap(parentId);
  const cands = [[0, 1], [1, 0], [-1, 0], [0, -1], [0, 2], [2, 0], [-2, 0]];
  for (const [dx, dy] of cands) {
    const nx = bldg.x + dx, ny = bldg.y + dy;
    if (!TM.isBlocked(pmap, nx, ny, null, false)) return [nx, ny];
  }
  return [Math.min(22, Math.max(1, bldg.x)), Math.min(16, Math.max(1, bldg.y + 1))];
}

function _addNpc(map, made) {
  map.npcSpots[made.id] = made.spot;
  map.genNpcs[made.id] = made.rec;
}

function _buildBar(S, parentId, bldg, iid) {
  const r = rng('interior:' + iid);
  const map = _baseMap(parentId, bldg, iid, `${bldg.name || 'Sake Bar'} (interior)`);
  const t = map.tiles;
  _rect(t, 9, 4, 14, 4, '#');           // counter
  for (const [x, y] of [[5, 8], [18, 8], [5, 12], [18, 12]]) _set(t, x, y, '#'); // tables
  _set(t, 12, 17, '=');
  _addNpc(map, _mkBartender(rng('interior:' + iid + ':barkeep'), iid));
  const spots = [[5, 9], [18, 9], [17, 12]];
  const n = 2 + Math.floor(r() * 2);    // 2-3 patrons
  for (let i = 0; i < n; i++) _addNpc(map, _mkPatron(rng(`interior:${iid}:patron${i}`), iid, i, spots[i]));
  return map;
}

function _buildBrothel(S, parentId, bldg, iid) {
  const r = rng('interior:' + iid);
  const houseName = bldg.name || _pick(r, HOUSE_NAMES);
  const map = _baseMap(parentId, bldg, iid, `${houseName} (interior)`);
  const t = map.tiles;
  _rect(t, 8, 2, 8, 7, '#');            // alcove partitions
  _rect(t, 15, 2, 15, 7, '#');
  _rect(t, 10, 14, 13, 14, '#');        // mama-san's desk
  _set(t, 12, 17, '=');
  const nStaff = r() < 0.5 ? 2 : 1;
  const staffSpots = [[11, 5], [13, 5]];
  for (let i = 0; i < nStaff; i++) {
    _addNpc(map, _mkCourtesan(rng(`interior:${iid}:courtesan${i}`), iid, houseName, i, staffSpots[i]));
  }
  _addNpc(map, _mkMamaSan(rng('interior:' + iid + ':mama'), iid, houseName, [11, 13]));
  return map;
}

function _buildShop(S, parentId, bldg, iid) {
  const map = _baseMap(parentId, bldg, iid, `${bldg.name || (bldg.kind === 'weaponsmith' ? 'Weaponsmith' : 'General Shop')} (interior)`);
  const t = map.tiles;
  _rect(t, 3, 3, 5, 3, '#');            // shelves
  _rect(t, 18, 3, 20, 3, '#');
  _rect(t, 9, 7, 14, 7, '#');           // counter
  _set(t, 12, 17, '=');
  _addNpc(map, _mkShopkeeper(rng('interior:' + iid + ':keep'), iid, bldg.kind, [11, 6]));
  return map;
}

function _buildInn(S, parentId, bldg, iid) {
  const r = rng('interior:' + iid);
  const map = _baseMap(parentId, bldg, iid, `${bldg.name || 'Inn'} (interior)`);
  const t = map.tiles;
  _rect(t, 10, 4, 13, 4, '#');          // front desk
  _rect(t, 6, 9, 6, 13, '#');           // room partitions
  _rect(t, 17, 9, 17, 13, '#');
  _set(t, 12, 17, '=');
  _addNpc(map, _mkInnkeeper(rng('interior:' + iid + ':keep'), iid, [11, 3]));
  if (r() < 0.5) _addNpc(map, _mkPatron(rng('interior:' + iid + ':guest'), iid, 0, [19, 11]));
  return map;
}

function _buildShrine(S, parentId, bldg, iid) {
  const map = _baseMap(parentId, bldg, iid, `${bldg.name || 'Wayside Shrine'} (interior)`);
  const t = map.tiles;
  _rect(t, 10, 3, 13, 4, '#');          // altar
  _set(t, 12, 17, '=');
  _addNpc(map, _mkAttendant(rng('interior:' + iid + ':attendant'), iid, [12, 6]));
  return map;
}

function _buildHouse(S, parentId, bldg, iid) {
  const r = rng('interior:' + iid);
  const map = _baseMap(parentId, bldg, iid, `${bldg.name || 'House'} (interior)`);
  const t = map.tiles;
  _set(t, 11, 8, '#');                  // low table
  _set(t, 12, 17, '=');
  if (r() < 0.5) _addNpc(map, _mkResident(rng('interior:' + iid + ':resident'), iid, [13, 10]));
  return map;
}

/**
 * Build (once) and register the interior map for a building.
 * Returns the interior map id `${parentId}__in__${bldg.id}`.
 */
export function ensureInterior(S, parentId, bldg) {
  ensureState(S);
  const iid = `${parentId}__in__${bldg.id}`;
  if (!_registered.has(iid)) {
    let map;
    switch (bldg.kind) {
      case 'bar': map = _buildBar(S, parentId, bldg, iid); break;
      case 'brothel': map = _buildBrothel(S, parentId, bldg, iid); break;
      case 'shop':
      case 'weaponsmith': map = _buildShop(S, parentId, bldg, iid); break;
      case 'inn': map = _buildInn(S, parentId, bldg, iid); break;
      case 'shrine': map = _buildShrine(S, parentId, bldg, iid); break;
      case 'house':
      default: map = _buildHouse(S, parentId, bldg, iid); break;
    }
    _registerMap(iid, map);
    _registered.add(iid);
  }
  _placesFor(S, bldg.id).visited = true;
  return iid;
}

// ---------------------------------------------------------------------------
// Building menu (data for main.js to render)
// ---------------------------------------------------------------------------

/**
 * buildingMenu(S, world, bldg) -> {title, desc, options:[{id,label}]}.
 * Pure data; main.js renders and dispatches.
 */
export function buildingMenu(S, world, bldg) {
  const kind = BUILDING_KINDS[bldg.kind] || BUILDING_KINDS.house;
  const title = `${bldg.name || kind.name} — ${kind.name}`;
  const desc = bldg.desc || kind.desc;
  const O = (id, label) => ({ id, label });
  switch (bldg.kind) {
    case 'bar':
      return { title, desc, options: [O('drink', '🍶 Drink (5 gold)'), O('board', '📌 Mission board'), O('talk', '💬 Talk to the barkeep')] };
    case 'shop':
    case 'weaponsmith':
      return { title, desc, options: [O('buy', '🛒 Buy'), O('sell', '💰 Sell')] };
    case 'inn':
      return { title, desc, options: [O('rest', '🛏️ Rest until morning (20 gold)'), O('talk', '💬 Talk to the innkeeper')] };
    case 'brothel':
      return { title, desc, options: [O('meet', '🌸 Meet the staff'), O('talk', '💬 Talk to the mama-san')] };
    case 'shrine':
      return { title, desc, options: [O('pray', '🙏 Pray (healing blessing)')] };
    case 'house':
    default:
      return { title, desc, options: [O('knock', '🚪 Knock')] };
  }
}

// ---------------------------------------------------------------------------
// Shop stock, buying, selling
// ---------------------------------------------------------------------------

// New wares sold by the weaponsmith.
// NOTE for the integrator: state.passiveBonus() only honors iron_talisman
// (+2 ATK) and warding_cord (+2 DEF). To make steel_blade / spirit_armor work,
// extend passiveBonus() in state.js to honor use:'passiveAtkN'/'passiveDefN'
// (parse the trailing digits as the bonus).
Object.assign(St.ITEMS, {
  steel_blade:  { name: 'Steel Ritual Blade', desc: 'Passive: +3 ATK while carried.', price: 350, use: 'passiveAtk3' },
  spirit_armor: { name: 'Spirit Armor',       desc: 'Passive: +3 DEF while carried.', price: 350, use: 'passiveDef3' },
});

/**
 * Deterministic stock list for a shop building. General shops rotate their
 * shelves by seed; weaponsmiths always carry blades and wards.
 */
export function shopStock(S, bldgId, kind) {
  const p = _placesFor(S, bldgId);
  if (!p.stock) {
    const r = rng('stock:' + bldgId + ':' + kind);
    let ids = (kind === 'weaponsmith')
      ? ['iron_talisman', 'warding_cord', 'steel_blade', 'spirit_armor']
      : ['herb', 'spirit_pill', 'sweet_buns', 'warding_cord', 'fine_silk', 'sacred_sake'];
    const off = Math.floor(r() * ids.length);
    p.stock = ids.slice(off).concat(ids.slice(0, off));
  }
  return p.stock;
}

/** shopList(S, kind, bldgId?) -> [{id,name,price,desc,owned}]. */
export function shopList(S, kind, bldgId = null) {
  const ids = bldgId ? shopStock(S, bldgId, kind)
    : (kind === 'weaponsmith'
      ? ['iron_talisman', 'warding_cord', 'steel_blade', 'spirit_armor']
      : ['herb', 'spirit_pill', 'sweet_buns', 'warding_cord', 'fine_silk', 'sacred_sake']);
  return ids
    .map(id => St.ITEMS[id] ? { id, name: St.ITEMS[id].name, price: St.ITEMS[id].price, desc: St.ITEMS[id].desc } : null)
    .filter(Boolean)
    .map(e => ({ ...e, owned: (S.player.inventory.find(i => i.id === e.id) || { qty: 0 }).qty }));
}

export function buyItem(S, itemId) {
  const it = St.ITEMS[itemId];
  if (!it) return { ok: false, msg: `No such ware: ${itemId}.` };
  if (!(it.price > 0)) return { ok: false, msg: `${it.name} is not for sale.` };
  if (S.player.gold < it.price) return { ok: false, msg: `Not enough gold — ${it.name} costs ${it.price}.` };
  St.addGold(S, -it.price);
  St.addItem(S, itemId, 1);
  return { ok: true, msg: `Bought ${it.name} for ${it.price} gold.` };
}

export function sellItem(S, itemId) {
  const it = St.ITEMS[itemId];
  if (!it) return { ok: false, msg: `No such ware: ${itemId}.` };
  if (!St.hasItem(S, itemId)) return { ok: false, msg: `You carry no ${it.name} to sell.` };
  const price = Math.max(1, Math.floor((it.price || 0) / 2));
  St.removeItem(S, itemId, 1);
  St.addGold(S, price);
  return { ok: true, msg: `Sold ${it.name} for ${price} gold.` };
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const INN_COST = 20;
const DRINK_COST = 5;

/** Rest at an inn: costs gold, advances to morning, full heal. */
export function restAtInn(S) {
  if (S.player.gold < INN_COST) {
    return { ok: false, msg: `A night's rest costs ${INN_COST} gold — you carry ${S.player.gold}.` };
  }
  St.addGold(S, -INN_COST);
  St.restUntilMorning(S);
  S.player.hp = S.player.maxHp;
  S.player.rei = S.player.maxRei;
  St.addNews(S, `🛏️ Rested at an inn — woke restored at dawn.`);
  return { ok: true, msg: `You sleep deeply and wake at dawn, fully restored. (−${INN_COST} gold)` };
}

/** A cup of sake at the bar: small heal, loosens tongues. */
export function drinkAtBar(S) {
  if (S.player.gold < DRINK_COST) {
    return { ok: false, msg: `A cup costs ${DRINK_COST} gold — you carry ${S.player.gold}.` };
  }
  St.addGold(S, -DRINK_COST);
  St.healPlayer(S, 10);
  return { ok: true, msg: `Warm sake spreads through your limbs. (+10 HP)` };
}

/** Pray at a shrine: small free heal, once per day. */
export function prayAtShrine(S) {
  const key = 'shrine_bless_' + St.dateKey(S);
  if (St.getFlag(S, key)) {
    return { ok: false, msg: 'The kami have already blessed you today. Return tomorrow.' };
  }
  St.setFlag(S, key, true);
  St.healPlayer(S, 25);
  return { ok: true, msg: 'You bow twice, clap twice, and feel a gentle warmth settle over you. (+25 HP)' };
}

const HOUSE_FLAVOR = [
  'No answer — only the wind in the eaves.',
  'A dog barks once inside, then thinks better of it.',
  'Shutters creak. Nobody comes to the door.',
  'You hear soft humming from within, but no one answers.',
  'An old woman peers through the lattice, then slides it shut.',
];

/** Knock on a house door: deterministic flavor text. */
export function knockHouse(S, bldgId) {
  const r = rng('house:' + bldgId + ':' + St.dateKey(S));
  return _pick(r, HOUSE_FLAVOR);
}
