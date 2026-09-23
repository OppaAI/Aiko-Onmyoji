// aiko.js — Aiko, the bound shikigami companion.
// State-aware banter, bond system, karma reactions, and the AikoServer
// adapter interface (swap in a live LLM backend without touching game code).

import {
  clamp, karmaTier, pick, rand, timeOfDay, nengo, recentNews,
  addKarma, addGold, addItem, removeItem, bondChange, setFlag, addNews,
} from './state.js';
import { serverUrl } from './aiko_link.js';
import { kissAllowed, sexAllowed } from './actions.js';
import { changeRep, factionDef, factionDisplayName, currentDaimyo, rankName } from './factions.js';
import { locationName } from './map.js';

// ---------------------------------------------------------------------------
// Template banter engine (default backend)
// ---------------------------------------------------------------------------

function hpPct(s) { return s.player.hp / s.player.maxHp; }

export function aikoLine(s, ctx = {}) {
  const { situation = 'idle', extra = '' } = ctx;
  const tier = karmaTier(s.player.karma);
  const bond = s.aiko.bond;
  const loc = locationName(s.player.location);
  const time = timeOfDay(s.world.hour).toLowerCase();
  const name = s.player.name;
  const L = [];

  switch (situation) {
    case 'lowhp':
      L.push(
        `${name}! You're bleeding all over my nice sleeves. Fall back and let me patch you up!`,
        `Hey — hey! Your HP is nearly gone. Do you WANT to become a ghost? Because I know some.`,
        `Master, please. ${Math.ceil(s.player.hp)} HP is not a strategy. Let me heal you.`,
      );
      if (bond >= 70) L.push(`Don't you dare die on me, ${name}. I did NOT sign up for a dead master.`);
      break;
    case 'victory':
      L.push(
        `Ha! Did you see that? …I mean, of course you did. You're welcome.`,
        `Another spirit settled. The roads feel a little lighter already.`,
        bond >= 60 ? `We make a good team, ${name}. Don't let it go to your head.` : `Victory! Try to look half as graceful as me next time.`,
      );
      if (tier === 'ruthless' || tier === 'harsh') L.push(`…You didn't have to finish them like that. Even I felt that one.`);
      break;
    case 'defeat':
      L.push(
        `Ugh… I dragged you out by the collar. Again. You're buying me buns for this.`,
        `We live! Barely. Next time, maybe listen when I say "that's an oni."`,
      );
      break;
    case 'travel':
      L.push(
        `${loc}, ${time.toLowerCase()}. ${extra}`,
        `On the road again. Stay close — the ${time.toLowerCase()} roads have eyes.`,
      );
      break;
    case 'karma_up':
      L.push(
        `Ooh, that was kind of you. See? Benevolence looks good on you, ${name}.`,
        `A little light just settled on your shoulders. I like it there.`,
      );
      if (bond >= 70) L.push(`This is the master I chose to serve. Never change. …Okay, change a little. Smell better.`);
      break;
    case 'karma_down':
      L.push(
        `…Was that really necessary? I'm keeping a list, you know. A little list.`,
        `Hmph. Do that again and I'm telling the kami on you.`,
      );
      if (bond < 30) L.push(`You keep this up and I'll start charging hazard pay. In buns.`);
      break;
    case 'neglect':
      L.push(
        `You walked right past someone who needed help. …Noted. Coldly noted.`,
        `Hmph. "Free world," you said. "Do anything," you said. Including nothing, apparently.`,
      );
      break;
    case 'heeded':
      L.push(
        `Good call listening to me. I accept payment in compliments.`,
        `See? Shikigami knows best. Write that down.`,
      );
      break;
    case 'protect':
      L.push(
        `You… you shielded me. ${bond >= 60 ? 'My master, my idiot, my favorite.' : 'Noted. I might even remember this fondly.'}`,
      );
      break;
    case 'danger':
      L.push(
        `Sending ME in first? Bold. Rude. Bold AND rude. Fine — watch and learn.`,
        `If I get scratched, you're explaining it to my fan club.`,
      );
      break;
    case 'lore': // location remarks
      return loreRemark(s);
    case 'idle':
    default:
      // sometimes Aiko muses on the flow of history instead of small talk
      if (Math.random() < 0.35) return historyRemark(s);
      L.push(
        `So. ${loc}, ${time.toLowerCase()}. What's the plan, ${name}?`,
        bond >= 70 ? `Being your shikigami is… not the worst fate. Don't quote me.` : `A bound spirit, a wandering diviner, and the whole of Sengoku Japan. What could go wrong?`,
        tier === 'benevolent' ? `The little shrine spirits wave at you when you pass. You've made friends, ${name}.` :
        tier === 'ruthless' ? `Even the crows give you a wide berth lately. Charming.` :
        `The wind smells of rain and old battles. Typical Tuesday in the Sengoku era.`,
      );
  }
  return pick(L);
}

