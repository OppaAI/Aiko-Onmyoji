// hostiles.js — hostile entities: random wilderness/outlaw spawns plus the
// lightweight melee combat exchange used when the player attacks a hostile
// on the map. Owned by the hostiles workstream.
//
// The engine (a parallel workstream) provides on World:
//   world.hostiles[] — {id,name,kind,spec,x,y,fx,fy,facing,hp,maxHp,atk,def,
//                        exp,gold,karmaKill,hostile:true,missionId?,role?}
//   world.removeHostile(id) — (falls back to an in-place splice here)
// and hostile AI / nameplates there. The missions workstream stores pending
// targets in S.world.missionTargets[mapId]; spawnForMap() instantiates them.
//
// The turn-based combat.js duel system is intentionally untouched —
// meleeAttack() below is a single lightweight exchange round for map
// hostiles, invoked by the integrator's 'attack <name>' command path.

import * as St from './state.js';
import * as Spr from './sprites.js';
import * as TM from './tilemaps.js';

// ---------------------------------------------------------------------------
// Hostile archetype table

export const HOSTILE_TYPES = {
  bandit:        { name: 'Road Bandit',    hp: 40, atk: 11, def: 4, exp: 45,  gold: 30, archetype: 'bandit',      karmaKill: -3 },
  ninja:         { name: 'Stray Ninja',    hp: 55, atk: 14, def: 6, exp: 80,  gold: 50, archetype: 'ninja',       karmaKill: -2 },
  rogue_samurai: { name: 'Rogue Samurai',  hp: 70, atk: 15, def: 8, exp: 100, gold: 70, archetype: 'samurai',     karmaKill: -4 },
  deserter:      { name: 'Deserter Soldier', hp: 45, atk: 12, def: 5, exp: 55, gold: 25, archetype: 'soldier',    karmaKill: -3 },
  wild_demon:    { name: 'Wild Demon',     hp: 60, atk: 13, def: 5, exp: 75,  gold: 40, archetype: 'demon_brute', karmaKill: 0 },
  criminal:      { name: 'Wanted Criminal', hp: 50, atk: 12, def: 5, exp: 90, gold: 60, archetype: 'bandit',     karmaKill: 0 },
  boar:          { name: 'Wild Boar',      hp: 35, atk: 10, def: 6, exp: 30,  gold: 0,  animal: 'boar',           karmaKill: 0 },
  wolf:          { name: 'Wild Wolf',      hp: 45, atk: 13, def: 4, exp: 50,  gold: 0,  animal: 'wolf',           karmaKill: 0 },
};

// Scene -> which random hostiles appear and how many (inclusive range).
// palace / shrine / ship deliberately spawn nothing.
const SCENE_SPAWNS = {
  forest:      { types: ['wolf', 'boar', 'wild_demon'],          min: 1, max: 3 },
  wilderness:  { types: ['wolf', 'boar', 'wild_demon'],          min: 1, max: 3 },
  outskirt:    { types: ['bandit', 'deserter'],                  min: 0, max: 2 },
  road:        { types: ['bandit', 'deserter'],                  min: 0, max: 2 },
  village:     { types: ['bandit', 'deserter'],                  min: 0, max: 2 },
  town:        { types: ['bandit', 'deserter'],                  min: 0, max: 2 },
  big_city:    { types: ['ninja'],                               min: 0, max: 1 },
  small_city:  { types: ['ninja'],                               min: 0, max: 1 },
  cave:        { types: ['wild_demon'],                          min: 2, max: 4 },
  battlefield: { types: ['deserter', 'rogue_samurai'],           min: 2, max: 4 },
  palace:      { types: [],                                      min: 0, max: 0 },
  shrine:      { types: [],                                      min: 0, max: 0 },
  ship:        { types: [],                                      min: 0, max: 0 },
};

// ---------------------------------------------------------------------------
// State

/** Ensure the missions hook store exists on the save. */
export function ensureState(S) {
  if (!S.world) S.world = {};
  if (!S.world.missionTargets) S.world.missionTargets = {};
  return S;
}

// ---------------------------------------------------------------------------
// Scene detection

// Maps built by the world-generation workstream carry map.sceneType; older
// hand-authored maps do not, so fall back to id-pattern heuristics.
function sceneOf(map, mapId) {
  if (map && map.sceneType) return String(map.sceneType).toLowerCase();
  const id = String(mapId || '').toLowerCase();
  if (/battle|siege|front/.test(id)) return 'battlefield';
  if (/cave|cavern|dungeon|mine/.test(id)) return 'cave';
  if (/forest|woods|grove/.test(id)) return 'forest';
  if (/hiei/.test(id)) return 'wilderness'; // mountain temple grounds
  if (/kyoto|azuchi/.test(id)) return 'big_city';
  if (/sakai|kofu|kasugayama|gifu|otsu/.test(id)) return 'small_city';
  if (/kutsuki|village|hamlet/.test(id)) return 'village';
  if (/shrine|temple/.test(id)) return 'shrine';
  if (/palace|court/.test(id)) return 'palace';
  if (/ship|boat|ferry/.test(id)) return 'ship';
  return 'outskirt';
}

