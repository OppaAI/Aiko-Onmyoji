// game/js/missions.js — mission board system + NPC/daimyo requests.
//
// OWNED BY the buildings/places workstream. No other workstream edits this file.
//
// Imports only from './state.js'. No DOM access. Pure logic: mutates S.
//
// State: S.world.missions = { boards:{barId:[mission]}, active:[mission],
//                             done:[mission], npcOffers:{npcId:mission} }
//         S.world.missionTargets = { mapId:[targetDef] }
//
// Mission: { id, type, title, desc,
//            giver: {kind:'bar', barId} | {kind:'npc', npcId},
//            target: { name, kind:'criminal'|'demon'|'person', mapId, count? },
//            reward: { gold, karma },          // karma: + for good, - total for bad
//            state: 'board'|'offer'|'active'|'done'|'failed',
//            progress?, result? }
//
// Target def (for the hostiles/combat workstream — spawn when the player
// visits target.mapId):
//   { id, name, missionId, role:'target'|'slayGroup', hostile:bool,
//     archetype, hp, atk, def, exp, gold, count? }
// role 'target' = one named NPC (catch/kidnap/assassinate); role 'slayGroup'
// = a pack of `count` demons. hostile:false for kidnap victims (unarmed).
//
// Karma: good missions grant +4..+8 karma on turn-in. Bad missions cost
// -8..-15 karma on accept (intent) and another -8..-15 on turn-in.

import * as St from './state.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function ensureState(S) {
  if (!S.world.missions) S.world.missions = { boards: {}, active: [], done: [], npcOffers: {} };
  if (!S.world.missionTargets) S.world.missionTargets = {};
  return S.world.missions;
}

// Tiny local deterministic PRNG (do not import sprites here — missions.js
// intentionally depends only on state.js).
function _hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function _rng(seed) {
  let a = _hash(String(seed));
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }
function _int(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }

// ---------------------------------------------------------------------------
// Types & flavor
// ---------------------------------------------------------------------------

export const MISSION_TYPES = {
  catch:       { label: 'Bounty: Capture', good: true },
  slay:        { label: 'Extermination',   good: true },
  kidnap:      { label: 'Abduction',       good: false },
  assassinate: { label: 'Assassination',   good: false },
};

// Hand-map ids used as mission target locales. Generated map ids
// ('gen_forest_*' etc.) work fine as strings too — targets spawn when the
// player visits that map. The integrator may append gen ids here.
const TARGET_MAPS = ['kyoto', 'sakai', 'gifu', 'kutsuki', 'otsu', 'azuchi', 'shrine', 'hiei', 'kofu', 'kasugayama'];
const MAP_LABELS = {
  kyoto: 'Kyoto', sakai: 'Sakai', gifu: 'Gifu', kutsuki: 'Kutsuki', otsu: 'Ōtsu',
  azuchi: 'Azuchi', shrine: 'the Forest Shrine', hiei: 'Mt. Hiei',
  kofu: 'Kōfu', kasugayama: 'Kasugayama',
};
function _mapLabel(id) {
  if (MAP_LABELS[id]) return MAP_LABELS[id];
  return String(id).replace(/^gen_/, '').replace(/_/g, ' ') || id;
}

const CRIMINALS = ['One-Eyed Jirō', 'Black-Tooth Saburō', 'Fox-Face Genji', 'Snake-Eye no Chō', 'the Red Sleeve', 'Crow-Beak Kansuke'];
const CRIMINAL_HAUNTS = ['haunts the back alleys', 'hides in the warehouse district', 'lurks by the river docks', 'nests in the old temple ruins'];
const DEMON_PACKS = ['oni brood', 'gaki nest', 'bake-danuki den', 'yūrei swarm', 'kappa gang'];
const DEMON_HAUNTS = ['in the bamboo grove', 'on the mountain pass', 'by the haunted ford', 'beneath the old bridge'];
const KIDNAP_VICTIMS = ['a moneylender of Sakai', "a rival merchant's clerk", "the tax collector's aide", "a wealthy widow's steward"];
const ASSASSIN_TARGETS = ["a corrupt magistrate's yōjinbō", 'a bandit chief', 'a turncoat samurai', 'a poison-brewer of the dark market'];