// Aiko comments on the flow of real history: the date, the latest tidings,
// the lord you serve (or don't), and the daimyo you've met.
function historyRemark(s) {
  const L = [];
  const ng = nengo(s.world.y, s.world.m);
  L.push(`${ng}, year ${s.world.y}. History is happening all around us, ${s.player.name}. Try not to get trampled by it.`);
  const news = recentNews(s, 1)[0];
  if (news) L.push(`Latest tidings: "${news.text.replace(/^[^\s]+\s/, '').slice(0, 110)}${news.text.length > 115 ? '…' : ''}" The bards are already exaggerating, probably.`);
  const fid = s.world.service.faction;
  if (fid) {
    const dm = currentDaimyo(s, fid);
    L.push(`So we're ${rankName(s)}s of ${factionDisplayName(s, fid)} now, serving ${dm.name}. I never thought I'd be a soldier's fox. It suits you. Mostly.`);
    if (s.player.fame >= 40) L.push(`Your name carries weight these days, ${rankName(s)} ${s.player.name}. Even the camp dogs salute you. Probably.`);
  } else {
    L.push(`Free as the wind, master of no one, servant of none. Very romantic. Very unpaid.`);
    if (s.player.fame >= 30) L.push(`The daimyo are starting to notice you, ${s.player.name}. Careful — fame is a door, and doors swing both ways.`);
  }
  const met = Object.keys(s.world.metDaimyo || {});
  if (met.length >= 3) L.push(`You've stood before ${met.length} of the great lords and lived. I'm choosing to be impressed rather than terrified.`);
  if (s.world.flags.anegawa_upset || s.world.flags.nagashino_upset) {
    L.push(`You BENT history, ${s.player.name}. The bards will argue about that battle for a thousand years — and we'll know the truth.`);
  }
  return pick(L);
}

