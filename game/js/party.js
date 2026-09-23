// party.js — party recruitment, shikigami binding/summoning, ambient animals.
// State helpers + entity builders. The engine owns the live entity arrays
// (world.party, world.shikigamiVis, world.animals, world.hostiles); this
// module fills and mutates them, and the integrator calls loadFollowers() and
// spawnAnimals() after world.loadLocation().
//
// HARD POLICY: Aiko is strictly platonic, never sexualized, permanent, and
// can NEVER be released or unsummoned. She renders via her own engine entity,
// so she is always excluded from world.shikigamiVis.

import * as St from './state.js';
import * as Spr from './sprites.js';

const PARTY_CAP = 4;
const SHIKIGAMI_CAP = 7;

// Spr.animalSpec / Spr.wispSpec are authored by a parallel workstream; fall
// back to human/ghost specs so this module works with or without them.
function animalSpec(kind) {
  if (typeof Spr.animalSpec === 'function') {
    try { const s = Spr.animalSpec(kind); if (s) return s; } catch (e) { /* fall through */ }
  }
  return Spr.humanSpec('animal:' + kind, { top: 4 });
}
function wispSpec(color) {
  if (typeof Spr.wispSpec === 'function') {
    try { const s = Spr.wispSpec(color); if (s) return s; } catch (e) { /* fall through */ }
  }
  return Spr.ghostSpec('wisp:' + String(color));
}

export function ensureState(S) {
  if (!S.world.party) S.world.party = [];
  if (!S.world.shikigami) {
    S.world.shikigami = [
      { id: 'aiko', name: 'Aiko', kind: 'fox', permanent: true, summoned: true, color: '#ffb3ff', specSeed: 'aiko' },
    ];
  }
  if (!S.world.shikigamiOrder) S.world.shikigamiOrder = 'follow';
  return S.world;
}

function isDemonRec(rec) {
  return !!rec && (rec.archetype === 'demon_brute' || rec.kind === 'demon');
}

function labelArchetype(arch) {
  return String(arch || 'wanderer').replace(/_/g, ' ');
}

// ---- party ---------------------------------------------------------------

// npcEnt: a world.npcs entry {id, rec}. Willingness is deterministic — first
// match wins: (1) demon pact, (2) loyal (helped>=2), (3) hired (50g), (4) fear
// (karma<=-30). On success the NPC leaves world.npcs and joins S.world.party.
export function recruit(S, world, npcEnt) {
  ensureState(S);
  if (!npcEnt || !npcEnt.rec) return { ok: false, msg: 'There is no one here to recruit.' };
  const rec = npcEnt.rec;
  const name = rec.name || npcEnt.id;
  if (S.world.party.length >= PARTY_CAP) return { ok: false, msg: `Your party is full — ${name} cannot join.` };
  if (S.world.party.some(m => m.id === npcEnt.id)) return { ok: false, msg: `${name} already travels with you.` };
  const mem = St.npcMemory(S, npcEnt.id);
  let msg = null, kind = 'human', paid = 0;
  if (isDemonRec(rec)) {
    kind = 'demon';
    if (S.player.gold >= 100) {
      paid = 100;
      msg = `${name} bares its fangs and seals a blood-pact for 100 gold. It will fight for you — for now.`;
    } else if (S.player.karma <= -20) {
      msg = `${name} smells the cruelty on you and kneels. A pact of fear is still a pact.`;
    }
  } else if (mem.helped >= 2) {
    msg = `${name} clasps your hand. "After all you have done for me — I would follow you anywhere."`;
  } else if (S.player.gold >= 50) {
    paid = 50;
    msg = `${name} weighs the coin pouch, then bows. "Fifty gold, and my blade is yours."`;
  } else if (S.player.karma <= -30) {
    msg = `${name} trembles and joins your party rather than risk your wrath.`;
  }
  if (!msg) return { ok: false, msg: `${name} refuses to join you.` };
  if (paid) St.addGold(S, -paid);
  S.world.party.push({
    id: npcEnt.id, name,
    archetype: rec.archetype || 'villager_woman',
    gender: rec.gender || null,
    specSeed: npcEnt.id,
    level: 1, kind,
  });
  if (world && Array.isArray(world.npcs)) {
    world.npcs = world.npcs.filter(n => n !== npcEnt && n.id !== npcEnt.id);
  }
  St.rememberNpc(S, npcEnt.id, 'helped', 1);
  return { ok: true, msg };
}