// ---------------------------------------------------------------------------
// Spawning

/** Find a walkable tile at least minDist tiles from the player spawn.
 *  rng defaults to Math.random; spawnForMap passes the seeded rng. */
export function pickSpawnSpot(world, S, minDist = 6, rng = Math.random) {
  const map = world.map;
  if (!map || !map.tiles) return null;
  const px = (world.player && world.player.x) ?? (map.spawns && map.spawns.player && map.spawns.player[0]) ?? 0;
  const py = (world.player && world.player.y) ?? (map.spawns && map.spawns.player && map.spawns.player[1]) ?? 0;
  const cands = [];
  for (let y = 0; y < map.tiles.length; y++) {
    for (let x = 0; x < map.tiles[y].length; x++) {
      if (TM.isBlocked(map, x, y, S, false)) continue;
      if (Math.hypot(x - px, y - py) < minDist) continue;
      cands.push([x, y]);
    }
  }
  if (!cands.length) return null;
  return cands[Math.floor(rng() * cands.length)];
}

// Build the pixel sprite for a hostile definition. animalSpec may be
// provided by the sprites workstream; fall back gracefully until it lands.
function buildSpec(def, type) {
  const id = String(def.id || 'hostile');
  const animal = def.animal || (type && type.animal);
  if (animal) {
    if (typeof Spr.animalSpec === 'function') return Spr.animalSpec(animal);
    return Spr.npcSpec(id, { archetype: 'wolf' });
  }
  const arch = def.archetype || (type && type.archetype) || 'bandit';
  if (arch === 'demon_brute' && typeof Spr.demonSpec === 'function') {
    return Spr.demonSpec('hostile:' + id);
  }
  return Spr.npcSpec(id, { archetype: arch });
}

/** Add one hostile to the world. def: {id,name,type?,archetype?,animal?,
 *  hp,atk,def,exp,gold,karmaKill?,x,y,hostile?,missionId?,role?}.
 *  hostiles: array entries per the engine contract. Returns the entry. */
export function addHostile(world, def) {
  const type = def.type ? HOSTILE_TYPES[def.type] : null;
  const hp = def.hp ?? (type && type.hp) ?? 30;
  const h = {
    id: String(def.id),
    name: def.name || (type && type.name) || 'Hostile',
    kind: def.animal || (type && type.animal) ? 'animal'
         : (def.archetype === 'demon_brute' || (type && type.archetype === 'demon_brute') ? 'demon' : 'human'),
    spec: buildSpec(def, type),
    x: def.x, y: def.y, fx: def.x, fy: def.y,
    facing: 'down',
    hp, maxHp: hp,
    atk: def.atk ?? (type && type.atk) ?? 8,
    def: def.def ?? (type && type.def) ?? 4,
    exp: def.exp ?? (type && type.exp) ?? 20,
    gold: def.gold ?? (type && type.gold) ?? 0,
    karmaKill: def.karmaKill ?? (type && type.karmaKill) ?? 0,
    hostile: def.hostile !== false,
    missionId: def.missionId || null,
    role: def.role || null,
    captured: false,
  };
  if (!Array.isArray(world.hostiles)) world.hostiles = [];
  world.hostiles.push(h);
  return h;
}

/** Look up a hostile by id. Exported for the integrator's 'attack <name>' path. */
export function hostileById(world, id) {
  return (world.hostiles || []).find(h => h.id === id) || null;
}

function removeHostile(world, id) {
  if (typeof world.removeHostile === 'function') return world.removeHostile(id);
  const i = (world.hostiles || []).findIndex(h => h.id === id);
  if (i >= 0) return world.hostiles.splice(i, 1)[0];
  return null;
}

/** Spawn this map's hostiles. Call after loadLocation.
 *  Deterministic: same mapId + date -> same hostiles. Also instantiates
 *  S.world.missionTargets[mapId] entries (named targets; kidnap targets use
 *  role 'target' and hostile:false). Clears previously spawned entries first
 *  so re-entering a map on the same day cannot duplicate them. */
export function spawnForMap(world, S) {
  ensureState(S);
  world.hostiles = [];
  const mapId = world.mapId;
  const scene = sceneOf(world.map, mapId);
  const table = SCENE_SPAWNS[scene] || SCENE_SPAWNS.outskirt;
  const rng = Spr.rng('hostile:' + mapId + ':' + St.dateKey(S));

  const n = table.types.length
    ? table.min + Math.floor(rng() * (table.max - table.min + 1))
    : 0;
  for (let i = 0; i < n; i++) {
    const tkey = table.types[Math.floor(rng() * table.types.length)];
    const spot = pickSpawnSpot(world, S, 6, rng);
    if (!spot) break;
    addHostile(world, {
      id: `h_${mapId}_${tkey}_${i}`,
      type: tkey,
      x: spot[0], y: spot[1],
      hostile: true,
    });
  }

  // Mission targets: named, mission-flagged; role 'target' marks a
  // kidnap/catch objective that may be non-hostile.
  const targets = S.world.missionTargets[mapId] || [];
  for (const t of targets) {
    if (!t || !t.id) continue;
    if (hostileById(world, t.id)) continue; // already placed
    const spot = pickSpawnSpot(world, S, 6, rng);
    if (!spot) break;
    addHostile(world, {
      id: t.id,
      name: t.name,
      archetype: t.archetype || 'bandit',
      animal: t.animal,
      hp: t.hp, atk: t.atk, def: t.def, exp: t.exp, gold: t.gold,
      karmaKill: 0, // mission kills are adjudicated by the mission, not here
      hostile: t.hostile !== false,
      missionId: t.missionId || null,
      role: t.role || 'target',
      x: spot[0], y: spot[1],
    });
  }
  return world.hostiles;
}

