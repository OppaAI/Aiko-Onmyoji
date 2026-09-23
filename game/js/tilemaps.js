// game/js/tilemaps.js — tile-based maps for free-roam movement (Dragon Knight 4 style).
// ES module, no dependencies. Grids are stored as ASCII strings; movement is
// arrow-key step or click-to-move (see findPath).
//
// NOTE: `import { T } from './sprites.js'` is intentionally not live yet —
// sprites.js (the pixel-sprite composer) has not been authored. T (tile size
// in px) will size rendering once sprites.js exists.
//
// Legend: '.'=GRASS ','=SAND '~'=WATER 'T'=TREE 'o'=ROCK '#'=WALL '='=FLOOR
//         'D'=DOOR '+'=ROAD '*'=FLOWER 'B'=BRIDGE ' '=VOID 'S'=STAIR
//         'h'=HOUSE 'b'=BAR 'p'=BROTHEL 's'=SHOP 'i'=INN 'r'=SHRINE (buildings)
// Walkable for the player: GRASS SAND FLOOR ROAD FLOWER BRIDGE STAIR
//   (DOOR only when unlocked). Blocked: WATER TREE ROCK WALL VOID + buildings.
// Aiko (spirit) ignores everything except VOID.
//
// Procedural maps: ids like "gen_forest_12" are generated on demand by
// mapgen.js (see getMap). Hand-authored MAPS below are untouched.

import * as MG from './mapgen.js';

const W = 24, H = 18;