function loreRemark(s) {
  const id = s.player.location;
  const M = {
    kyoto: [
      'They say the capital has a hundred thousand spirits and only ten thousand priests. Job security for us.',
      'Honnō-ji… every time we pass it, my paper skin crawls. Something is wrong there.',
    ],
    sakai: [
      'Coin, coin, coin. This city would sell the moon if it could find the deed.',
      'The merchant here waters his money plants daily. I checked. They are just plants.',
    ],
    otsu: [
      'Lake Biwa is old. Older than grudges. Mind the kappa — they mind YOU, so it evens out.',
      'Cucumbers. Remember: kappa, cucumbers, bowing. Survival basics.',
    ],
    azuchi: [
      'That castle gets taller every time I look at it. Compensating for something, probably.',
      'Soldiers everywhere. Try not to look like a spy. You look exactly like a spy.',
    ],
    gifu: [
      'Nobunaga\'s mountain seat. The wind up here smells of gunpowder and very large plans.',
      'They say he was called the Fool of Owari once. Nobody calls him that twice.',
    ],
    odani: [
      'Beautiful castle. Tragic castle. You can feel the sorrow in the stones, and the Oda drums getting closer.',
      'Nagamasa-sama... torn between oath and family. Even I feel sorry for him. Don\'t tell him I said that.',
    ],
    ichijodani: [
      'Poetry salons and painted screens — and walls that have never been tested. I give it... hmm. Let\'s enjoy the poetry while it lasts.',
      'Everyone here is so CULTURED. I feel underdressed. I\'m a fox made of paper. I\'m always underdressed.',
    ],
    hamamatsu: [
      'Ieyasu\'s town. Everything is tidy. Suspiciously tidy. I bet he irons his battle plans.',
      'The tanuki waits. Everyone else rushes. Guess who\'s still standing at the end? …The tanuki. It\'s always the tanuki.',
    ],
    kofu: [
      'The Tiger\'s den! Cavalry drills at dawn, war councils at dusk. My fur stands on end — in a good way. Mostly.',
      'Fūrinkazan. Wind, forest, fire, mountain. I\'m... paper. Please keep me away from the fire part.',
    ],
    kasugayama: [
      'Kenshin\'s mountain. Cold, stern, holy. I feel like I should whisper. Even my thoughts are whispering.',
      'The God of War lives here. I polished my halo. Do I have a halo? I\'m getting one.',
    ],
    koriyama: [
      'The Mōri seat. Calm, green, patient. These people could out-wait a stone.',
      'Three arrows, one bundle. Meanwhile we\'re two idiots and a paper fox. We\'re doing fine. Probably.',
    ],
    odawara: [
      'Walls within walls within walls. The Hōjō built a castle the way other people build excuses: thoroughly.',
      'Everything here is counted twice. I counted the guards counting. They counted me back.',
    ],
    ishiyama: [
      'Ten thousand voices chanting as one. It raises the hair on my paper neck — faith like that moves mountains. Or stops armies.',
      'The monks here look at me like I\'m a stray thought. Rude. Accurate, but rude.',
    ],
    hiei: [
      'The monks here glare at me like I\'m overdue library books. I\'m a SPIRIT, I don\'t need books.',
      'Sacred mountain. Sacred mosquitos, too. Enormous ones.',
    ],
    sekigahara: [
      'So many old battlefields. The grass here grows over armor and no one bothers to move it.',
      'Keep your hand near your sword. Or near me. Preferably me.',
    ],
    kutsuki: [
      'A quiet village. The rice smells wonderful. The gossip smells better.',
      'The elder tells the same story every visit. I mouth along now. It\'s tradition.',
    ],
    forest: [
      'Foxfire! Pretty. Do NOT follow it. …Okay, follow it a LITTLE. I\'ll be right behind you.',
      'The bamboo whispers names. Mine, mostly. Rude bamboo.',
    ],
    shrine: [
      'This shrine is so old the kami here pay rent in dust. Be gentle with Oyuki.',
      'Hana keeps the lanterns lit for ghosts no one else remembers. That\'s… sweet, actually.',
    ],
    honnoji: [
      'The Hollow Bell. I can hear it and there IS no bell. That is the worst kind of bell.',
      'Whatever we face in there — we face it together. That\'s the contract. That\'s everything.',
    ],
  };
  return pick(M[id] || M.kyoto);
}

// ---------------------------------------------------------------------------
// Reactions to game events (called by main.js / combat.js)
// ---------------------------------------------------------------------------

export function reactToKarma(s, delta) {
  if (delta >= 5) return aikoLine(s, { situation: 'karma_up' });
  if (delta <= -5) return aikoLine(s, { situation: 'karma_down' });
  return null;
}

// event: 'protect' | 'heeded' | 'danger' | 'cruel' | 'kind' | 'neglect'
export function onEvent(s, event) {
  switch (event) {
    case 'protect': return aikoLine(s, { situation: 'protect' });
    case 'heeded': return aikoLine(s, { situation: 'heeded' });
    case 'danger': return aikoLine(s, { situation: 'danger' });
    case 'neglect': return aikoLine(s, { situation: 'neglect' });
    default: return null;
  }
}