export function dismissParty(S, world, nameFrag) {
  ensureState(S);
  const q = String(nameFrag || '').toLowerCase();
  const i = S.world.party.findIndex(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase() === q);
  if (i < 0) return { ok: false, msg: 'No such companion travels with you.' };
  const [m] = S.world.party.splice(i, 1);
  if (world && Array.isArray(world.party)) {
    world.party = world.party.filter(p => p.id !== 'party_' + m.id && p.mid !== m.id);
  }
  return { ok: true, msg: `${m.name} bows and wanders off down the road. They will not return.` };
}

export function partyList(S) {
  ensureState(S);
  if (!S.world.party.length) return 'No companions travel with you yet.';
  return S.world.party
    .map((m, i) => `${i + 1}. ${m.name} (${labelArchetype(m.archetype)}) — Lv${m.level || 1}`)
    .join('\n');
}

// ---- followers / shikigami entities --------------------------------------

function freeNear(world, px, py) {
  const offs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [0, 2], [-2, 0]];
  for (const [dx, dy] of offs) {
    const x = px + dx, y = py + dy;
    if (!world.tileBlocked(x, y, false)) return [x, y];
  }
  return [px, py];
}

const ANIMAL_KINDS = new Set(['deer', 'rabbit', 'bird', 'dog', 'monkey', 'boar', 'wolf', 'fox']);

function shikigamiSpecFor(g) {
  if (g.kind === 'wisp') return wispSpec(g.color || '#9ae8ff');
  if (ANIMAL_KINDS.has(g.kind)) return animalSpec(g.kind);
  if (g.kind === 'demon') return Spr.demonSpec(g.specSeed || g.id);
  return Spr.humanSpec('shik_' + (g.specSeed || g.id), { top: 1 });
}

// Rebuild world.party entities from S.world.party and world.shikigamiVis from
// summoned non-Aiko shikigami. Aiko is EXCLUDED — the engine renders her own
// entity. Call after world.loadLocation().
export function loadFollowers(world, S) {
  ensureState(S);
  world.party = [];
  world.shikigamiVis = [];
  const p = world.player;
  for (const m of S.world.party) {
    const [x, y] = freeNear(world, p.x, p.y);
    world.party.push({
      id: 'party_' + m.id, mid: m.id, name: m.name, kind: 'party', level: m.level || 1,
      spec: Spr.npcSpec('party_' + m.id, { archetype: m.archetype, gender: m.gender }),
      x, y, fx: x, fy: y, facing: 'down', stepT: 0,
    });
  }
  let vi = 0;
  for (const g of S.world.shikigami) {
    if (g.id === 'aiko' || g.permanent) continue; // Aiko renders separately
    if (!g.summoned) continue;
    world.shikigamiVis.push({
      id: 'shv_' + g.id, gid: g.id, name: g.name, kind: 'shikigami',
      spec: shikigamiSpecFor(g), orbitIdx: vi++,
      x: p.x, y: p.y, fx: p.x, fy: p.y,
    });
  }
}

// ---- binding -------------------------------------------------------------