export const MAPS = {
  azuchi: {
    name: "Azuchi — Castle Town",
    tiles: [
      "####################+###",
      "#...................+..#",
      "#...........########+..#",
      "#.####......#=####=#+..#",
      "#.#==#......#=#==#=#+..#",
      "#.####......==#D##=#+*.#",
      "#..........+#======#+..#",
      "#....**....+########+..#",
      "#..........+........+..#",
      "++++++++++++++++++++++++",
      "#..........+...........#",
      "#.####.....+......####.#",
      "#.#==#.....+....*.#==#.#",
      "#.####.....+......####.#",
      "#..........+...........#",
      "#..*.......+...........#",
      "#..........+...........#",
      "########################",
    ],
    spawns: { player: [11,15] },
    npcSpots: { princess_iroha: [13,4], musha_ayame: [11,10] },
    warps: [
      { x: 0, y: 9, to: 'kyoto', ts: [1,9], label: "West road — Kyoto" },
      { x: 23, y: 9, to: 'gifu', ts: [1,9], label: "East road — Gifu" },
      { x: 20, y: 0, to: 'kofu', ts: [12,17], label: "Mountain pass — Kofu" },
    ],
    lockedDoors: [
      { x: 15, y: 5, flag: 'door_azuchi_inner', name: "Inner Gate" },
    ],
  },
  kofu: {
    name: "Kofu — Mountain Town",
    tiles: [
      "............+...........",
      "............+...........",
      "..TT....T...+..T....T.T.",
      "..T.T.......+........T..",
      ".......o....+...o.......",
      "............+...........",
      ".....T..####+.....T.....",
      "........#==#+...........",
      "....o...+++++......o....",
      "......*.....+....*......",
      "............+...........",
      "............+####.......",
      "......T.....+#==#T......",
      "............+++++.......",
      "..T.T.......+.......T.T.",
      "...T....o...+..o.....T..",
      "........T...+..T........",
      "............+...........",
    ],
    spawns: { player: [12,14] },
    npcSpots: { princess_yu: [13,9] },
    warps: [
      { x: 12, y: 0, to: 'kasugayama', ts: [11,17], label: "Mountain pass — Kasugayama" },
      { x: 12, y: 17, to: 'azuchi', ts: [20,1], label: "Mountain pass — Azuchi" },
    ],
    lockedDoors: [
    ],
  },
  kasugayama: {
    name: "Kasugayama — Mountain Fortress",
    tiles: [
      "........................",
      ".......##########.......",
      "..T....#==#####=#...T...",
      "...T...#==#===#=#....T..",
      ".......#==##=##=#.......",
      ".....o.#========#.o.....",
      ".......####=#####.......",
      "...........S............",
      "...........S............",
      ".....T.....+......T.....",
      "...........+............",
      "...........+............",
      "......o....+.....o......",
      "...........+............",
      "..T........+........T...",
      "...T.......+.........T..",
      "...........+............",
      "...........+............",
    ],
    spawns: { player: [11,14] },
    npcSpots: { princess_setsu: [9,3] },
    warps: [
      { x: 11, y: 17, to: 'kofu', ts: [12,1], label: "Mountain path — Kofu" },
    ],
    lockedDoors: [
    ],
  },
  kyoto: {
    name: "Kyoto — Imperial Capital",
    tiles: [
      "......+.....+.....+.....",
      "..###.+.....+.....+...*.",
      "..###.+.....+...*.+.....",
      "......+.....+.....+.....",
      "++++++++++++++++++++++++",
      "......+.###.+.####+.##..",
      "......+.#=#.+.#==#+.##..",
      "......+.###.+.####+.##..",
      "......+....*+.....+.....",
      "++++++++++++++++++++++++",
      "..###.+.###.+.###.+.....",
      "..###.+.#=#.+.###.+.....",
      "......+.###.+.....+.....",
      "++++++++++++++++++++++++",
      "..####+.....+.###.+.##..",
      "..####+.....+.#=#.+.##..",
      ".*....+.....+.###.+.....",
      "......+.....+.....+.....",
    ],
    spawns: { player: [12,15] },
    npcSpots: { lady_tsubaki: [13,10], dancer_koharu: [7,5], noble_fujiwara: [19,14] },
    warps: [
      { x: 23, y: 9, to: 'azuchi', ts: [1,9], label: "East road — Azuchi" },
      { x: 12, y: 17, to: 'sakai', ts: [12,1], label: "South road — Sakai" },
      { x: 0, y: 9, to: 'shrine', ts: [22,9], label: "West road — Forest Shrine" },
      { x: 18, y: 0, to: 'hiei', ts: [12,16], label: "North trail — Mt. Hiei" },
    ],
    lockedDoors: [
    ],
  },
  sakai: {
    name: "Sakai — Port Town",
    tiles: [
      "............+...........",
      "............+...........",
      "............+...........",
      "...####.....+...####....",
      "...#==#.....+...#==#....",
      "...####.....+...####....",
      "............+...........",
      "............+...........",
      "......###...+...........",
      "......#=#...+...........",
      ".++++++++++++++++++++++.",
      "............+...........",
      "..........BB+...........",
      ",,,,,,,,,,BB+,,,,,,,,,,,",
      "~~~~~~~~~~BB~~~~~~~~~~~~",
      "~~~~~~~~~~BB~~~~~~~~~~~~",
      "~~~~~~~~~~BB~~~~~~~~~~~~",
      "~~~~~~~~~~BB~~~~~~~~~~~~",
    ],
    spawns: { player: [12,8] },
    npcSpots: { merchant_yae: [9,10], merchant_daijiro: [13,10] },
    warps: [
      { x: 12, y: 0, to: 'kyoto', ts: [12,16], label: "North road — Kyoto" },
      { x: 23, y: 10, to: 'otsu', ts: [1,11], label: "East road — Otsu" },
    ],
    lockedDoors: [
    ],
  },
  gifu: {
    name: "Gifu — Castle Town",
    tiles: [
      "...........+............",
      ".T.........+..........T.",
      "...........+............",
      "...####....+.....####...",
      "...#==#..##+###..#==#...",
      "...####..#=+==#..####...",
      "......T..#=+==#...T.....",
      ".........##+###.........",
      "...........+............",
      "++++++++++++++++++++++++",
      "...........+............",
      "...........+............",
      "...####....+.....####...",
      "...#==#....+.....#==#...",
      "...####....+.....####...",
      "...........+............",
      ".T.........+..........T.",
      "...........+............",
    ],
    spawns: { player: [11,14] },
    npcSpots: { innkeep_okiku: [11,5], samurai_tetsuzo: [8,10] },
    warps: [
      { x: 0, y: 9, to: 'kutsuki', ts: [22,9], label: "West road — Kutsuki" },
      { x: 23, y: 9, to: 'azuchi', ts: [1,9], label: "East road — Azuchi" },
    ],
    lockedDoors: [
    ],
  },
  kutsuki: {
    name: "Kutsuki — Mountain Village",
    tiles: [
      "............+...........",
      "............+...........",
      "..,,*,,,....+.T.,,,,,,..",
      "..,*,,,,....+...,*,,,,..",
      "..,,,*,,....+...,,,*,,..",
      "..,,,,,,....+...,,*,,,..",
      ".........###+...........",
      ".........#==+...........",
      ".........###+...........",
      "++++++++++++++++++++++++",
      "............+...........",
      "............+####.......",
      "............+#==#.......",
      "............+####.......",
      "..........T.+...........",
      "............+...........",
      ".T..........+.........T.",
      "............+...........",
    ],
    spawns: { player: [12,13] },
    npcSpots: { widow_hanae: [10,9], elder_mosuke: [14,10] },
    warps: [
      { x: 23, y: 9, to: 'gifu', ts: [1,9], label: "East road — Gifu" },
      { x: 12, y: 0, to: 'otsu', ts: [5,16], label: "North path — Otsu" },
    ],
    lockedDoors: [
    ],
  },
  otsu: {
    name: "Otsu — Lakeside",
    tiles: [
      "........................",
      "........................",
      "..T...T.................",
      "....T...................",
      "........................",
      ".......o................",
      ".........,~~~~~~~~~~~~~~",
      ".........,~~~~~~~~~~~~~~",
      "...o.....,~~~~~~~~~~~~~~",
      ".........,~~~~~~....~~~~",
      "...###...,~~~~~~....~~~~",
      "...#=#...BBBBBBBBBBB~~~~",
      "...###...,~~~~~~....~~~~",
      ".........,~~~~~~....~~~~",
      "......T..,~~~~~~~~~~~~~~",
      "..T......,~~~~~~~~~~~~~~",
      "....T....,~~~~~~~~~~~~~~",
      ".........,~~~~~~~~~~~~~~",
    ],
    spawns: { player: [5,13] },
    npcSpots: { kappa_kawataro: [7,10] },
    warps: [
      { x: 0, y: 11, to: 'sakai', ts: [22,10], label: "West road — Sakai" },
      { x: 5, y: 0, to: 'kutsuki', ts: [12,1], label: "South path — Kutsuki" },
    ],
    lockedDoors: [
    ],
  },
  shrine: {
    name: "Forest Shrine",
    tiles: [
      "........................",
      ".T..T.......,.......TT..",
      "..T...T.....,.........T.",
      "............,...........",
      ".T.......#######........",
      ".........#=====#......T.",
      "..T......#=====#........",
      ".........###=###.....T..",
      "..........o.,.o.........",
      "............,...........",
      "......T.....,....T......",
      "............,...........",
      ".T..........,........T..",
      "............,...........",
      "..T.........,.........T.",
      ".....T......,..T........",
      "...T....T...,.....T.T...",
      "............,...........",
    ],
    spawns: { player: [12,15] },
    npcSpots: { miko_hana: [12,5], monk_enkai: [9,10] },
    warps: [
      { x: 12, y: 17, to: 'kyoto', ts: [12,1], label: "South road — Kyoto" },
      { x: 12, y: 0, to: 'hiei', ts: [12,16], label: "Stone steps — Mt. Hiei" },
    ],
    lockedDoors: [
    ],
  },
  hiei: {
    name: "Mt. Hiei — Mountain Temple",
    tiles: [
      "........................",
      "........................",
      "..o..T...#######..T.o...",
      "...o.....#=====#.....o..",
      ".........#=====#........",
      ".T.......#=====#......T.",
      ".........###=###........",
      "............S...........",
      ".....o......S.....o.....",
      "............,...........",
      "............,...........",
      "............,...........",
      ".T..........,.........T.",
      "............,...........",
      "..o.........,.......o...",
      "...o........,........o..",
      ".....T......,.....T.....",
      "............,...........",
    ],
    spawns: { player: [12,14] },
    npcSpots: { yurei_oyuki: [12,4] },
    warps: [
      { x: 12, y: 17, to: 'shrine', ts: [12,1], label: "Stone steps — Forest Shrine" },
      { x: 23, y: 8, to: 'kyoto', ts: [18,1], label: "Mountain trail — Kyoto" },
    ],
    lockedDoors: [
    ],
  },
};

