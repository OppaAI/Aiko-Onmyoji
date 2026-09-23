// game/js/chat.js
// Aiko's chat brain + the player's freeform command parser.
// ES module. No dependencies, no DOM — pure logic the UI wires up.
//
// Exports:
//   SEX_VERBS    — verb phrases that imply the sex action (parser + UI hints)
//   parseCommand(input, ctx) -> intent object, {type:'chat'}, or {type:'unknown', hint}
//   AikoBrain    — local personality engine. respond(input, ctx) -> {text, mood}
//
// Aiko is a fox-spirit shikigami companion. She is STRICTLY PLATONIC:
// she always deflects anything sexual, warmly but firmly.

// ---------------------------------------------------------------------------
// Verb phrases that imply the sex action. Used by parseCommand and by the UI
// to hint what the player can type.
// ---------------------------------------------------------------------------
export const SEX_VERBS = [
  'sleep with',
  'make love to',
  'make love with',
  'have sex with',
  'be intimate with',
  'go to bed with',
  'take to bed',
  'spend the night with',
  'take to the futon',
  'ravish',
  'seduce',
  'bed',
  'fuck',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const norm = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

const DIRS = {
  north: 'up', n: 'up', up: 'up',
  south: 'down', s: 'down', down: 'down',
  west: 'left', w: 'left', left: 'left',
  east: 'right', e: 'right', right: 'right',
};

// Find an NPC by name fragment (case-insensitive) against [{id, name}].
function findNpc(nearby, frag) {
  const f = norm(frag);
  if (!f || !Array.isArray(nearby)) return null;
  return (
    nearby.find((n) => norm(n.name) === f || norm(n.id) === f) ||
    nearby.find((n) => norm(n.name).startsWith(f)) ||
    nearby.find((n) => norm(n.name).includes(f) || norm(n.id).includes(f)) ||
    null
  );
}

function findBoundShikigami(S, frag) {
  const f = norm(frag);
  const bound = S && S.world && Array.isArray(S.world.shikigami) ? S.world.shikigami : [];
  if (!f) return null;
  const exact = bound.find((g) => norm(g.id) === f || norm(g.name) === f);
  if (exact) return exact;
  const matches = bound.filter((g) => norm(g.name).includes(f));
  return matches.length === 1 ? matches[0] : null;
}

const hasWord = (t, ...words) => words.some((w) => new RegExp(`\\b${w}\\b`).test(t));

// Building words: "enter the bar" enters the building instead of walking to it.
const BUILDING_RE = /^(bar|tavern|brothel|shop|store|inn|shrine|house|pub|smith|weaponsmith)\b/;
const stripArticle = (s) => String(s || '').replace(/^(the|a|an)\s+/, '');

// ---------------------------------------------------------------------------
// parseCommand(input, ctx) -> intent
// ctx: { nearby: [{id, name}], S }
// ---------------------------------------------------------------------------
export function parseCommand(input, ctx = {}) {
  const t = norm(input);
  const nearby = ctx.nearby || [];
  if (!t) return { type: 'chat' };

  // -- meta ---------------------------------------------------------------
  if (/^(help|commands|\?|what can i do|how do i play|show commands)$/.test(t)) return { type: 'help' };
  if (/^(where am i|where are we|status|who am i|look around|look)$/.test(t)) return { type: 'status' };

  // -- aiko orders ----------------------------------------------------------
  let m = t.match(/^aiko[,\s]+(fly|land|follow|hide|come|stay)\b/);
  if (m) {
    const sub = { come: 'follow', stay: 'hide' }[m[1]] || m[1];
    return { type: 'aiko', sub };
  }
  m = t.match(/^possess\s+(.+)$/);
  if (m) {
    const npc = findNpc(nearby, m[1]);
    return npc
      ? { type: 'aiko', sub: 'possess', target: npc.id }
      : { type: 'unknown', hint: `Aiko can't find anyone called "${m[1]}" nearby to possess.` };
  }
  m = t.match(/^enter\s+(.+?)'s body$/) || t.match(/^get inside\s+(.+)$/);
  if (m) {
    const npc = findNpc(nearby, m[1]);
    return npc
      ? { type: 'aiko', sub: 'possess', target: npc.id }
      : { type: 'unknown', hint: `Aiko can't find anyone called "${m[1]}" nearby to possess.` };
  }
  if (t === 'possess' || /^aiko[,\s]+possess$/.test(t)) return { type: 'aiko', sub: 'possess' };
  if (/^(release|let go|leave (the|her|his) body|aiko[,\s]+release)$/.test(t)) return { type: 'aiko', sub: 'release' };

  // -- doors ------------------------------------------------------------------
  m = t.match(/^(open|unlock)\s+(?:the\s+)?(.+)$/);
  if (m) return { type: 'door', sub: m[1] === 'unlock' ? 'unlock' : 'open', target: m[2] };

  // -- warp -------------------------------------------------------------------
  m = t.match(/^(warp|teleport)\s+(?:to\s+)?(.+)$/);
  if (m) return { type: 'warp', to: m[2] };

  // -- sex --------------------------------------------------------------------
  // "force <name>" — coercive; the game resolves consent from the situation.
  m = t.match(/^(force|take by force)\s+(.+)$/);
  if (m) {
    const npc = findNpc(nearby, m[2]);
    return npc
      ? { type: 'sex', target: npc.id, force: true, template: 'rough' }
      : { type: 'unknown', hint: `Force whom? Nobody called "${m[2]}" is here.` };
  }
  for (const verb of SEX_VERBS) {
    const i = t.indexOf(verb);
    if (i >= 0) {
      const frag = t.slice(i + verb.length).trim().replace(/^(with|to)\s+/, '');
      if (!frag) return { type: 'unknown', hint: `Who do you want to ${verb}?` };
      const npc = findNpc(nearby, frag);
      if (!npc) return { type: 'unknown', hint: `Nobody called "${frag}" is here.` };
      const template = /make love/.test(verb) ? 'tender' : /ravish|fuck/.test(verb) ? 'rough' : undefined;
      const out = { type: 'sex', target: npc.id };
      if (template) out.template = template;
      return out;
    }
  }

  // -- social / combat actions ---------------------------------------------------
  m = t.match(/^(talk|speak|chat|greet)\s+(?:to|with)\s+(.+)$/) || t.match(/^(talk|speak|greet)\s+(.+)$/);
  if (m) {
    const frag = m[2];
    if (hasWord(frag, 'aiko') || frag === 'me' || frag === 'myself') return { type: 'chat' };
    const npc = findNpc(nearby, frag);
    return npc
      ? { type: 'action', action: 'talk', target: npc.id }
      : { type: 'unknown', hint: `Talk to whom? Nobody called "${frag}" is here.` };
  }
  m = t.match(/^shake(?:\s+hands?)?\s+with\s+(.+)$/) || t.match(/^shake\s+(.+?)'s\s+hands?$/);
  if (m) {
    const npc = findNpc(nearby, m[1]);
    return npc
      ? { type: 'action', action: 'shake', target: npc.id }
      : { type: 'unknown', hint: `Shake hands with whom? Nobody called "${m[1]}" is here.` };
  }
  m = t.match(/^kiss\s+(.+)$/);
  if (m) {
    if (hasWord(m[1], 'aiko')) return { type: 'chat' }; // she deflects, platonically
    const npc = findNpc(nearby, m[1]);
    return npc
      ? { type: 'action', action: 'kiss', target: npc.id }
      : { type: 'unknown', hint: `Kiss whom? Nobody called "${m[1]}" is here.` };
  }
  m = t.match(/^(attack|fight|hit|strike|kill|slay|murder|assassinate|punch|smack|challenge)\s+(?:the\s+)?(.+)$/);
  if (m) {
    const npc = findNpc(nearby, m[2]);
    return npc
      ? { type: 'action', action: 'fight', target: npc.id }
      : { type: 'unknown', hint: `Fight whom? Nobody called "${m[2]}" is here.` };
  }
  m = t.match(/^give\s+(.+?)\s+to\s+(.+)$/);
  if (m) {
    const npc = findNpc(nearby, m[2]);
    return npc
      ? { type: 'action', action: 'give', target: npc.id, item: m[1] }
      : { type: 'unknown', hint: `Give it to whom? Nobody called "${m[2]}" is here.` };
  }
  m = t.match(/^bow(?:\s+to)?\s+(.+)$/) || (t === 'bow' ? [t, ''] : null);
  if (m) {
    const frag = (m[1] || '').trim();
    if (!frag) return { type: 'action', action: 'bow' };
    const npc = findNpc(nearby, frag);
    return npc
      ? { type: 'action', action: 'bow', target: npc.id }
      : { type: 'unknown', hint: `Bow to whom? Nobody called "${frag}" is here.` };
  }
  if (/^(rest|sleep|nap)(\s+here)?$/.test(t)) return { type: 'action', action: 'rest' };

  // -- movement ------------------------------------------------------------------
  m = t.match(/^(go|walk|move|run|step|head)\s+(north|n|south|s|east|e|west|w|up|down|left|right)(?:\s+(\d+))?$/)
    || t.match(/^(north|n|south|s|east|e|west|w|up|down|left|right)(?:\s+(\d+))?$/);
  if (m) {
    // alt 1: "<verb> <dir> [steps]" -> m[1]=verb m[2]=dir m[3]=steps
    // alt 2: "<dir> [steps]"        -> m[1]=dir  m[2]=steps
    const dirWord = m[2] && DIRS[m[2]] ? m[2] : m[1];
    const stepsRaw = m[3] || (/^\d+$/.test(m[2] || '') ? m[2] : '1');
    const steps = Math.max(1, Math.min(20, parseInt(stepsRaw, 10) || 1));
    return { type: 'move', dir: DIRS[dirWord], steps };
  }

  // -- goto (places) ---------------------------------------------------------------
  // Named buildings are entered, not walked to: "enter the bar" -> enter intent.
  m = t.match(/^(go|travel|journey|head|walk|move)\s+to\s+(.+)$/) || t.match(/^(visit|enter)\s+(.+)$/);
  if (m) {
    const dest = m[2];
    const stripped = stripArticle(dest);
    if ((m[1] === 'enter' || m[1] === 'visit') && BUILDING_RE.test(stripped)) {
      return { type: 'enter', target: stripped };
    }
    return { type: 'goto', target: dest };
  }

  // -- party / shikigami / buildings / missions / shop / travel ---------------------------
  // New-system intents. Other agents execute them; parseCommand only classifies.
  // Placed after goto but before the "looks like a command" fallback and chat.

  // -- buildings: exit -----------------------------------------------------------------------
  if (/^(exit|leave building|go outside)$/.test(t)) return { type: 'exit' };
  m = t.match(/^go\s+inside\s+(?:the\s+)?(.+)$/);
  if (m && BUILDING_RE.test(m[1])) return { type: 'enter', target: m[1] };

  // -- missions / quest log ---------------------------------------------------------------------
  if (/^(missions|mission board|quest log|quests|journal)$/.test(t)) return { type: 'missions' };
  m = t.match(/^accept\s+(?:mission\s+)?(\d+)$/);
  if (m) return { type: 'mission', sub: 'accept', n: parseInt(m[1], 10) };
  m = t.match(/^abandon\s+(?:mission\s+)?(.+)$/);
  if (m) return { type: 'mission', sub: 'abandon', target: stripArticle(m[1]) };
  m = t.match(/^capture\s+(.+)$/);
  if (m) {
    const name = stripArticle(m[1]);
    const npc = findNpc(nearby, name);
    return { type: 'capture', target: npc ? npc.id : name };
  }

  // -- shop ----------------------------------------------------------------------------------------
  m = t.match(/^buy\s+(.+)$/);
  if (m) return { type: 'shop', sub: 'buy', item: m[1] };
  m = t.match(/^sell\s+(.+)$/);
  if (m) return { type: 'shop', sub: 'sell', item: m[1] };
  if (/^(shop|store|browse shop|browse store)$/.test(t)) return { type: 'shop', sub: 'list' };

  // -- travel (generate a new neighboring procedural map; distinct from "go north") ------------------
  m = t.match(/^travel\s+(north|n|south|s|east|e|west|w|up|down|left|right)$/);
  if (m) return { type: 'travel', dir: DIRS[m[1]] };

  // -- join a raging historical battle ------------------------------------------------------------------
  if (/^join battle$/.test(t)) return { type: 'battle', sub: 'join' };

  // -- freeform phrasing (natural language; the verb need not come first) ------------
  // Placed before the party/shikigami verb-first commands so "recruit X as a
  // shikigami" wins over plain "recruit X". These reuse the same findNpc
  // resolver and the same intent shapes as the verb-first commands, so they
  // flow into the same game handlers. Plain "recruit <name>" still recruits
  // to the party (backward compatible).
  m = t.match(/^(tell|order|command|ask)\s+aiko\s+to\s+(attack|strike|hit|kill|fight)\s+(.+)$/);
  if (m) {
    const name = stripArticle(m[3]);
    const npc = findNpc(nearby, name);
    return { type: 'shikigamiAttack', who: 'aiko', target: npc ? npc.id : name };
  }
  m = t.match(/^(tell|order)\s+(.+?)\s+to\s+(attack|strike)\s+(.+)$/);
  if (m) {
    const actorName = stripArticle(m[2]);
    const actor = findBoundShikigami(ctx.S, actorName);
    if (!actor) {
      return { type: 'unknown', hint: `No bound shikigami called "${actorName}" can take that order.` };
    }
    const name = stripArticle(m[4]);
    const npc = findNpc(nearby, name);
    return { type: 'shikigamiAttack', who: actor.id, target: npc ? npc.id : name };
  }
  m = t.match(/^turn\s+(.+?)\s+into\s+(?:(?:my|a)\s+)?shikigami$/)
    || t.match(/^(?:recruit|enlist|hire)\s+(.+?)\s+as\s+(?:(?:my|a)\s+)?shikigami$/)
    || t.match(/^make\s+(.+?)\s+(?:(?:my|a)\s+)?shikigami$/);
  if (m) {
    const name = stripArticle(m[1]);
    const npc = findNpc(nearby, name);
    return { type: 'bind', target: npc ? npc.id : name };
  }
  m = t.match(/^(steal from|rob|pickpocket)\s+(.+)$/);
  if (m) {
    const name = stripArticle(m[2]);
    const npc = findNpc(nearby, name);
    return { type: 'steal', target: npc ? npc.id : name };
  }

  // -- party ------------------------------------------------------------------------------------------
  m = t.match(/^recruit\s+(.+)$/) || t.match(/^(team up with|hire|enlist)\s+(.+)$/);
  if (m) {
    const name = stripArticle(m[2] || m[1]);
    const npc = findNpc(nearby, name);
    return { type: 'recruit', target: npc ? npc.id : name };
  }
  if (t === 'recruit') return { type: 'unknown', hint: 'Recruit whom? Name someone nearby you want to team up with.' };
  m = t.match(/^dismiss\s+(.+)$/);
  if (m) {
    const name = stripArticle(m[1]);
    const npc = findNpc(nearby, name);
    return { type: 'dismiss', target: npc ? npc.id : name };
  }
  if (t === 'disband') return { type: 'dismiss', target: null, all: true };
  if (/^(party|show party)$/.test(t)) return { type: 'party' };

  // -- shikigami ----------------------------------------------------------------------------------------
  // NOTE: plain "release" (possession release) is matched much earlier; these need a target word.
  m = t.match(/^bind\s+(.+)$/);
  if (m) {
    const name = stripArticle(m[1]);
    const npc = findNpc(nearby, name);
    return { type: 'bind', target: npc ? npc.id : name };
  }
  if (t === 'bind') return { type: 'unknown', hint: 'Bind whom? Name the creature or spirit you want as a shikigami.' };
  m = t.match(/^release\s+shikigami\s+(.+)$/);
  if (m) {
    const name = stripArticle(m[1]);
    const npc = findNpc(nearby, name);
    return { type: 'release', target: npc ? npc.id : name };
  }
  m = t.match(/^free\s+(.+)$/);
  if (m) {
    const name = stripArticle(m[1]);
    const npc = findNpc(nearby, name);
    return { type: 'release', target: npc ? npc.id : name };
  }
  if (/^shikigami(?:\s+list)?$/.test(t)) return { type: 'shikigami', sub: 'list' };
  m = t.match(/^shikigami\s+(attack|follow|hide)$/);
  if (m) return { type: 'shikigami', sub: 'order', order: m[1] };
  m = t.match(/^summon\s+(.+)$/);
  if (m) {
    const name = stripArticle(m[1]);
    const npc = findNpc(nearby, name);
    return { type: 'summon', target: npc ? npc.id : name };
  }

  // -- npc work requests -----------------------------------------------------------------------------------
  if (t === 'request') return { type: 'request' };
  m = t.match(/^(?:request|ask)\s+(.+?)\s+for\s+work$/)
    || t.match(/^request\s+work\s+from\s+(.+)$/); // "request work from the elder"
  if (m) {
    const name = stripArticle(m[1]);
    const npc = findNpc(nearby, name);
    return { type: 'request', target: npc ? npc.id : name };
  }

  // -- looks like a command, but nothing matched ---------------------------------------
  if (/^(go|walk|move|run|open|unlock|take|get|grab|look|use|talk|attack|kill|fight|kiss|give|push|pull|climb|enter|exit|leave|search|inspect|north|south|east|west|up|down|left|right|recruit|bind|summon|capture|travel|dismiss|shikigami|buy|sell|accept|abandon|missions|party)\b/.test(t)) {
    return { type: 'unknown', hint: `I don't understand "${input.trim()}". Try "help" for commands, or just talk to Aiko.` };
  }

  // -- otherwise it's just talking (handled by AikoBrain) --------------------------------
  return { type: 'chat' };
}

// ---------------------------------------------------------------------------
// AikoBrain — local personality engine. No network, no DOM.
// respond(input, ctx) -> { text, mood }
// ctx: { S, nearby:[{id,name}], locationName, lastEvent,
//        saveMem(key,val), getMem(key), npcInfo(id) }
// ---------------------------------------------------------------------------
const MOODS = ['happy', 'sad', 'angry', 'surprised', 'love', 'neutral'];

export class AikoBrain {
  constructor() {
    this._lastVariant = {}; // category -> last index used (avoid repeats)
    this._jokeIdx = 0;
    this._greeted = false;
  }

  // Pick a variant, avoiding the one used last time for this category.
  _pick(cat, variants) {
    const last = this._lastVariant[cat];
    let idx = Math.floor(Math.random() * variants.length);
    if (variants.length > 1 && idx === last) idx = (idx + 1) % variants.length;
    this._lastVariant[cat] = idx;
    return variants[idx];
  }

  _playerName(ctx) {
    return (ctx && ctx.S && ctx.S.player && ctx.S.player.name) || 'traveler';
  }

  _karmaTier(ctx) {
    const k = ctx && ctx.S && ctx.S.player ? ctx.S.player.karma || 0 : 0;
    return k >= 30 ? 'good' : k <= -30 ? 'dark' : 'mixed';
  }

  _loverKeys(ctx) {
    const flags = (ctx && ctx.S && ctx.S.world && ctx.S.world.flags) || {};
    return Object.keys(flags).filter((k) => k.startsWith('lover_') && flags[k]);
  }

  _npcDesc(ctx, id) {
    try {
      if (ctx && typeof ctx.npcInfo === 'function') {
        const info = ctx.npcInfo(id);
        if (info) return info.desc || info.description || info.name || null;
      }
    } catch (_) { /* fall through */ }
    return null;
  }

  _comfortNeeded(ctx) {
    const p = ctx && ctx.S && ctx.S.player;
    return p && p.maxHp && p.hp < p.maxHp * 0.35;
  }

  respond(input, ctx = {}) {
    const t = norm(input);
    const name = this._playerName(ctx);
    const say = (text, mood) => ({ text, mood: MOODS.includes(mood) ? mood : 'neutral' });
    if (!t) return say('Hmm? Did you say something, ' + name + '? My ears twitched but I caught nothing.', 'neutral');

    // -- sexual requests aimed at Aiko: always deflect, warmly, platonically --
    if (/(sleep with|make love|have sex|go to bed|take me|kiss me|marry me|naked|nude|undress|touch me).*(you|aiko)|(you|aiko).*(sexy|naked|nude|bedroom|arous)/.test(t)) {
      return say(this._pick('deflect', [
        `Eep! ${name}, I'm your shikigami, not your sweetheart! I guard your soul — the rest of you is on your own. Let's keep things wholesome, okay?`,
        `Bold of you! But no — this fox stays firmly in the friend zone. There are plenty of lovely ladies in this land who might say yes; I'm just here to tease you about them.`,
        `My answer is no, and my tails are all puffed up in protest! I love you like family, ${name} — a very cute, very off-limits little sister-fox.`,
      ]), 'surprised');
    }
    // -- sweet (non-sexual) compliments -------------------------------------
    if (/(you('re| are) (cute|beautiful|pretty|adorable|lovely))|(cute|beautiful|pretty|adorable) (fox|aiko)/.test(t)) {
      return say(this._pick('compliment', [
        `Hehe, flattery will get you extra tail-wags! I'm the cutest fox in the province — it's basically official.`,
        `Aww! Careful, ${name}, keep that up and I'll follow you forever. ...I already do. Fine — I'll follow you forever happily!`,
      ]), 'love');
    }

    // -- greetings ------------------------------------------------------------
    if (/^(hi|hey|hello|yo|hiya|konnichiwa|good (morning|evening|afternoon|day))\b/.test(t) || /\bhello\b/.test(t)) {
      this._greeted = true;
      let extra = '';
      if (this._comfortNeeded(ctx)) extra = ` You look hurt, ${name} — sit down a moment and let me fuss over you.`;
      return say(this._pick('greet', [
        `Hi ${name}! My tails are wagging — what's our plan today?${extra}`,
        `Hey hey! The great fox Aiko reports for duty!${extra}`,
        `Well met, ${name}! The wind smells interesting today. Adventure, maybe?${extra}`,
      ]), 'happy');
    }

    // -- farewells ---------------------------------------------------------------
    if (/\b(bye|goodbye|good ?night|see you|farewell|later)\b/.test(t)) {
      return say(this._pick('farewell', [
        `Rest well, ${name}. I'll keep watch — foxes make excellent night guards.`,
        `Going already? Fine, fine... I'll be right here when you get back. I always am!`,
      ]), 'neutral');
    }

    // -- memory: store --------------------------------------------------------------
    let m = t.match(/^my (?:favorite|favourite) (\w+) is (.+)$/) || t.match(/^remember that my (.+?) is (.+)$/);
    if (m) {
      const key = 'fav_' + m[1].replace(/\s+/g, '_');
      const val = m[2].replace(/[.!]+$/, '');
      try { ctx.saveMem && ctx.saveMem(key, val); } catch (_) {}
      return say(`Noted! Your favorite ${m[1]} is "${val}". My fox memory never forgets... mostly.`, 'happy');
    }
    // -- memory: recall ---------------------------------------------------------------
    m = t.match(/^(?:what(?:'s| is) my (?:favorite |favourite )?(.+?)\??|do you remember my (.+?)\??)$/);
    if (m) {
      const noun = (m[1] || m[2]).replace(/\s+/g, '_');
      let val = null;
      try { val = ctx.getMem && ctx.getMem('fav_' + noun); } catch (_) {}
      if (val) return say(`Of course I remember! Your favorite ${noun.replace(/_/g, ' ')} is "${val}". See? Foxes never forget.`, 'love');
      return say(`Hmm, you haven't told me your favorite ${noun.replace(/_/g, ' ')} yet. Tell me and I'll tuck it away!`, 'neutral');
    }

    // -- karma questions ---------------------------------------------------------------
    if (/(am i|my).*(good|kind|evil|cruel|karma|wicked|noble)/.test(t)) {
      const tier = this._karmaTier(ctx);
      if (tier === 'good') return say(`You're one of the good ones, ${name}. The spirits whisper kindly about you, and so do I. Keep shining!`, 'love');
      if (tier === 'dark') return say(`Hmph. Lately your shadow walks ahead of you, ${name}. Even a fox worries. Be kinder — for me?`, 'angry');
      return say(`You're... complicated, ${name}. Some days saint, some days rascal. Keeps me on my toes, honestly.`, 'neutral');
    }

    // -- lover teasing (jealousy-lite, never mean) ------------------------------------------
    const lovers = this._loverKeys(ctx);
    if (lovers.length && /(jealous|lover|girlfriend|wife|princess|harem|romance|in love)/.test(t)) {
      return say(this._pick('tease', [
        `Oh? Someone's been busy collecting admirers~ I saw how that princess looked at you. Don't worry — your fox approves. Mostly.`,
        `Jealous? Me? Never! ...Okay, a tiny bit. But you deserve to be happy, ${name}. Just save some adventures for me too!`,
        `A whole trail of fluttering hearts behind you! Try not to break too many, heartbreaker. I'll be here to tease you about every single one.`,
      ]), 'happy');
    }
    // -- who is X ------------------------------------------------------------------
    m = t.match(/^who is (.+?)\??$/) || t.match(/^tell me about (.+?)\.?$/);
    if (m) {
      const npc = findNpc(ctx.nearby, m[1]);
      if (!npc) return say(`I don't see anyone called "${m[1]}" around here. Describe them and I'll sniff them out!`, 'neutral');
      const desc = this._npcDesc(ctx, npc.id);
      return say(desc ? `${npc.name}: ${desc}` : `${npc.name} is nearby — go say hello!`, 'neutral');
    }

    // mention of a lover by name
    if (lovers.length) {
      const hit = lovers.find((k) => t.includes(k.slice('lover_'.length)));
      if (hit) {
        const who = hit.slice('lover_'.length);
        return say(this._pick('teaseNamed', [
          `Ooh, ${who}~ Someone has a spring in their step! She's lovely, ${name}. Good taste — I trained you well.`,
          `${who}, hmm? My tails twitch whenever you say that name. Go on, tell your fox everything!`,
        ]), 'happy');
      }
    }

    // -- how is Aiko / how am I -----------------------------------------------------------
    if (/(how are you|how do you feel|are you (ok|okay|alright|well))/.test(t)) {
      const bond = (ctx.S && ctx.S.aiko && ctx.S.aiko.bond) || 0;
      if (bond >= 70) return say(`Wonderful, now that you're talking to me! Being near you is my favorite place in the world.`, 'love');
      if (bond >= 40) return say(`Pretty good! My tails are fluffy and my spirits are high. How about you, ${name}?`, 'happy');
      return say(`I'm alright — still getting used to traveling with you. Talk to me more and we'll be the best of friends!`, 'neutral');
    }
    if (/(how am i|my (hp|health|condition)|am i (hurt|ok|okay|well))/.test(t) || this._comfortNeeded(ctx) && /(tired|hurt|pain)/.test(t)) {
      const p = ctx.S && ctx.S.player;
      if (this._comfortNeeded(ctx)) {
        return say(`You're hurt, ${name}! Come here — let me patch you up and scold you a little for being reckless. There, better?`, 'sad');
      }
      if (p) return say(`You're looking sturdy to me — ${p.hp} out of ${p.maxHp} health. Try to keep it that way, hero!`, 'happy');
    }

    // -- jokes ------------------------------------------------------------------------
    if (/(joke|make me laugh|something funny|funny)/.test(t)) {
      const jokes = [
        `Why did the fox cross the road? ...Honestly? I just felt like it. Fox reasons.`,
        `I'm not saying I'm sneaky, but I once stole the moon's reflection and nobody noticed for a week.`,
        `What do you call a fox who does paperwork? A bureau-fox! ...I'll see myself out.`,
        `Nine tails, zero responsibilities. That's the dream, ${name}.`,
        `I told the thunder kami a joke once. He laughed so hard it rained for three days. You're welcome, farmers.`,
      ];
      const j = jokes[this._jokeIdx % jokes.length];
      this._jokeIdx += 1;
      return say(j, 'happy');
    }

    // -- who are you ----------------------------------------------------------------------
    if (/(who are you|what are you|your name)/.test(t)) {
      return say(`I'm Aiko, your fox-spirit shikigami! Part guardian, part guide, full-time mischief. I can fly, slip through walls, and — if you ask nicely — peek out through someone else's eyes.`, 'happy');
    }

    // -- thanks ----------------------------------------------------------------------------
    if (/\b(thanks|thank you|arigato)\b/.test(t)) {
      return say(`Anytime, ${name}! That's what your fox is for.`, 'love');
    }

    // -- arrival / location flavor --------------------------------------------------------------
    const ev = ctx.lastEvent;
    if (ev && (ev.kind === 'arrive' || ev.kind === 'move') && /(where|this place|look|here)/.test(t)) {
      const place = ctx.locationName || 'here';
      return say(this._pick('place', [
        `This is ${place}. Smells of history — and snacks, if we look hard enough.`,
        `${place}, huh? My tails tingle. Something interesting is definitely nearby.`,
      ]), 'surprised');
    }

    // -- fallback: contextual, non-repeating -------------------------------------------------------
    const fallbacks = [];
    if (ctx.locationName) fallbacks.push(`So, ${ctx.locationName}... what's our next move, ${name}? I'm all ears — literally, look at them!`);
    if (ctx.nearby && ctx.nearby.length) fallbacks.push(`I can smell ${ctx.nearby.length} interesting ${ctx.nearby.length === 1 ? 'person' : 'people'} nearby. Want to go say hi?`);
    fallbacks.push(
      `Hmm, let me think... my fox brain says: snacks first, questions later.`,
      `I'm listening, ${name}! Though fair warning, my advice is 90% mischief.`,
      `The wind carries interesting rumors today. Or maybe that's just my stomach growling.`,
      `If you ever bind a new shikigami, ${name}, I'd love the company — someone else to share tail-grooming duty!`,
      `Our party keeps growing, huh? A hero is only as strong as the friends at their side. Present fox included, obviously.`,
    );
    return say(this._pick('fallback', fallbacks), 'neutral');
  }
}