// Battle banter: called each combat round with live combat context.
export function battleBanter(s, c) {
  const e = c.enemy;
  const L = [];
  if (s.player.hp / s.player.maxHp < 0.3) return aikoLine(s, { situation: 'lowhp' });
  if (s.aiko.hp / s.aiko.maxHp < 0.3 && c.aikoOrder === 'strike') {
    return `I'm running on fumes here! Either heal me or stop throwing me at ${e.name}!`;
  }
  if (c.round === 1) {
    L.push(
      `A wild ${e.name} appears! …Sorry. Habit. ${e.taunt}`,
      `${e.name}, huh? ${e.kind === 'yokai' ? 'Leave the spooky one to me.' : 'Humans. Always humans. Fine.'}`,
    );
  } else if (e.hp / e.maxHp < 0.3 && !c.spareOffered && e.sprable !== false) {
    L.push(
      `It's faltering! We could spare it, ${s.player.name}… or not. Your call, master.`,
      `Look at it tremble. Mercy or judgment? Choose — I'll back you either way.`,
    );
  } else {
    L.push(
      `Keep your guard up! Its ${e.kind === 'yokai' ? 'spirit' : 'stance'} is wavering.`,
      `My paper talons are ready. Just say the word.`,
      s.player.rei < 8 ? `Your rei is running low — swing the sword, save the spells!` : `We've got this. Probably. Mostly.`,
    );
  }
  return pick(L);
}

// ---------------------------------------------------------------------------
// AikoServer adapter interface
// ---------------------------------------------------------------------------
// Contract: async generate({ gameState, speaker, history }) -> string (dialogue text).
// - gameState: the full save-state object (player/aiko/world).
// - speaker:   'aiko' | 'narrator' | npcId — who should speak.
// - history:   array of {speaker, text} — recent dialogue for continuity.
// The DEFAULT implementation below uses the template engine above.
// To plug in a live LLM backend, replace `AikoServer.generate` with an
// async function that POSTs to your server and returns the text — no other
// game code needs to change.

function summarizeState(s) {
  const { dateKey } = { dateKey: (x) => `${x.world.y}-${String(x.world.m).padStart(2, '0')}-${String(x.world.d).padStart(2, '0')}` };
  return {
    player: {
      name: s.player.name, hp: s.player.hp, maxHp: s.player.maxHp,
      rei: s.player.rei, level: s.player.level, karma: s.player.karma,
      karmaTier: karmaTier(s.player.karma), gold: s.player.gold,
      fame: s.player.fame, honor: s.player.honor,
      location: locationName(s.player.location),
      serving: s.world.service.faction ? `${factionDisplayName(s, s.world.service.faction)} (${rankName(s)})` : null,
      courtRank: s.world.courtRank,
    },
    aiko: { bond: s.aiko.bond, mood: s.aiko.mood, hp: s.aiko.hp },
    world: {
      date: dateKey(s),
      questFlags: s.world.questFlags,
      latestNews: (s.world.news || []).slice(-3).map((n) => n.text),
    },
  };
}

// ---------------------------------------------------------------------------
// Freeform-action server seam (POST /api/onmyoji/do)
// ---------------------------------------------------------------------------
// After any act() failure the client stays offline for a while so every
// typed command doesn't pay a timeout while the server is down.
const SERVER_COOLDOWN_MS = 60000;
let serverCooldownUntil = 0;