// target: {id, name, rec?, kind:'npc'|'hostile'|'animal', animal?}.
// People need a reason (helped>=1, 30g, or karma<=-20); animals and demons
// bind freely. Bound hostiles are removed from world.hostiles; bound NPCs
// leave world.npcs. Cap: 7 shikigami total (Aiko counts).
export function bindShikigami(S, world, target) {
  ensureState(S);
  if (!target || !target.id) return { ok: false, msg: 'There is nothing here to bind.' };
  const oid = String(target.id);
  if (/^aiko$/i.test(oid) || /^aiko$/i.test(String(target.name || ''))) {
    return { ok: true, msg: 'She is already your shikigami.' };
  }
  if (S.world.shikigami.length >= SHIKIGAMI_CAP) {
    return { ok: false, msg: 'Seven is the limit. Release a shikigami before binding another.' };
  }
  const newId = 'shik_' + oid;
  if (S.world.shikigami.some(g => g.id === newId)) {
    return { ok: false, msg: `${target.name || 'It'} is already bound to you.` };
  }
  const tkind = target.kind || 'npc';
  const name = target.name || 'Nameless spirit';
  let kind, msg;
  if (tkind === 'animal') {
    kind = target.animal || 'animal';
    msg = `You soothe the ${name.toLowerCase()}'s spirit with a whispered sutra. It pads after you now, bound and calm.`;
    if (world && Array.isArray(world.animals)) world.animals = world.animals.filter(a => a.id !== oid);
  } else if (tkind === 'hostile') {
    const demonish = isDemonRec(target.rec);
    kind = target.animal || (demonish ? 'demon' : 'human');
    msg = demonish
      ? `You carve the binding seal into the air. ${name} howls — then kneels. The pact is sealed.`
      : `${name} struggles, then goes still. Bound.`;
    if (world) {
      if (Array.isArray(world.hostiles)) world.hostiles = world.hostiles.filter(h => h.id !== oid);
      if (Array.isArray(world.animals)) world.animals = world.animals.filter(a => a.id !== oid);
    }
  } else {
    // a person — needs a reason to submit
    const mem = St.npcMemory(S, oid);
    let reason = null;
    if (mem.helped >= 1) reason = 'loyalty';
    else if (S.player.gold >= 30) { St.addGold(S, -30); reason = 'coin'; }
    else if (S.player.karma <= -20) reason = 'fear';
    if (!reason) return { ok: false, msg: `${name} will not submit to binding — they owe you nothing and fear you not.` };
    kind = 'human';
    msg = reason === 'loyalty'
      ? `${name} kneels willingly. "My life is yours," they whisper, and the seal takes hold.`
      : reason === 'coin'
        ? `Thirty gold changes hands. ${name} accepts the binding seal with a merchant's shrug.`
        : `${name} feels your dark aura and submits rather than resist. The seal burns cold.`;
    if (world && Array.isArray(world.npcs)) world.npcs = world.npcs.filter(n => n.id !== oid);
  }
  const rng = Spr.rng('shikcolor:' + oid);
  const WISP_COLORS = ['#9ae8ff', '#c9a7ff', '#a8ffb3', '#ffd97a', '#ff9ad5'];
  S.world.shikigami.push({
    id: newId, name, kind, specSeed: oid, summoned: true,
    color: WISP_COLORS[Math.floor(rng() * WISP_COLORS.length)],
  });
  return { ok: true, msg };
}

function findShikigami(S, nameFrag) {
  const q = String(nameFrag || '').toLowerCase();
  return S.world.shikigami.find(g =>
    g.name.toLowerCase().includes(q) || g.id.toLowerCase() === q || g.id.toLowerCase() === 'shik_' + q);
}

export function releaseShikigami(S, nameFrag) {
  ensureState(S);
  const g = findShikigami(S, nameFrag);
  if (!g) return { ok: false, msg: 'No such shikigami is bound to you.' };
  if (g.id === 'aiko' || g.permanent) {
    return { ok: false, msg: 'Aiko is bound to your soul forever. She cannot be released.' };
  }
  S.world.shikigami.splice(S.world.shikigami.indexOf(g), 1);
  return { ok: true, msg: `You break the seal. ${g.name} fades back into the wild, free.` };
}

export function summonShikigami(S, nameFrag) {
  ensureState(S);
  const g = findShikigami(S, nameFrag);
  if (!g) return { ok: false, msg: 'No such shikigami is bound to you.' };
  g.summoned = true;
  if (g.id === 'aiko' || g.permanent) return { ok: true, msg: 'Aiko is always with you.' };
  return { ok: true, msg: `${g.name} materializes at your side.` };
}

export function unsummonShikigami(S, nameFrag) {
  ensureState(S);
  const g = findShikigami(S, nameFrag);
  if (!g) return { ok: false, msg: 'No such shikigami is bound to you.' };
  if (g.id === 'aiko' || g.permanent) {
    return { ok: false, msg: 'Aiko refuses to leave your side — she stays.' };
  }
  g.summoned = false;
  return { ok: true, msg: `${g.name} dissolves into the shadows, waiting to be called.` };
}

export function shikigamiList(S) {
  ensureState(S);
  return S.world.shikigami
    .map(g => `• ${g.name} (${g.kind}) — ${g.summoned ? 'summoned' : 'dismissed'}${g.permanent ? ' ✦' : ''}`)
    .join('\n');
}

export function setShikigamiOrder(S, order) {
  ensureState(S);
  if (!['attack', 'follow', 'hide'].includes(order)) return { ok: false, msg: 'Unknown order.' };
  S.world.shikigamiOrder = order;
  for (const g of S.world.shikigami) {
    if (g.id === 'aiko' || g.permanent) { g.summoned = true; continue; }
    g.summoned = order !== 'hide';
  }
  const msgs = {
    attack: 'Your shikigami bare their fangs, ready to strike.',
    follow: 'Your shikigami settle into step behind you.',
    hide: 'Your shikigami melt into the shadows. (Aiko stays.)',
  };
  return { ok: true, msg: msgs[order] };
}