// Fallback grass field for unknown location ids.
const FALLBACK = {
  name: 'Open Field',
  tiles: Array.from({ length: H }, () => '.'.repeat(W)),
  spawns: { player: [12, 9] },
  npcSpots: {},
  warps: [],
  lockedDoors: [],
};

// ---- runtime (procedurally generated) maps ----
// Hand-authored MAPS above are static; infinite-world maps are generated on
// demand by mapgen.js and cached here once visited, so bidirectional warp
// links recorded in game state stay stable across visits.
const runtimeMaps = new Map();

/** Cache a generated map object under its id. */
export function registerMap(id, map) {
  runtimeMaps.set(String(id), map);
}

/** True for procedural map ids ("gen_<scene>_<n>"). */
export function isGenId(id) {
  return MG.isGenId(id);
}

/**
 * Return the map for locId: a cached runtime map, a hand-authored map, a
 * freshly generated procedural map (for gen_* ids), or a fallback field.
 * `links` ({north:id, south:id, east:id, west:id}) overrides the generated
 * warp targets on those edges — used to wire bidirectional links.
 */
export function getMap(locId, links) {
  if (runtimeMaps.has(locId)) return runtimeMaps.get(locId);
  if (MAPS[locId]) return MAPS[locId];
  if (MG.isGenId(locId)) return MG.genMap(locId, links);
  return FALLBACK;
}