// Nearby entities for the extended compact state. `adult` comes from the
// dialogue.js NPC records (`adult: true` on the romanceable NPCs) — the
// same source of truth the game's adult gating uses.
export function collectPresent(world) {
  const present = [];
  if (!world) return present;
  for (const n of world.npcs || []) {
    const rec = n.rec || {};
    present.push({
      id: n.id,
      kind: /^daimyo_/.test(n.id) ? 'historical' : 'npc',
      name: rec.name || n.id,
      adult: rec.adult === true,
      hostile: rec.hostile === true,
      disposition: rec.hostile ? 'hostile' : (rec.disposition || 'neutral'),
    });
  }
  for (const h of world.hostiles || []) {
    present.push({
      id: h.id,
      kind: h.kind === 'demon' ? 'demon' : h.kind === 'animal' ? 'animal' : 'npc',
      name: h.name || h.id,
      adult: false,
      hostile: h.hostile !== false,
      disposition: 'hostile',
    });
  }
  for (const a of world.animals || []) {
    present.push({
      id: a.id, kind: 'animal', name: a.name || a.id,
      adult: false, hostile: !!a.hostile,
      disposition: a.hostile ? 'hostile' : 'neutral',
    });
  }
  for (const g of world.shikigamiVis || []) {
    present.push({
      id: g.gid || g.id, kind: 'spirit', name: g.name || g.id,
      adult: false, hostile: false, disposition: 'loyal',
    });
  }
  return present;
}

// Bound shikigami (Aiko included) for the extended compact state.
export function collectParty(s) {
  return ((s && s.world && s.world.shikigami) || [])
    .map((g) => ({ id: g.id, name: g.name, kind: g.kind || 'spirit' }));
}

// Extended compact state for /api/onmyoji/do: the base summarizeState plus
// nearby entities, the bound party, and the player's hard capability limits
// (the server refuses flight, water-walking, wall-passing, teleporting).
export function summarizeStateExtended(gameState, extra = {}) {
  const base = summarizeState(gameState);
  return {
    ...base,
    player: { ...base.player, canFly: false, canCrossWater: false },
    present: Array.isArray(extra.present) ? extra.present : [],
    party: Array.isArray(extra.party) ? extra.party : [],
  };
}

const SERVER_FLAG_PREFIX = 'server_';

function serverFlagAllowed(flag) {
  if (typeof flag !== 'string') return false;
  const key = flag.trim().toLowerCase();
  if (!key.startsWith(SERVER_FLAG_PREFIX)) return false;
  if (/(^|_)(lover|aff|coerced)(_|$)/.test(key)) return false;
  if (/__proto__|(^|_)(prototype|constructor)(_|$)/.test(key)) return false;
  return /^server_[a-z0-9_]+$/.test(key);
}