// ---------------------------------------------------------------------------
// Lightweight melee: one exchange round on the map (not the combat.js duel).

function memberName(m) { return m.name || m.id || 'Ally'; }

/** One melee exchange with a map hostile.
 *  opts: { onKill(hostile, lines), onPlayerDown(lines) } — callbacks the
 *  integrator wires to missions.js / death hooks (no static import here to
 *  avoid an import cycle).
 *  Returns { lines:[], killed, targetGone }. If the player hits 0 HP, a
 *  'You fall...' line is appended; the integrator handles the death screen. */
export function meleeAttack(S, world, hostileId, opts = {}) {
  const h = hostileById(world, hostileId);
  const lines = [];
  if (!h) return { lines: ['They are already gone.'], killed: false, targetGone: true };

  // --- player strike ---
  const pAtk = S.player.atk + St.passiveBonus(S).atk;
  const d = Math.max(1, pAtk - h.def + St.rand(0, 3));
  h.hp -= d;
  lines.push(`You strike ${h.name} for ${d} damage.`);

  // --- party assist ---
  const party = (S.world && S.world.party) || [];
  if (h.hp > 0 && party.length) {
    let total = 0;
    for (const m of party) {
      const md = Math.min(3 + (m.level || 1) * 2, 15);
      if (total + md > 30) break; // cap total party bonus
      total += md;
      h.hp -= md;
      lines.push(`${memberName(m)} strikes for ${md}!`);
      if (h.hp <= 0) break;
    }
  }

  // --- shikigami assist (attack orders) ---
  if (h.hp > 0 && S.world && S.world.shikigamiOrder === 'attack') {
    const sk = (S.world && S.world.shikigami) || [];
    for (const s of sk) {
      if (!s || !s.summoned || s.aiko) continue;
      h.hp -= 4;
      lines.push(`${memberName(s)} rends for 4!`);
      if (h.hp <= 0) break;
    }
    if (h.hp > 0 && S.aiko && S.aiko.summoned) {
      const ad = 6 + (S.aiko.level || S.player.level || 1);
      h.hp -= ad;
      lines.push(`Aiko's foxfire sears for ${ad}!`);
    }
  }

  // --- kill? ---
  if (h.hp <= 0) {
    removeHostile(world, h.id);
    const exp = St.addExp(S, h.exp);
    St.addGold(S, h.gold);
    lines.push(`${h.name} is slain!`);
    lines.push(`Gained ${h.exp} EXP and ${h.gold} gold.${exp.leveled ? ' Level up!' : ''}`);
    if (!h.missionId && h.karmaKill) {
      const k = St.addKarma(S, h.karmaKill);
      lines.push(`Karma ${h.karmaKill > 0 ? '+' : ''}${h.karmaKill} (now ${k.now}, ${k.tier}).`);
    }
    if (St.rand(1, 100) <= 30) {
      St.addItem(S, 'herb', 1);
      lines.push('It dropped a healing herb.');
    }
    if (typeof opts.onKill === 'function') opts.onKill(h, lines);
    return { lines, killed: true, targetGone: true };
  }

  // --- hostile retaliates ---
  const pDef = S.player.def + St.passiveBonus(S).def;
  const rd = Math.max(1, h.atk - pDef + St.rand(0, 2));
  St.damagePlayer(S, rd);
  lines.push(`${h.name} strikes back for ${rd} damage.`);
  if (S.player.hp <= 0) {
    lines.push('You fall...');
    if (typeof opts.onPlayerDown === 'function') opts.onPlayerDown(lines);
  }
  return { lines, killed: false, targetGone: false };
}

/** Capture a weakened target for kidnap / catch-alive missions.
 *  Requires the target at or below 50% HP. Removes it from the map and
 *  marks it captured. opts: { onCapture(hostile, lines) } for the
 *  integrator to notify missions. */
export function captureTarget(S, world, hostileId, opts = {}) {
  const h = hostileById(world, hostileId);
  if (!h) return { ok: false, lines: ['They are already gone.'], targetGone: true };
  if (h.hp > h.maxHp * 0.5) {
    return { ok: false, msg: 'Weaken them first (below half HP).', lines: ['Too strong to bind — weaken them first (below half HP).'] };
  }
  h.captured = true;
  removeHostile(world, h.id);
  const lines = [`You bind ${h.name} with spirit cords. They struggle, then go limp.`];
  if (typeof opts.onCapture === 'function') opts.onCapture(h, lines);
  return { ok: true, lines };
}