// Combat stats for spawned targets, by archetype.
const TARGET_STATS = {
  bandit:      { archetype: 'bandit',      hp: 42, atk: 12, def: 4, exp: 25, gold: 20 },
  ninja:       { archetype: 'ninja',       hp: 58, atk: 16, def: 6, exp: 42, gold: 45 },
  demon_brute: { archetype: 'demon_brute', hp: 64, atk: 15, def: 5, exp: 48, gold: 30 },
  villager:    { archetype: 'villager',    hp: 26, atk: 4,  def: 2, exp: 6,  gold: 10 },
};

// ---------------------------------------------------------------------------
// Board missions
// ---------------------------------------------------------------------------

function _makeBoardMission(r, barId, i, type) {
  const mapId = _pick(r, TARGET_MAPS);
  const where = _mapLabel(mapId);
  const id = 'm_' + _hash(`${barId}:${i}:${type}`).toString(36);
  const base = { id, type, giver: { kind: 'bar', barId }, state: 'board', progress: 0 };
  switch (type) {
    case 'catch': {
      const name = _pick(r, CRIMINALS);
      return { ...base,
        title: `Bounty: ${name}`,
        desc: `${name} ${ _pick(r, CRIMINAL_HAUNTS)} of ${where}. Wanted by the magistrate — alive pays full, a corpse pays half.`,
        target: { name, kind: 'criminal', mapId },
        reward: { gold: _int(r, 90, 160), karma: _int(r, 4, 8) } };
    }
    case 'slay': {
      const pack = _pick(r, DEMON_PACKS);
      return { ...base,
        title: `Exterminate: ${pack}`,
        desc: `A ${pack} ${ _pick(r, DEMON_HAUNTS)} near ${where} — three of the beasts, by the tracker's count. Wipe them out.`,
        target: { name: pack, kind: 'demon', mapId, count: 3 },
        reward: { gold: _int(r, 110, 200), karma: _int(r, 4, 8) } };
    }
    case 'kidnap': {
      const victim = _pick(r, KIDNAP_VICTIMS);
      return { ...base,
        title: `Quiet work: ${victim}`,
        desc: `Someone with deep pockets wants ${victim} delivered to a riverside warehouse — alive and unharmed. No questions, no witnesses. The victim must live.`,
        target: { name: victim, kind: 'person', mapId },
        reward: { gold: _int(r, 160, 250), karma: -_int(r, 12, 20) } };
    }
    case 'assassinate': {
      const mark = _pick(r, ASSASSIN_TARGETS);
      return { ...base,
        title: `Red work: ${mark}`,
        desc: `A patron of the bar's darker corner wants ${mark} dead near ${where}. Quick, quiet, deniable.`,
        target: { name: mark, kind: 'person', mapId },
        reward: { gold: _int(r, 220, 350), karma: -_int(r, 12, 20) } };
    }
    default: throw new Error('unknown mission type: ' + type);
  }
}

/**
 * genBoardMissions(S, barId, n=4): deterministic board for a bar.
 * Cached in S.world.missions.boards[barId]; mix of good and bad work.
 */
export function genBoardMissions(S, barId, n = 4) {
  ensureState(S);
  const boards = S.world.missions.boards;
  if (!boards[barId]) {
    const r = _rng('board:' + barId);
    const types = ['catch', 'slay', 'kidnap', 'assassinate'];
    // deterministic shuffle so the mix varies per bar but stays stable
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    const list = [];
    for (let i = 0; i < n; i++) list.push(_makeBoardMission(r, barId, i, types[i % types.length]));
    boards[barId] = list;
  }
  return boards[barId];
}

/** Current postings on a bar's board. */
export function boardMissions(S, barId) {
  return genBoardMissions(S, barId);
}

/**
 * Accept a board posting: removes it from the board, adds to active,
 * spawns its target(s), and applies the bad-intent karma hit for dark work.
 */
