// mapgen.js — procedural infinite map generation for Aiko-Onmyoji.
//
// Pure ES module: no imports, no DOM, no Math.random. Every random choice
// flows from rng('mapgen:' + id), so genMap(id) returns byte-identical maps
// on every call. tilemaps.js serves these for ids like "gen_forest_12".
//
// Map shape matches the hand-authored MAPS entries in tilemaps.js:
//   { id, name, sceneType, tiles, spawns, npcSpots, genNpcs, warps,
//     lockedDoors, buildings }
// Tiles are 18 rows of 24 chars using the tilemaps.js legend, plus building
// chars: 'h' house, 'b' bar, 'p' brothel, 's' shop/weaponsmith, 'i' inn,
// 'r' shrine hall. Buildings block movement like walls.
'use strict';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32 from an xfnv1a string hash) — same pattern as sprites.js.

function xfnv1a(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seedStr) {
  let a = xfnv1a(seedStr);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------

export const SCENE_TYPES = [
  'village', 'town', 'small_city', 'big_city', 'outskirt', 'forest', 'river',
  'cave', 'wilderness', 'palace', 'ship', 'shrine', 'battlefield',
];

const W = 24, H = 18;

const SCENE_LABEL = {
  village: 'Village', town: 'Town', small_city: 'Small City', big_city: 'Big City',
  outskirt: 'Outskirts', forest: 'Forest', river: 'River', cave: 'Cave',
  wilderness: 'Wilderness', palace: 'Palace', ship: 'Ship', shrine: 'Shrine',
  battlefield: 'Battlefield',
};

// Hand-map display names, for warp labels pointing at authored maps.
// Kept local (duplicated from tilemaps.js) so this module stays dependency-free.
const HAND_NAMES = {
  azuchi: 'Azuchi — Castle Town',
  kofu: 'Kofu — Mountain Town',
  kasugayama: 'Kasugayama — Mountain Fortress',
  kyoto: 'Kyoto — Imperial Capital',
  sakai: 'Sakai — Port Town',
  gifu: 'Gifu — Castle Town',
  kutsuki: 'Kutsuki — Mountain Village',
  otsu: 'Otsu — Lakeside',
  shrine: 'Forest Shrine',
  hiei: 'Mt. Hiei — Mountain Temple',
};

const DIRS = ['north', 'south', 'east', 'west'];
const OPP = { north: 'south', south: 'north', east: 'west', west: 'east' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const GEN_RE = /^gen_([a-z_]+)_(\d+)$/;

/** True for procedurally generated map ids ("gen_<scene>_<n>"). */
export function isGenId(id) { return GEN_RE.test(String(id)); }

/** Parse a gen id into { scene, n }, or null when it is not a gen id. */
export function parseGenId(id) {
  const m = GEN_RE.exec(String(id));
  if (!m) return null;
  return { scene: m[1], n: parseInt(m[2], 10) };
}

/**
 * Neighbor map id in direction `dir` from `parentId`. Scene and number come
 * from rng('nb:' + parentId + ':' + dir), so the result is stable.
 */
export function neighborFor(parentId, dir) {
  const r = rng('nb:' + parentId + ':' + dir);
  const scene = SCENE_TYPES[(r() * SCENE_TYPES.length) | 0];
  const n = 1 + ((r() * 900) | 0);
  return 'gen_' + scene + '_' + n;
}

/** Display name for a map id without generating the map. */
export function neighborName(id) {
  const s = String(id || '');
  if (HAND_NAMES[s]) return HAND_NAMES[s];
  const p = parseGenId(s);
  if (p && SCENE_LABEL[p.scene]) return SCENE_LABEL[p.scene] + ' #' + p.n;
  return 'Unknown Land';
}

// ---------------------------------------------------------------------------
// Grid helpers.

function makeGrid(fill) {
  const g = new Array(H);
  for (let y = 0; y < H; y++) g[y] = new Array(W).fill(fill);
  return g;
}
const inB = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
function put(g, x, y, ch) { if (inB(x, y)) g[y][x] = ch; }
function get(g, x, y) { return inB(x, y) ? g[y][x] : ' '; }

const WALK_CH = new Set(['.', ',', '=', '+', '*', 'B', 'S']);
const isWalk = (ch) => WALK_CH.has(ch);
// Tiles a road/tunnel/building may overwrite.
const CARVE_OK = new Set(['.', ',', '*', 'T', 'o', '=', '+']);
const BUILD_CHARS = new Set(['h', 'b', 'p', 's', 'i', 'r']);
const isBuildingChar = (c) => BUILD_CHARS.has(c);

const pick = (r, arr) => arr[(r() * arr.length) | 0];
function shuffled(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// ---------------------------------------------------------------------------
// Reusable map pieces. All draw from the passed rng stream.

/** Soft-edged blob of `ch` around (cx, cy); only overwrites tiles in `only`. */
function blob(g, r, cx, cy, rad, ch, only) {
  for (let y = cy - rad - 1; y <= cy + rad + 1; y++) {
    for (let x = cx - rad - 1; x <= cx + rad + 1; x++) {
      if (!inB(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rad + (r() < 0.4 ? 0.7 : -0.3)) {
        if (!only || only.has(get(g, x, y))) put(g, x, y, ch);
      }
    }
  }
}

function treeCluster(g, r) {
  blob(g, r, 2 + ((r() * (W - 4)) | 0), 2 + ((r() * (H - 4)) | 0),
    1 + ((r() * 2) | 0), 'T', CARVE_OK);
}

function scatter(g, r, ch, n, only) {
  const set = only || CARVE_OK;
  for (let i = 0; i < n; i++) {
    const x = (r() * W) | 0, y = (r() * H) | 0;
    if (set.has(get(g, x, y))) put(g, x, y, ch);
  }
}

function pond(g, r) {
  const cx = 3 + ((r() * (W - 6)) | 0), cy = 3 + ((r() * (H - 6)) | 0);
  blob(g, r, cx, cy, 1 + ((r() * 2) | 0), '~', CARVE_OK);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (get(g, x, y) === '~') continue;
    let near = false;
    if (get(g, x + 1, y) === '~' || get(g, x - 1, y) === '~' ||
        get(g, x, y + 1) === '~' || get(g, x, y - 1) === '~') near = true;
    if (near && CARVE_OK.has(get(g, x, y))) put(g, x, y, ',');
  }
}

/** North-south river band with a bridge; returns { x0, wd, by }. */
function riverBand(g, r) {
  const x0 = 5 + ((r() * (W - 12)) | 0);
  const wd = 2 + ((r() * 2) | 0);
  for (let y = 0; y < H; y++) for (let x = x0; x < x0 + wd; x++) put(g, x, y, '~');
  for (let y = 0; y < H; y++) {
    if (CARVE_OK.has(get(g, x0 - 1, y)) && r() < 0.7) put(g, x0 - 1, y, ',');
    if (CARVE_OK.has(get(g, x0 + wd, y)) && r() < 0.7) put(g, x0 + wd, y, ',');
  }
  const by = 3 + ((r() * (H - 6)) | 0);
  for (let x = x0 - 1; x <= x0 + wd; x++) put(g, x, by, 'B');
  return { x0, wd, by };
}

function hRoad(g, x0, x1, y) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    if (CARVE_OK.has(get(g, x, y))) put(g, x, y, '+');
}
function vRoad(g, y0, y1, x) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    if (CARVE_OK.has(get(g, x, y))) put(g, x, y, '+');
}

/** Tent camp: '=' patches. */
function campTents(g, r, n) {
  for (let i = 0; i < n; i++) {
    const w = 2 + ((r() * 2) | 0), h = 2;
    const x = 1 + ((r() * (W - w - 2)) | 0), y = 1 + ((r() * (H - h - 2)) | 0);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
      if (CARVE_OK.has(get(g, xx, yy))) put(g, xx, yy, '=');
  }
}

/** Defensive wall ring with gate gaps. */
function wallRing(g, r) {
  const m = 1 + ((r() * 2) | 0);
  for (let x = m; x < W - m; x++) {
    if (CARVE_OK.has(get(g, x, m))) put(g, x, m, '#');
    if (CARVE_OK.has(get(g, x, H - 1 - m))) put(g, x, H - 1 - m, '#');
  }
  for (let y = m; y < H - m; y++) {
    if (CARVE_OK.has(get(g, m, y))) put(g, m, y, '#');
    if (CARVE_OK.has(get(g, W - 1 - m, y))) put(g, W - 1 - m, y, '#');
  }
  const gx = m + 2 + ((r() * (W - 2 * m - 4)) | 0);
  const gy = m + 2 + ((r() * (H - 2 * m - 4)) | 0);
  put(g, gx, m, '+'); put(g, gx, H - 1 - m, '+');
  put(g, m, gy, '+'); put(g, W - 1 - m, gy, '+');
}

/** Ship deck of '=' on water with masts ('o'). */
function shipDeck(g, r, cx, cy) {
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 3; x <= cx + 3; x++) put(g, x, y, '=');
  for (let y = cy - 1; y <= cy + 1; y++) { put(g, cx - 4, y, '='); put(g, cx + 4, y, '='); }
  put(g, cx - 1, cy, 'o'); put(g, cx + 1, cy - 1, 'o'); // masts
  void r;
}