/** Tile char at (x, y); out of bounds reads as VOID. */
export function tileAt(map, x, y) {
  if (!map || !map.tiles || y < 0 || y >= map.tiles.length) return ' ';
  const row = map.tiles[y];
  if (x < 0 || x >= row.length) return ' ';
  return row[x];
}

/**
 * True if (x, y) blocks movement. WATER/TREE/ROCK/WALL/VOID and building
 * tiles (HOUSE/BAR/BROTHEL/SHOP/INN/SHRINE) always block the player.
 * A DOOR blocks unless its per-tile flag ('door_open_<x>_<y>') or its
 * lockedDoors entry flag is set in S.world.flags. A spirit (Aiko) ignores
 * everything except VOID. S is only consulted for door flags.
 */
export function isBlocked(map, x, y, S = null, spirit = false) {
  const t = tileAt(map, x, y);
  if (t === ' ') return true; // VOID blocks everyone, even spirits
  if (spirit) return false;
  if (t === 'D') {
    const flags = (S && S.world && S.world.flags) || {};
    if (flags['door_open_' + x + '_' + y]) return false;
    const ld = (map.lockedDoors || []).find(d => d.x === x && d.y === y);
    if (ld && flags[ld.flag]) return false;
    return true;
  }
  return t === '~' || t === 'T' || t === 'o' || t === '#' ||
    t === 'h' || t === 'b' || t === 'p' || t === 's' || t === 'i' || t === 'r';
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAX_STEPS = 200;

/**
 * BFS pathfinding for click-to-move. Returns an array of [x, y] steps from
 * (sx, sy) toward (tx, ty), excluding the start tile. Avoids blocked tiles
 * (spirit passes through anything but VOID). Caps at ~200 steps; returns []
 * when the target is unreachable or itself blocked.
 */
export function findPath(map, sx, sy, tx, ty, S = null, spirit = false) {
  const out = [];
  if (!map) return out;
  if (isBlocked(map, tx, ty, S, spirit)) return out;
  if (sx === tx && sy === ty) return out;
  const k = (x, y) => x + ',' + y;
  const prev = new Map(); // child key -> [px, py]
  const dist = new Map();
  const seen = new Set([k(sx, sy)]);
  dist.set(k(sx, sy), 0);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    const d = dist.get(k(x, y));
    if (d >= MAX_STEPS) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, kk = k(nx, ny);
      if (seen.has(kk)) continue;
      if (isBlocked(map, nx, ny, S, spirit)) continue;
      seen.add(kk);
      prev.set(kk, [x, y]);
      dist.set(kk, d + 1);
      if (nx === tx && ny === ty) {
        const path = [];
        let c = [tx, ty];
        while (!(c[0] === sx && c[1] === sy)) {
          path.unshift(c);
          c = prev.get(k(c[0], c[1]));
        }
        return path;
      }
      q.push([nx, ny]);
    }
  }
  return out;
}