export function acceptMission(S, barId, idx) {
  ensureState(S);
  const board = genBoardMissions(S, barId);
  const m = board[idx];
  if (!m) return { ok: false, msg: 'No such posting on the board.' };
  if (S.world.missions.active.some(a => a.id === m.id)) return { ok: false, msg: 'You already carry this commission.' };
  board.splice(idx, 1);
  m.state = 'active';
  S.world.missions.active.push(m);
  const def = spawnTarget(S, m);
  if (!MISSION_TYPES[m.type].good) {
    const d = _int(_rng('karma:' + m.id), 8, 15);
    const k = St.addKarma(S, -d);
    St.addNews(S, `🌑 You took dark work: ${m.title}. Your conscience weighs on you.`);
    return { ok: true, msg: `Accepted: ${m.title}. A dark path — your conscience weighs on you. (Karma ${k.delta})`, mission: m, target: def };
  }
  St.addNews(S, `📌 Accepted commission: ${m.title}.`);
  return { ok: true, msg: `Accepted: ${m.title}.`, mission: m, target: def };
}

/**
 * Push this mission's target def into S.world.missionTargets[target.mapId].
 * The hostiles workstream spawns these when the player visits that map.
 */
export function spawnTarget(S, mission) {
  ensureState(S);
  const t = mission.target;
  let def;
  if (mission.type === 'slay') {
    def = { id: `t_${mission.id}_g`, name: t.name, missionId: mission.id,
      role: 'slayGroup', hostile: true, ...TARGET_STATS.demon_brute, count: t.count || 3 };
  } else if (mission.type === 'kidnap') {
    def = { id: `t_${mission.id}`, name: t.name, missionId: mission.id,
      role: 'target', hostile: false, ...TARGET_STATS.villager };
  } else if (mission.type === 'assassinate') {
    def = { id: `t_${mission.id}`, name: t.name, missionId: mission.id,
      role: 'target', hostile: true, ...TARGET_STATS.ninja };
  } else { // catch
    def = { id: `t_${mission.id}`, name: t.name, missionId: mission.id,
      role: 'target', hostile: true, ...TARGET_STATS.bandit };
  }
  if (!S.world.missionTargets[t.mapId]) S.world.missionTargets[t.mapId] = [];
  S.world.missionTargets[t.mapId].push(def);
  return def;
}

function _removeTargets(S, missionId) {
  for (const k of Object.keys(S.world.missionTargets)) {
    S.world.missionTargets[k] = S.world.missionTargets[k].filter(t => t.missionId !== missionId);
  }
}

/** Abandon an active mission. The trail goes cold; targets are withdrawn. */
export function abandonMission(S, missionId) {
  ensureState(S);
  const i = S.world.missions.active.findIndex(m => m.id === missionId);
  if (i < 0) return { ok: false, msg: 'No such active mission.' };
  const [m] = S.world.missions.active.splice(i, 1);
  m.state = 'abandoned';
  _removeTargets(S, missionId);
  return { ok: true, msg: `Abandoned: ${m.title}. The posting fades back into rumor.` };
}

/** Active mission objects (copy of the array). */
export function activeMissions(S) {
  ensureState(S);
  return S.world.missions.active.slice();
}