/** Carve rock chambers + connecting tunnels into a rock-filled grid. */
function caveChamber(g, r) {
  const centers = [];
  const n = 1 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const w = 6 + ((r() * 6) | 0), h = 4 + ((r() * 4) | 0);
    const x = 2 + ((r() * (W - w - 4)) | 0), y = 2 + ((r() * (H - h - 4)) | 0);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(g, xx, yy, '=');
    centers.push([x + (w >> 1), y + (h >> 1)]);
  }
  for (let i = 1; i < centers.length; i++) {
    const [ax, ay] = centers[i - 1], [bx, by] = centers[i];
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) put(g, x, ay, '=');
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) put(g, bx, y, '=');
  }
}

/** Shrine grounds: sand, 'r' hall, stone path, trees. Calls onHall(rect). */
function shrineGrounds(g, r, onHall) {
  const hx = (W >> 1) - 2, hy = 3;
  for (let y = hy; y < hy + 3; y++) for (let x = hx; x < hx + 4; x++) put(g, x, y, 'r');
  if (onHall) onHall({ x: hx, y: hy });
  for (let y = hy + 3; y < H - 1; y++) {
    if (CARVE_OK.has(get(g, 12, y))) put(g, 12, y, '=');
  }
  for (let i = 0; i < 5; i++) treeCluster(g, r);
}