// Bonus damage numbers for the combat melee hook: party members 3+2*level
// each; summoned non-Aiko shikigami 4 each; Aiko 6+player.level if summoned.
export function assistDamage(S) {
  ensureState(S);
  let party = 0;
  for (const m of S.world.party) party += 3 + 2 * (m.level || 1);
  let shikigami = 0;
  for (const g of S.world.shikigami) {
    if (!g.summoned) continue;
    if (g.id === 'aiko') shikigami += 6 + (S.player.level || 1);
    else if (!g.permanent) shikigami += 4;
  }
  return { party, shikigami };
}

// ---- ambient animals -----------------------------------------------------

const ANIMAL_NAMES = { deer: 'Deer', rabbit: 'Rabbit', bird: 'Bird', dog: 'Dog', monkey: 'Monkey', boar: 'Wild Boar', wolf: 'Wolf' };
const ANIMAL_STATS = { boar: { hp: 30, atk: 8 }, wolf: { hp: 40, atk: 12 } };

// scene type per mapId; falls back to keyword matching on the map name.
const SCENE_BY_MAP = {
  kyoto: 'town', azuchi: 'town', kofu: 'town', sakai: 'town', gifu: 'town',
  kutsuki: 'village', otsu: 'river', shrine: 'forest', hiei: 'forest',
  kasugayama: 'wilderness',
};
const ANIMAL_COUNT = { none: 0, forest: 4, wilderness: 3, village: 2, town: 1, outskirt: 3, river: 2 };

function sceneType(world) {
  const id = String(world.mapId || '');
  if (SCENE_BY_MAP[id]) return SCENE_BY_MAP[id];
  const nm = String((world.map && world.map.name) || '');
  if (/cave|palace|ship|battle|interior|dungeon/i.test(nm)) return 'none';
  if (/forest|woods|hiei|shrine|grove/i.test(nm)) return 'forest';
  if (/village/i.test(nm)) return 'village';
  if (/town|city|capital|port/i.test(nm)) return 'town';
  if (/river|lake/i.test(nm)) return 'river';
  if (/outskirt|field|plain/i.test(nm)) return 'outskirt';
  return 'wilderness';
}

function findAnimalSpot(world, p, rng) {
  for (let t = 0; t < 40; t++) {
    const x = Math.floor(rng() * 24), y = Math.floor(rng() * 18);
    if (world.tileBlocked(x, y, false)) continue;
    if (Math.abs(x - p.x) + Math.abs(y - p.y) < 4) continue;
    if (world.animals.some(a => a.x === x && a.y === y)) continue;
    return [x, y];
  }
  return null;
}

// Sparse ambient animals, deterministic per map (Spr.rng seeded on mapId).
// Never in caves/palaces/ships/battlefields/interiors. ~8% of wild spawns are
// hostile boar/wolf instead (hostile:true, hp/atk set).
export function spawnAnimals(world, S) {
  world.animals = [];
  const scene = sceneType(world);
  const count = ANIMAL_COUNT[scene] ?? 1;
  if (!count) return world.animals;
  const rng = Spr.rng('animals:' + world.mapId);
  const pool = scene === 'village' ? ['dog']
    : scene === 'town' ? ['dog']
    : scene === 'river' ? ['bird']
    : ['deer', 'rabbit', 'bird', 'dog', 'monkey'];
  const wild = scene === 'forest' || scene === 'wilderness' || scene === 'outskirt' || scene === 'river';
  const p = world.player;
  for (let i = 0; i < count; i++) {
    let kind = pool[Math.floor(rng() * pool.length)];
    let hostile = false;
    if (wild && rng() < 0.08) { kind = rng() < 0.5 ? 'boar' : 'wolf'; hostile = true; }
    const spot = findAnimalSpot(world, p, rng);
    if (!spot) continue;
    const [x, y] = spot;
    const st = hostile ? ANIMAL_STATS[kind] : null;
    world.animals.push({
      id: `an_${kind}_${i}`, name: ANIMAL_NAMES[kind] || kind, kind: 'animal', animal: kind,
      spec: animalSpec(kind), hostile,
      hp: st ? st.hp : 0, maxHp: st ? st.hp : 0, atk: st ? st.atk : 0, atkT: 0,
      x, y, fx: x, fy: y, facing: 'down', wanderT: 1 + rng() * 4,
    });
  }
  return world.animals;
}