/** Text log lines: active missions + recently completed ones. */
export function missionLog(S) {
  ensureState(S);
  const lines = [];
  for (const m of S.world.missions.active) {
    const st = m.state === 'done' ? 'ready to turn in' : m.state;
    lines.push(`📌 ${MISSION_TYPES[m.type].label}: ${m.title} — ${st} (reward ${m.reward.gold}g)`);
  }
  for (const m of S.world.missions.done.slice(-5)) {
    lines.push(`${m.state === 'failed' ? '✖' : '✔'} ${m.title} — ${m.state}`);
  }
  if (!lines.length) lines.push(`No commissions yet. Check a sake bar's mission board.`);
  return lines;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Called by combat when a mission target goes down.
 * how: 'killed' | 'captured'.
 * Returns {done, lines}. done=true means the mission reached 'done'/'failed'.
 */
export function onTargetDown(S, targetDef, how = 'killed') {
  ensureState(S);
  const m = S.world.missions.active.find(a => a.id === targetDef.missionId);
  if (!m) return { done: false, lines: [`Nothing stirs. (No active commission matches.)`] };
  if (m.state !== 'active') return { done: false, lines: [] }; // already resolved: ignore
  const res = _resolveTargetDown(S, m, how);
  if (res.done) _removeTargets(S, m.id); // resolved: stop respawning the target
  return res;
}

function _resolveTargetDown(S, m, how) {
  const lines = [];
  switch (m.type) {
    case 'catch': {
      m.state = 'done';
      m.result = how;
      if (how === 'captured') {
        lines.push(`${m.target.name} is bound and delivered. The magistrate nods approvingly.`);
      } else {
        lines.push(`${m.target.name} lies dead. The bounty is yours — but only half the gold, and a colder conscience.`);
      }
      return { done: true, lines };
    }
    case 'slay': {
      m.progress = (m.progress || 0) + 1;
      const left = (m.target.count || 3) - m.progress;
      if (left <= 0) {
        m.state = 'done';
        lines.push(`The last of the ${m.target.name} falls. The roads near ${_mapLabel(m.target.mapId)} breathe easy again.`);
        return { done: true, lines };
      }
      lines.push(`Demon slain — ${left} of the pack remain${left === 1 ? 's' : ''}.`);
      return { done: false, lines };
    }
    case 'assassinate': {
      m.state = 'done';
      m.result = how;
      lines.push(how === 'killed'
        ? `${m.target.name} is dead. The coin is cold, but it spends.`
        : `${m.target.name} is taken alive — your employer will... handle it.`);
      return { done: true, lines };
    }
    case 'kidnap': {
      if (how === 'killed') {
        m.state = 'failed';
        const k = St.addKarma(S, -10);
        St.addNews(S, `🩸 A kidnapping went wrong — the victim is dead. Word of your cruelty spreads.`);
        lines.push(`${m.target.name} is dead. The job is ruined — no one pays for a corpse. (Karma ${k.delta})`);
        return { done: true, lines };
      }
      m.state = 'done';
      m.result = how;
      lines.push(`${m.target.name} is delivered, gagged but unharmed. Your employer counts out the coin.`);
      return { done: true, lines };
    }
    default:
      return { done: false, lines: [`Nothing stirs.`] };
  }
}

/**
 * Turn in a finished mission to its giver. Applies gold, karma, and news.
 * (The integrator checks the player is near the giver before calling.)
 */
export function turnIn(S, missionId) {
  ensureState(S);
  const i = S.world.missions.active.findIndex(m => m.id === missionId);
  if (i < 0) return { ok: false, msg: 'No such active commission.' };
  const m = S.world.missions.active[i];
  if (m.state !== 'done' && m.state !== 'failed') {
    return { ok: false, msg: 'The job is not finished yet.' };
  }
  S.world.missions.active.splice(i, 1);
  S.world.missions.done.push(m);
  _removeTargets(S, missionId);

  if (m.state === 'failed') {
    St.addNews(S, `✖ Commission failed: ${m.title}.`);
    return { ok: true, msg: `The job failed — there is nothing to turn in. ${m.title} is struck from your name.`, gold: 0, karma: 0 };
  }

  let gold = m.reward.gold;
  if (m.type === 'catch' && m.result === 'killed') gold = Math.floor(gold / 2); // corpse pays half
  St.addGold(S, gold);

  let kDelta = 0;
  if (MISSION_TYPES[m.type].good) {
    kDelta = m.reward.karma;
    St.addKarma(S, kDelta);
  } else {
    kDelta = -_int(_rng('karma2:' + m.id), 8, 15); // the rest of the dark price
    St.addKarma(S, kDelta);
  }
  St.addNews(S, `📜 Commission complete: ${m.title} (+${gold} gold).`);
  return { ok: true, msg: `Turned in: ${m.title}. +${gold} gold${kDelta ? `, karma ${kDelta > 0 ? '+' : ''}${kDelta}` : ''}.`, gold, karma: kDelta };
}

// ---------------------------------------------------------------------------
// NPC / daimyo requests
// ---------------------------------------------------------------------------

/** NPC ids that can personally commission the player. */
export const NPC_GIVERS = ['noble_fujiwara', 'elder_mosuke', 'merchant_daijiro'];

function _makeNpcMission(r, npcId) {
  const id = 'm_npc_' + npcId;
  const base = { id, giver: { kind: 'npc', npcId }, state: 'offer', progress: 0 };
  if (npcId === 'noble_fujiwara') {
    if (r() < 0.5) {
      const name = _pick(r, CRIMINALS);
      return { ...base, type: 'catch',
        title: `Court justice: ${name}`,
        desc: `Fujiwara no Michitaka asks, in the court's name: ${name} stole tribute silver and ${ _pick(r, CRIMINAL_HAUNTS)} of Kyoto. Bring the thief to heel.`,
        target: { name, kind: 'criminal', mapId: 'kyoto' },
        reward: { gold: _int(r, 130, 200), karma: _int(r, 5, 8) } };
    }
    const pack = _pick(r, DEMON_PACKS);
    return { ...base, type: 'slay',
      title: `Purge the ${pack}`,
      desc: `Fujiwara no Michitaka asks: a ${pack} ${ _pick(r, DEMON_HAUNTS)} near Mt. Hiei frightens the pilgrims. Three beasts — put them down in the court's name.`,
      target: { name: pack, kind: 'demon', mapId: 'hiei', count: 3 },
      reward: { gold: _int(r, 130, 200), karma: _int(r, 5, 8) } };
  }
  if (npcId === 'elder_mosuke') {
    const name = _pick(r, CRIMINALS);
    return { ...base, type: 'catch',
      title: `Bandits trouble Kutsuki`,
      desc: `Elder Mosuke pleads: ${name} and his curs ${ _pick(r, CRIMINAL_HAUNTS)} of Kutsuki, stealing rice and terrorizing the village. Drive them off — dead or bound.`,
      target: { name, kind: 'criminal', mapId: 'kutsuki' },
      reward: { gold: _int(r, 90, 140), karma: _int(r, 4, 7) } };
  }
  // merchant_daijiro
  const pack = _pick(r, DEMON_PACKS);
  return { ...base, type: 'slay',
    title: `Clear the trade road`,
    desc: `Daijirō the merchant begs: a ${pack} ${ _pick(r, DEMON_HAUNTS)} near Sakai waylays his porters. Three beasts — clear the road and name your price.`,
    target: { name: pack, kind: 'demon', mapId: 'sakai', count: 3 },
    reward: { gold: _int(r, 120, 180), karma: _int(r, 4, 7) } };
}

/**
 * The current personal offer from an NPC giver, or null.
 * One offer per NPC at a time; null while their commission is active.
 */
export function npcOffer(npcId, S) {
  ensureState(S);
  if (!NPC_GIVERS.includes(npcId)) return null;
  const busy = S.world.missions.active.some(m => m.giver && m.giver.kind === 'npc' && m.giver.npcId === npcId);
  if (busy) return null;
  if (!S.world.missions.npcOffers[npcId]) {
    S.world.missions.npcOffers[npcId] = _makeNpcMission(_rng('npcoffer:' + npcId), npcId);
  }
  return S.world.missions.npcOffers[npcId];
}

/** Accept an NPC's personal offer. Turn it in by speaking to them again. */
export function acceptNpcOffer(S, npcId) {
  ensureState(S);
  const offer = npcOffer(npcId, S);
  if (!offer) return { ok: false, msg: 'They have no work for you right now.' };
  delete S.world.missions.npcOffers[npcId];
  offer.state = 'active';
  S.world.missions.active.push(offer);
  const def = spawnTarget(S, offer);
  St.addNews(S, `📌 Accepted: ${offer.title} (for ${npcId}).`);
  return { ok: true, msg: `Accepted: ${offer.title}.`, mission: offer, target: def };
}