/**
 * Place a 3x3 / 4x3 building rect of `ch` on clear ground.
 * Returns the rect or null when no spot was found.
 */
function houseBlock(g, r, ch) {
  for (let tries = 0; tries < 28; tries++) {
    const w = r() < 0.5 ? 3 : 4, h = 3;
    const x = 1 + ((r() * (W - w - 2)) | 0), y = 1 + ((r() * (H - h - 2)) | 0);
    let ok = true;
    for (let yy = y - 1; yy <= y + h && ok; yy++) {
      for (let xx = x - 1; xx <= x + w && ok; xx++) {
        const c = get(g, xx, yy);
        if (!CARVE_OK.has(c) || isBuildingChar(c)) ok = false;
      }
    }
    if (!ok) continue;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(g, xx, yy, ch);
    return { x, y, w, h };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Buildings.

const KIND_CHAR = {
  house: 'h', bar: 'b', brothel: 'p', shop: 's', weaponsmith: 's', inn: 'i', shrine: 'r',
};

const SURNAMES = ['Yamada', 'Tanaka', 'Suzuki', 'Sato', 'Watanabe', 'Ito', 'Kato',
  'Yoshida', 'Mori', 'Shimizu', 'Abe', 'Ikeda', 'Hashimoto', 'Ishikawa',
  'Yamamoto', 'Fujita', 'Okada', 'Nishimura'];
const BAR_NAMES = ['Drunken Crane', 'Plum Blossom', 'Pale Moon', 'Black Pine', 'River Fox', 'Golden Turtle'];
const INN_NAMES = ['White Heron', 'Sleeping Carp', 'Red Maple', 'Quiet Pond', 'Twin Pines'];
const SHRINE_NAMES = ['Hachiman', 'Inari', 'Tenjin', 'Suwa', 'Kumano'];

const houseName = (r) => pick(r, SURNAMES) + ' House';
const shopName = (r) => pick(r, SURNAMES) + ' Goods';
const smithName = (r) => pick(r, SURNAMES) + ' Blades';
const barName = (r) => "Bar '" + pick(r, BAR_NAMES) + "'";
const innName = (r) => pick(r, INN_NAMES) + ' Inn';
const brothelName = (r) => 'House of the ' + pick(r, ['Plum', 'Peony', 'Willow', 'Chrysanthemum']) + ' Blossom';
const shrineName = (r) => pick(r, SHRINE_NAMES) + ' Shrine';
const hutName = () => "Hunter's Hut";

// ---------------------------------------------------------------------------
// Generated NPCs.

const MALE_NAMES = ['Taro', 'Jiro', 'Heiji', 'Gonta', 'Kichi', 'Yohei', 'Denzo', 'Magoichi', 'Kyuzo', 'Shinza'];
const FEMALE_NAMES = ['Hana', 'Yuki', 'Kiku', 'Ume', 'Sakura', 'Fuji', 'Aya', 'Rin', 'Tama', 'Suzu'];

const ARCH_BY_SCENE = {
  village: ['villager_woman', 'merchant', 'elder', 'monk', 'samurai'],
  town: ['merchant', 'samurai', 'villager_woman', 'elder', 'ninja', 'soldier'],
  small_city: ['merchant', 'samurai', 'villager_woman', 'ninja', 'soldier', 'courtesan', 'elder'],
  big_city: ['merchant', 'samurai', 'ninja', 'soldier', 'courtesan', 'noble', 'elder'],
  palace: ['noble', 'samurai', 'monk', 'elder', 'courtesan'],
  outskirt: ['villager_woman', 'monk', 'elder', 'bandit'],
  forest: ['monk', 'elder', 'bandit', 'villager_woman'],
  wilderness: ['monk', 'elder', 'bandit', 'villager_woman'],
  river: ['monk', 'elder', 'villager_woman', 'bandit'],
  cave: ['bandit', 'monk'],
  ship: ['merchant', 'samurai', 'monk'],
  shrine: ['miko', 'monk', 'elder', 'villager_woman'],
  battlefield: ['soldier', 'samurai', 'bandit', 'monk'],
};

const ARCH_DESC = {
  villager_woman: 'A plain-dressed villager going about her day.',
  merchant: 'A traveling peddler with a heavy pack.',
  samurai: 'A masterless swordsman with a watchful gaze.',
  monk: 'A wandering monk, staff in hand.',
  elder: 'A white-haired elder leaning on a cane.',
  ninja: 'A shadowy figure in dark clothes, barely noticed.',
  soldier: 'An ashigaru soldier on patrol.',
  bandit: 'A rough-looking ruffian with a scarred cheek.',
  courtesan: 'A painted lady in a fine silk kimono.',
  miko: 'A shrine maiden in red and white.',
  noble: 'A court noble in layered robes.',
};
const FEMALE_ARCH = new Set(['villager_woman', 'courtesan', 'miko']);

// ---------------------------------------------------------------------------
// Scene layouts.

const BASE_FILL = { cave: 'o', ship: '~', shrine: ',' };

function buildScene(g, r, scene, id, buildings, hints) {
  const addB = (kind, name) => {
    const rect = houseBlock(g, r, KIND_CHAR[kind] || 'h');
    if (!rect) return;
    buildings.push({
      id: 'gen_' + id + '_b' + buildings.length,
      kind, name,
      x: rect.x + (rect.w >> 1), y: rect.y + 1, // door-side center tile
    });
  };
  const nBuild = (pool, n) => {
    for (const [kind, nm] of shuffled(r, pool).slice(0, n)) addB(kind, nm(r));
  };

  switch (scene) {
    case 'village': {
      hRoad(g, 0, W - 1, 8 + ((r() * 3) | 0));
      vRoad(g, 0, H - 1, 11 + ((r() * 3) | 0));
      scatter(g, r, 'T', 14); scatter(g, r, 'o', 5); scatter(g, r, '*', 10);
      treeCluster(g, r); treeCluster(g, r);
      if (r() < 0.35) pond(g, r);
      nBuild([['house', houseName], ['house', houseName], ['shop', shopName],
        ['inn', innName], ['shrine', shrineName], ['house', houseName]], 3 + ((r() * 3) | 0));
      break;
    }
    case 'town': {
      for (const y of [4, 9, 14]) hRoad(g, 0, W - 1, y);
      for (const x of [6, 12, 18]) vRoad(g, 0, H - 1, x);
      scatter(g, r, 'T', 6); scatter(g, r, '*', 6);
      nBuild([['house', houseName], ['bar', barName], ['shop', shopName],
        ['inn', innName], ['weaponsmith', smithName], ['shrine', shrineName],
        ['house', houseName]], 4 + ((r() * 3) | 0));
      break;
    }
    case 'small_city': {
      for (const y of [4, 9, 14]) hRoad(g, 0, W - 1, y);
      for (const x of [6, 12, 18]) vRoad(g, 0, H - 1, x);
      if (r() < 0.5) wallRing(g, r);
      scatter(g, r, 'T', 4); scatter(g, r, '*', 4);
      nBuild([['house', houseName], ['house', houseName], ['bar', barName],
        ['brothel', brothelName], ['shop', shopName], ['weaponsmith', smithName],
        ['inn', innName]], 5 + ((r() * 3) | 0));
      break;
    }
    case 'big_city': {
      for (const y of [3, 7, 11, 15]) hRoad(g, 0, W - 1, y);
      for (const x of [5, 11, 17]) vRoad(g, 0, H - 1, x);
      wallRing(g, r);
      scatter(g, r, '*', 4);
      nBuild([['house', houseName], ['bar', barName], ['brothel', brothelName],
        ['shop', shopName], ['weaponsmith', smithName], ['inn', innName],
        ['shrine', shrineName], ['house', houseName]], 6 + ((r() * 3) | 0));
      break;
    }
    case 'palace': {
      wallRing(g, r);
      blob(g, r, 12, 9, 4, '=', CARVE_OK); // courtyard
      hRoad(g, 4, W - 5, 9); vRoad(g, 2, H - 3, 12);
      scatter(g, r, 'T', 8); scatter(g, r, '*', 8);
      const halls = shuffled(r, [
        ['house', () => 'Palace Hall'], ['house', () => 'North Hall'],
        ['house', () => 'West Hall'], ['shrine', () => 'Shrine Hall'],
        ['house', () => 'East Hall'], ['inn', () => 'Guest House'],
      ]);
      for (const [kind, nm] of halls.slice(0, 4 + ((r() * 3) | 0))) addB(kind, nm(r));
      break;
    }
    case 'outskirt': {
      hRoad(g, 0, W - 1, 8 + ((r() * 4) | 0));
      scatter(g, r, 'T', 18); scatter(g, r, 'o', 6); scatter(g, r, '*', 8);
      treeCluster(g, r);
      if (r() < 0.3) pond(g, r);
      nBuild([['house', houseName], ['house', houseName], ['shrine', shrineName]], 1 + ((r() * 3) | 0));
      break;
    }
    case 'forest': {
      for (let i = 0; i < 9; i++) treeCluster(g, r);
      scatter(g, r, 'T', 24);
      for (let i = 0; i < 2; i++) // clearings
        blob(g, r, 3 + ((r() * (W - 6)) | 0), 3 + ((r() * (H - 6)) | 0), 2, '.', new Set(['T']));
      if (r() < 0.5) nBuild([['house', hutName], ['shrine', shrineName]], 1);
      break;
    }
    case 'river': {
      const { by } = riverBand(g, r);
      hints.edgeY = { east: by, west: by }; // edge warps use the bridge row
      hRoad(g, 0, W - 1, by);
      scatter(g, r, 'T', 12); scatter(g, r, 'o', 4); scatter(g, r, '*', 8);
      if (r() < 0.45) nBuild([['house', hutName], ['shrine', shrineName]], 1);
      break;
    }
    case 'cave': {
      hints.floor = '='; // tunnels are carved floor, not road
      caveChamber(g, r);
      if (r() < 0.5) campTents(g, r, 1);
      scatter(g, r, 'o', 6, new Set(['='])); // stalagmites
      break;
    }
    case 'wilderness': {
      scatter(g, r, 'T', 16); scatter(g, r, 'o', 8); scatter(g, r, '*', 6);
      treeCluster(g, r); treeCluster(g, r);
      if (r() < 0.4) pond(g, r);
      if (r() < 0.35) nBuild([['house', hutName], ['shrine', shrineName]], 1);
      break;
    }
    case 'ship': {
      const cx = 12, cy = 9;
      shipDeck(g, r, cx, cy);
      // gangway piers to all four edges
      for (let y = 0; y <= cy - 2; y++) { put(g, cx - 1, y, '='); put(g, cx, y, '='); }
      for (let y = cy + 2; y < H; y++) { put(g, cx - 1, y, '='); put(g, cx, y, '='); }
      for (let x = 0; x <= cx - 4; x++) { put(g, x, cy - 1, '='); put(g, x, cy, '='); }
      for (let x = cx + 4; x < W; x++) { put(g, x, cy - 1, '='); put(g, x, cy, '='); }
      hints.edgeX = { north: cx - 1, south: cx };
      hints.edgeY = { east: cy - 1, west: cy };
      break;
    }
    case 'shrine': {
      shrineGrounds(g, r, (rect) => {
        buildings.push({
          id: 'gen_' + id + '_b' + buildings.length, kind: 'shrine',
          name: shrineName(r), x: rect.x + 2, y: rect.y + 1,
        });
      });
      scatter(g, r, 'T', 8); scatter(g, r, '*', 6); scatter(g, r, 'o', 3);
      break;
    }
    case 'battlefield': {
      for (let i = 0; i < 4; i++) // scorch marks
        blob(g, r, (r() * W) | 0, (r() * H) | 0, 2, ',', CARVE_OK);
      campTents(g, r, 3);
      scatter(g, r, 'o', 8); scatter(g, r, 'T', 5);
      hRoad(g, 0, W - 1, 9);
      break;
    }
    default: {
      scatter(g, r, 'T', 10); scatter(g, r, '*', 6);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Warps, spawn, NPC placement.

/**
 * Place a warp on the `dir` edge: pick a walkable edge tile near the edge
 * center (edge hints may pin it, e.g. the bridge row), then carve a road
 * from a few tiles inside out to the edge. Returns [x, y].
 */
function placeWarp(g, r, dir, hints) {
  const floor = hints.floor || '+';
  const okEdge = (c) => c !== '~' && c !== ' ' && !isBuildingChar(c);
  const lay = (x, y) => {
    const c = get(g, x, y);
    if (isBuildingChar(c)) return;
    if (c === '~') { put(g, x, y, 'B'); return; } // plank over water
    if (c === '#' || CARVE_OK.has(c)) put(g, x, y, floor); // punch gates too
  };
  if (dir === 'north' || dir === 'south') {
    const y = dir === 'north' ? 0 : H - 1;
    let x = hints.edgeX && hints.edgeX[dir] != null ? hints.edgeX[dir] : 10 + ((r() * 4) | 0);
    for (let off = 0; off < 9; off++) {
      let done = false;
      for (const sx of [x + off, x - off]) {
        if (sx < 1 || sx > W - 2) continue;
        if (okEdge(get(g, sx, y))) { x = sx; done = true; break; }
      }
      if (done) break;
    }
    const yIn = dir === 'north' ? y + 5 : y - 5;
    for (let yy = Math.min(y, yIn); yy <= Math.max(y, yIn); yy++) lay(x, yy);
    return [x, y];
  }
  const x = dir === 'west' ? 0 : W - 1;
  let y = hints.edgeY && hints.edgeY[dir] != null ? hints.edgeY[dir] : 7 + ((r() * 4) | 0);
  for (let off = 0; off < 7; off++) {
    let done = false;
    for (const sy of [y + off, y - off]) {
      if (sy < 1 || sy > H - 2) continue;
      if (okEdge(get(g, x, sy))) { y = sy; done = true; break; }
    }
    if (done) break;
  }
  const xIn = dir === 'west' ? x + 5 : x - 5;
  for (let xx = Math.min(x, xIn); xx <= Math.max(x, xIn); xx++) lay(xx, y);
  return [x, y];
}

/**
 * Walkable tile near the center of `edge`, for warp arrival targets.
 * Deterministic scan outward from the edge center.
 */
function edgeSpawn(g, edge) {
  const cx = W >> 1, cy = H >> 1;
  const tryAt = (x, y) => inB(x, y) && isWalk(get(g, x, y));
  if (edge === 'north' || edge === 'south') {
    const y0 = edge === 'north' ? 0 : H - 1, dy = edge === 'north' ? 1 : -1;
    for (let y = y0; y >= 0 && y < H; y += dy)
      for (let off = 0; off <= cx; off++)
        for (const x of off === 0 ? [cx] : [cx + off, cx - off])
          if (tryAt(x, y)) return [x, y];
  } else {
    const x0 = edge === 'west' ? 0 : W - 1, dx = edge === 'west' ? 1 : -1;
    for (let x = x0; x >= 0 && x < W; x += dx)
      for (let off = 0; off <= cy; off++)
        for (const y of off === 0 ? [cy] : [cy + off, cy - off])
          if (tryAt(x, y)) return [x, y];
  }
  return [cx, cy];
}

/** Walkable tile nearest the map center. */
function findSpawn(g) {
  const cx = W >> 1, cy = H >> 1;
  for (let rad = 0; rad < 12; rad++)
    for (let y = cy - rad; y <= cy + rad; y++)
      for (let x = cx - rad; x <= cx + rad; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== rad) continue;
        if (inB(x, y) && isWalk(get(g, x, y))) return [x, y];
      }
  return [cx, cy];
}

/** BFS walkable region from (sx, sy); returns a Set of "x,y" keys. */
function bfsReachable(g, sx, sy) {
  const seen = new Set([sx + ',' + sy]);
  const q = [[sx, sy]];
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of D) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (!inB(nx, ny) || seen.has(k)) continue;
      if (!isWalk(get(g, nx, ny))) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

function placeNpcs(g, r, id, scene, reachable) {
  const npcSpots = {}, genNpcs = {};
  const archs = ARCH_BY_SCENE[scene] || ARCH_BY_SCENE.wilderness;
  const reachArr = [...reachable];
  const n = 2 + ((r() * 4) | 0); // 2-5 NPCs
  for (let i = 0; i < n; i++) {
    const arch = pick(r, archs);
    const gender = FEMALE_ARCH.has(arch) ? 'f' : (r() < 0.5 ? 'm' : 'f');
    const given = gender === 'f' ? pick(r, FEMALE_NAMES) : pick(r, MALE_NAMES);
    const nid = 'gen_' + id + '_villager' + i;
    let spot = null;
    for (let t = 0; t < 40 && !spot; t++) {
      const x = (r() * W) | 0, y = (r() * H) | 0;
      if (isWalk(get(g, x, y))) spot = [x, y];
    }
    if (!spot) spot = [W >> 1, H >> 1];
    if (!reachable.has(spot[0] + ',' + spot[1]) && reachArr.length) {
      spot = reachArr[(r() * reachArr.length) | 0].split(',').map(Number);
    }
    npcSpots[nid] = spot;
    genNpcs[nid] = {
      name: pick(r, SURNAMES) + ' ' + given,
      archetype: arch,
      gender,
      desc: ARCH_DESC[arch] || 'A traveler passing through.',
      location: id,
      adult: false,
    };
  }
  return { npcSpots, genNpcs };
}

// ---------------------------------------------------------------------------
/**
 * Generate the full map object for a gen id.
 *
 * @param {string} id - "gen_<scene>_<n>"
 * @param {object} [linkOverrides] - {north:id, south:id, east:id, west:id};
 *   replaces the generated warp target for that edge (for bidirectional links).
 */
export function genMap(id, linkOverrides) {
  const sid = String(id);
  const parsed = parseGenId(sid);
  const scene = parsed && SCENE_TYPES.indexOf(parsed.scene) >= 0 ? parsed.scene : 'wilderness';
  const r = rng('mapgen:' + sid);
  const g = makeGrid(BASE_FILL[scene] || '.');
  const buildings = [];
  const hints = {};
  buildScene(g, r, scene, sid, buildings, hints);

  // Edge warps, with roads carved out to each edge.
  const links = linkOverrides || {};
  const warps = [];
  for (const dir of DIRS) {
    const [x, y] = placeWarp(g, r, dir, hints);
    const to = links[dir] || neighborFor(sid, dir);
    warps.push({
      x, y,
      to,
      ts: edgeSpawn(g, OPP[dir]), // arrive near the opposite edge of the target
      label: cap(dir) + ' road — ' + neighborName(to),
    });
  }

  const spawn = findSpawn(g);
  const reachable = bfsReachable(g, spawn[0], spawn[1]);
  const { npcSpots, genNpcs } = placeNpcs(g, r, sid, scene, reachable);

  return {
    id: sid,
    name: parsed && SCENE_LABEL[scene] ? SCENE_LABEL[scene] + ' #' + parsed.n : neighborName(sid),
    sceneType: scene,
    tiles: g.map((row) => row.join('')),
    spawns: { player: spawn },
    npcSpots,
    genNpcs,
    warps,
    lockedDoors: [],
    buildings,
  };
}