// Deterministic application of server-computed effect descriptors.
// Returns human-readable notes (display is the caller's choice).
export function applyServerEffects(s, effects) {
  const notes = [];
  for (const ef of effects || []) {
    if (!ef || typeof ef !== 'object') continue;
    switch (ef.type) {
      case 'karma': {
        const r = addKarma(s, Number(ef.delta) || 0);
        notes.push(`karma ${r.delta > 0 ? '+' : ''}${r.delta} → ${r.tier}`);
        break;
      }
      case 'faction': {
        // Unknown faction ids are ignored (changeRep would throw on them).
        if (ef.faction && factionDef(ef.faction)) {
          changeRep(s, ef.faction, Number(ef.delta) || 0);
          notes.push(`faction ${ef.faction} ${ef.delta > 0 ? '+' : ''}${ef.delta}`);
        }
        break;
      }
      case 'mp': { // server "mp" is the game's rei
        s.player.rei = clamp(s.player.rei + (Number(ef.delta) || 0), 0, s.player.maxRei);
        notes.push(`rei ${ef.delta > 0 ? '+' : ''}${ef.delta}`);
        break;
      }
      case 'hp': {
        s.player.hp = clamp(s.player.hp + (Number(ef.delta) || 0), 1, s.player.maxHp);
        notes.push(`hp ${ef.delta > 0 ? '+' : ''}${ef.delta}`);
        break;
      }
      case 'bond': {
        const r = bondChange(s, Number(ef.delta) || 0, 'server');
        notes.push(`bond ${r.delta > 0 ? '+' : ''}${r.delta} → ${r.now}`);
        break;
      }
      case 'gold': {
        const g = addGold(s, Number(ef.delta) || 0);
        notes.push(`gold ${ef.delta > 0 ? '+' : ''}${ef.delta} → ${g}`);
        break;
      }
      case 'item': {
        const id = String(ef.item || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
        if (!id) break;
        if (ef.op === 'take') {
          const ok = removeItem(s, id, 1);
          notes.push(ok ? `lost ${id}` : `no ${id} to take`);
        } else {
          addItem(s, id, 1);
          notes.push(`got ${id}`);
        }
        break;
      }
      case 'consequence': {
        if (ef.note) { addNews(s, String(ef.note)); notes.push('noted: ' + String(ef.note).slice(0, 80)); }
        break;
      }
      case 'flag': {
        if (serverFlagAllowed(ef.flag)) {
          const key = ef.flag.trim().toLowerCase();
          setFlag(s, key, ef.value);
          notes.push(`flag ${key}`);
        }
        break;
      }
      default: break; // unknown descriptors are ignored, never applied
    }
  }
  return notes;
}

const FREEFORM_DIRS = {
  north: 'up', n: 'up', up: 'up',
  south: 'down', s: 'down', down: 'down',
  west: 'left', w: 'left', left: 'left',
  east: 'right', e: 'right', right: 'right',
};
function freeformDir(d) {
  const k = String(d || '').toLowerCase().trim();
  return FREEFORM_DIRS[k] || null;
}

// Map a server intent {verb, target, args, aiko_command, adult, forced} to a
// local intent shaped exactly like chat.js parseCommand() output, so it flows
// through the game's existing handlers in main.js execIntent().
// Returns null for verbs the server resolves purely via narration+effects.
export function mapFreeformIntent(intent) {
  if (!intent || typeof intent.verb !== 'string') return null;
  const verb = intent.verb.toLowerCase();
  const args = intent.args || {};
  const target = intent.target || '';
  switch (verb) {
    case 'travel': {
      const d = freeformDir(args.dir);
      return d ? { type: 'travel', dir: d }
        : { type: 'unknown', hint: 'Travel where? Try "travel north".' };
    }
    case 'move': {
      const d = freeformDir(args.dir);
      if (!d) return { type: 'unknown', hint: 'Move where?' };
      const steps = Math.max(1, Math.min(20, parseInt(args.steps, 10) || 1));
      return { type: 'move', dir: d, steps };
    }
    case 'rest': return { type: 'action', action: 'rest' };
    case 'strike':
      // aiko_command: Aiko (or a named shikigami) strikes; otherwise the player.
      return intent.aiko_command
        ? { type: 'shikigamiAttack', target, who: args.who || 'aiko' }
        : { type: 'action', action: 'fight', target };
    case 'bind': return { type: 'bind', target };
    case 'flee': return { type: 'flee' };
    case 'command': {
      const order = String(args.order || args.sub || '').toLowerCase();
      if (/attack|strike|fight|kill/.test(order)) {
        return { type: 'shikigamiAttack', target: target || args.target || '', who: args.who || 'aiko' };
      }
      return { type: 'aiko', sub: args.sub || 'follow', target: target || args.target || '' };
    }
    case 'talk': return { type: 'action', action: 'talk', target };
    case 'recruit': return { type: 'recruit', target };
    case 'release': return { type: 'release', target };
    case 'give': return { type: 'action', action: 'give', target, item: args.item || args.what || '' };
    case 'steal': return { type: 'steal', target };
    case 'kiss': return { type: 'action', action: 'kiss', target };
    case 'intimate':
      return { type: 'sex', target, force: !!intent.forced, template: args.template || null };
    case 'work': return { type: 'request', target };
    case 'possess': return { type: 'aiko', sub: 'possess', target };
    case 'search':
    case 'ward':
      return null; // narration + effects only; no local handler
    default:
      return null;
  }
}

function validateRelationshipIntent(local, gameState, present) {
  const check = local && local.type === 'action' && local.action === 'kiss'
    ? kissAllowed
    : local && local.type === 'sex'
      ? sexAllowed
      : null;
  if (!check) return true;
  const targetId = String(local.target || '').toLowerCase();
  const target = (Array.isArray(present) ? present : []).find(
    (entity) => String(entity && entity.id || '').toLowerCase() === targetId,
  );
  if (!target) return 'That person is not here.';
  return check(target, gameState);
}

export const AikoServer = {
  async generate({ gameState, speaker = 'aiko', history = [] }) {
    // Default template backend. A live server would receive:
    //   { state: summarizeState(gameState), speaker, history }
    // and return generated text.
    void history;
    if (speaker === 'aiko') {
      return aikoLine(gameState, { situation: 'idle' });
    }
    if (speaker === 'narrator') {
      return 'The wind moves through the pines, carrying the smell of rain.';
    }
    // npcId speakers fall back to a neutral prompt line; dialogue.js owns
    // full NPC content, this is only a last-resort adapter path.
    return '…';
  },
  // Exposed so a server backend can request the compact context itself.
  summarizeState,

  // Live freeform-action path: POST the player's typed text plus the
  // extended compact state to the Aiko-chan server's /api/onmyoji/do
  // endpoint, apply the returned effects, and route the returned intent
  // into the game's existing action handlers (via hooks.route).
  //
  // args: { text, gameState, hooks, timeoutMs }
  // hooks: { present, party, route(intent), sys(text), afterEffects(notes), url }
  //   present/party feed summarizeStateExtended; route receives a local
  //   intent shaped exactly like chat.js parseCommand() output; sys shows
  //   system text; url optionally overrides the configured server URL.
  // Returns true when the server handled the command (success OR refusal),
  // false on ANY failure (unreachable, timeout, bad JSON) — the caller
  // falls through to the offline parser. Never throws.
  async act({ text, gameState, hooks = {}, timeoutMs = 10000 }) {
    const sys = typeof hooks.sys === 'function' ? hooks.sys : () => {};
    if (Date.now() < serverCooldownUntil) return false; // recent failure: stay offline
    const url = String(hooks.url || serverUrl()).replace(/\/+$/, '');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url + '/api/onmyoji/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          state: summarizeStateExtended(gameState, {
            present: hooks.present || [],
            party: hooks.party || [],
          }),
        }),
        signal: ctl.signal,
      });
      if (!r.ok) throw new Error('server answered ' + r.status);
      const data = await r.json();
      if (!data || typeof data !== 'object') throw new Error('bad JSON');
      serverCooldownUntil = 0; // the server spoke: clear any cooldown
      if (data.ok !== true || data.refused === true) {
        // Refused (or explicit error): show the reason, apply NO effects.
        sys(data.narration || data.reason || 'The spirits decline to do that.');
        return true;
      }
      const local = mapFreeformIntent(data.intent);
      const validation = validateRelationshipIntent(local, gameState, hooks.present);
      if (validation !== true) {
        sys(typeof validation === 'string' ? validation : 'That is not allowed here.');
        return true;
      }
      let notes = [];
      try {
        notes = applyServerEffects(gameState, data.effects);
      } catch (err) {
        // A bad effect descriptor must not re-trigger the offline path
        // (effects may already be partially applied) — report and stay handled.
        sys('The spirits falter: ' + (err && err.message ? err.message : err));
      }
      if (data.narration) sys(data.narration);
      if (local && typeof hooks.route === 'function') {
        try {
          hooks.route(local);
        } catch (err) {
          // A routing failure must not re-trigger the offline path (effects
          // were already applied) — report it and stay handled.
          sys('The spirits falter: ' + (err && err.message ? err.message : err));
        }
      }
      if (typeof hooks.afterEffects === 'function') {
        try { hooks.afterEffects(notes); } catch (_) { /* display-only */ }
      }
      return true;
    } catch (err) {
      // ANY failure: back off for a while, then fall through to offline.
      serverCooldownUntil = Date.now() + SERVER_COOLDOWN_MS;
      return false;
    } finally {
      clearTimeout(t);
    }
  },
};
