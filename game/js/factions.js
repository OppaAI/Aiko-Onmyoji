// factions.js — the great clans of the Sengoku era.
// Meet daimyo, request audiences, pledge service, take missions, earn ranks.
// Daimyo successions and capital moves follow real history by date.

import { dateKey, addNews, clamp, addHonor } from './state.js';

export const RANKS = ['Guest', 'Retainer', 'Samurai', 'Officer', 'Castellan'];
export const STIPEND = [0, 30, 80, 180, 350]; // monthly gold by rank

export const COURT_RANKS = ['Unranked', 'Junior Fifth Rank', 'Senior Fifth Rank', 'Junior Fourth Rank', 'Senior Fourth Rank'];
const COURT_FAME_NEED = [0, 20, 45, 75, 110];

// ---------------------------------------------------------------- defs
// daimyo: [{from:'YYYY-MM-DD', name, style}] — successions by date.
// capitals: [{from, loc}] — e.g. Oda moves Gifu -> Azuchi in 1576.
export const FACTIONS = {
  oda: {
    name: 'Oda', jp: '織田', color: '#c0392b', strength: 95,
    desc: 'The rising power of Owari. Matchlocks, markets, and a lord who bows to no one — not even the old ways.',
    daimyo: [
      { from: '0000-01-01', name: 'Oda Nobunaga', style: 'nobunaga' },
      { from: '1582-06-13', name: 'Hashiba Hideyoshi', style: 'hideyoshi' },
    ],
    capitals: [
      { from: '0000-01-01', loc: 'gifu' },
      { from: '1576-01-01', loc: 'azuchi' },
    ],
    portrait: 'enemy_samurai.png',
  },
  tokugawa: {
    name: 'Tokugawa', jp: '徳川', color: '#7f8c8d', strength: 70,
    desc: 'The patient tortoise of Mikawa. Ieyasu endures what others cannot — and outlives them all.',
    daimyo: [{ from: '0000-01-01', name: 'Tokugawa Ieyasu', style: 'ieyasu' }],
    capitals: [{ from: '0000-01-01', loc: 'hamamatsu' }],
    portrait: 'enemy_samurai.png',
  },
  takeda: {
    name: 'Takeda', jp: '武田', color: '#8e1616', strength: 90,
    desc: 'The Tiger of Kai. Twenty-four generals, the finest cavalry in Japan, and the banner of Fūrinkazan.',
    daimyo: [
      { from: '0000-01-01', name: 'Takeda Shingen', style: 'shingen' },
      { from: '1573-05-01', name: 'Takeda Katsuyori', style: 'katsuyori' },
    ],
    capitals: [{ from: '0000-01-01', loc: 'kofu' }],
    portrait: 'enemy_samurai.png',
  },
  uesugi: {
    name: 'Uesugi', jp: '上杉', color: '#2c5f8a', strength: 85,
    desc: 'The army of Bishamonten. Kenshin fights not for land but for honor — and the gods march with him.',
    daimyo: [
      { from: '0000-01-01', name: 'Uesugi Kenshin', style: 'kenshin' },
      { from: '1578-04-01', name: 'Uesugi Kagekatsu', style: 'kagekatsu' },
    ],
    capitals: [{ from: '0000-01-01', loc: 'kasugayama' }],
    portrait: 'enemy_samurai.png',
  },
  mori: {
    name: 'Mōri', jp: '毛利', color: '#1e6b4a', strength: 80,
    desc: 'Lords of the western seas. Three arrows bound as one — patient, naval, and very hard to dislodge.',
    daimyo: [{ from: '0000-01-01', name: 'Mōri Terumoto', style: 'terumoto' }],
    capitals: [{ from: '0000-01-01', loc: 'koriyama' }],
    portrait: 'enemy_samurai.png',
  },
  asai: {
    name: 'Asai', jp: '浅井', color: '#8a6d2c', strength: 55,
    desc: 'Lords of northern Ōmi, torn between their oath to the Asakura and marriage ties to Nobunaga.',
    daimyo: [{ from: '0000-01-01', name: 'Asai Nagamasa', style: 'nagamasa' }],
    capitals: [{ from: '0000-01-01', loc: 'odani' }],
    portrait: 'enemy_samurai.png',
  },
  asakura: {
    name: 'Asakura', jp: '朝倉', color: '#6d5a8a', strength: 60,
    desc: 'Cultured lords of Echizen who sheltered the shogun — and hesitated one season too long.',
    daimyo: [{ from: '0000-01-01', name: 'Asakura Yoshikage', style: 'yoshikage' }],
    capitals: [{ from: '0000-01-01', loc: 'ichijodani' }],
    portrait: 'enemy_samurai.png',
  },
  honganji: {
    name: 'Hongan-ji', jp: '本願寺', color: '#b8860b', strength: 75,
    desc: 'The great temple-fortress of Osaka. Peasant, monk, and mercenary — united in faith, defiant for a decade.',
    daimyo: [{ from: '0000-01-01', name: 'Abbot Kennyo', style: 'kennyo' }],
    capitals: [{ from: '0000-01-01', loc: 'ishiyama' }],
    portrait: 'npc_elder.png',
  },
  ashikaga: {
    name: 'Ashikaga Shogunate', jp: '足利幕府', color: '#555', strength: 25,
    desc: 'The fading shogunate. Yoshiaki plots from behind his screens while the warlords carve up his realm.',
    daimyo: [{ from: '0000-01-01', name: 'Ashikaga Yoshiaki', style: 'yoshiaki' }],
    capitals: [{ from: '0000-01-01', loc: 'kyoto' }],
    portrait: 'npc_noble.png',
  },
  hojo: {
    name: 'Hōjō', jp: '北条', color: '#4a4a8a', strength: 80,
    desc: 'The lion of the Kantō behind the walls of Odawara — impregnable, methodical, and proud.',
    daimyo: [{ from: '0000-01-01', name: 'Hōjō Ujimasa', style: 'ujimasa' }],
    capitals: [{ from: '0000-01-01', loc: 'odawara' }],
    portrait: 'enemy_samurai.png',
  },
  court: {
    name: 'Imperial Court', jp: '朝廷', color: '#d4af37', strength: 5,
    desc: 'The Chrysanthemum Throne. No armies — but a word from the Emperor can make a warlord legitimate.',
    daimyo: [
      { from: '0000-01-01', name: 'Emperor Ōgimachi', style: 'emperor' },
      { from: '1586-01-01', name: 'Emperor Go-Yōzei', style: 'emperor' },
    ],
    capitals: [{ from: '0000-01-01', loc: 'kyoto' }],
    portrait: 'npc_noble.png',
  },
};

// ---------------------------------------------------------------- state
export function initFactions(s) {
  for (const [fid, def] of Object.entries(FACTIONS)) {
    if (!s.world.factions[fid]) {
      s.world.factions[fid] = { rep: 0, strength: def.strength, active: true };
    }
  }
}
export function factionDef(fid) { return FACTIONS[fid]; }
export function factionState(s, fid) {
  if (!s.world.factions[fid]) initFactions(s);
  return s.world.factions[fid];
}
export function factionActive(s, fid) { return factionState(s, fid).active; }

function pickByDate(list, today) {
  let cur = list[0];
  for (const e of list) if (e.from <= today) cur = e;
  return cur;
}
export function currentDaimyo(s, fid) {
  return pickByDate(FACTIONS[fid].daimyo, dateKey(s));
}
// Per-daimyo portrait: each daimyo style has its own generated portrait
// (game/assets/daimyo_<style>.png). Falls back to the faction's legacy portrait.
export function daimyoPortrait(s, fid) {
  const dm = currentDaimyo(s, fid);
  if (dm && dm.portrait) return dm.portrait;
  if (dm && dm.style) return 'daimyo_' + dm.style + '.png';
  return FACTIONS[fid].portrait;
}
export function factionCapital(s, fid) {
  return pickByDate(FACTIONS[fid].capitals, dateKey(s)).loc;
}
export function factionDisplayName(s, fid) {
  if (fid === 'oda' && dateKey(s) >= '1582-06-13') return 'Toyotomi';
  return FACTIONS[fid].name;
}
export function factionJp(s, fid) {
  if (fid === 'oda' && dateKey(s) >= '1582-06-13') return '豊臣';
  return FACTIONS[fid].jp;
}
export function repOf(s, fid) { return factionState(s, fid).rep; }
export function changeRep(s, fid, d) {
  const st = factionState(s, fid);
  st.rep = clamp(st.rep + d, -100, 100);
  return st.rep;
}
export function changeStrength(s, fid, d) {
  const st = factionState(s, fid);
  st.strength = clamp(st.strength + d, 0, 120);
  return st.strength;
}
export function destroyFaction(s, fid) {
  const st = factionState(s, fid);
  st.active = false;
  st.strength = 0;
  if (s.world.service.faction === fid) {
    s.world.service = { faction: null, rank: 0 };
    addNews(s, `📜 Your lord's house has fallen. You are rōnin once more.`);
  }
}

// ---------------------------------------------------------------- audiences
export function audienceReq(s, fid) {
  if (!factionActive(s, fid)) return { ok: false, reason: 'That house no longer exists.' };
  if (s.player.location !== factionCapital(s, fid)) {
    return { ok: false, reason: 'You must be at their seat of power.' };
  }
  const hasGift = ['fine_silk', 'war_horse', 'tea_set'].some((id) =>
    s.player.inventory.some((i) => i.id === id && i.qty > 0));
  if (s.player.fame >= 5 || repOf(s, fid) >= 5 || hasGift || s.world.metDaimyo[fid]) {
    return { ok: true };
  }
  return { ok: false, reason: 'The guards laugh at you. (Need 5 fame, 5 reputation with them, or a worthy gift.)' };
}

// ---------------------------------------------------------------- service
export function serving(s) { return s.world.service.faction; }
export function rankName(s) { return RANKS[s.world.service.rank] || RANKS[0]; }

export function pledge(s, fid) {
  const old = s.world.service.faction;
  if (old === fid) return { ok: false, reason: 'You already serve them.' };
  let honorLoss = 0;
  if (old) {
    honorLoss = 15;
    changeRep(s, old, -20);
    addNews(s, `📜 You abandon ${factionDisplayName(s, old)}'s service. Some call it treachery; you call it ambition.`);
  }
  const rank = s.player.fame >= 40 ? 1 : 0;
  s.world.service = { faction: fid, rank };
  changeRep(s, fid, 10);
  return { ok: true, rank, honorLoss, old };
}

export function resign(s) {
  const fid = s.world.service.faction;
  if (!fid) return { ok: false };
  s.world.service = { faction: null, rank: 0 };
  changeRep(s, fid, -10);
  addHonor(s, -15);
  return { ok: true, fid };
}

export function promoteCheck(s) {
  // called after missions/battles; ranks rise with fame+rep
  const fid = s.world.service.faction;
  if (!fid) return null;
  const cur = s.world.service.rank;
  const need = [0, 20, 50, 90, 140][cur + 1];
  if (need === undefined) return null;
  if (s.player.fame >= need && repOf(s, fid) >= need / 2) {
    s.world.service.rank = cur + 1;
    addNews(s, `📜 ${factionDisplayName(s, fid)} promotes you to ${RANKS[cur + 1]}! Stipend raised.`);
    return RANKS[cur + 1];
  }
  return null;
}

// ---------------------------------------------------------------- missions
const MISSION_FLAVOR = [
  { kind: 'battle', title: 'Purge the mountain bandits', desc: 'Rōnin infest the roads and grow bold. Drive them off.', enemy: 'ronin', days: 2, gold: 60, rep: 8, fame: 6, exp: 70, minRank: 0 },
  { kind: 'battle', title: 'Exorcise the restless dead', desc: 'A yūrei haunts the garrison\'s sleep. Lay it to rest — by force if needed.', enemy: 'yurei', days: 2, gold: 70, rep: 8, fame: 6, exp: 80, minRank: 0 },
  { kind: 'errand', title: 'Carry a sealed letter', desc: 'A message for an ally, sealed in wax. Ask no questions. Deliver it swiftly.', days: 3, gold: 50, rep: 6, fame: 3, exp: 40, minRank: 0 },
  { kind: 'errand', title: 'Escort the tax convoy', desc: 'Rice and coin must reach the castle. See that they do.', days: 4, gold: 90, rep: 7, fame: 4, exp: 50, minRank: 1 },
  { kind: 'intrigue', title: 'Listen in the teahouses', desc: 'Rival agents whisper in the pleasure quarters. Learn what they plan.', days: 3, gold: 40, rep: 10, fame: 5, exp: 60, minRank: 1, stat: 'agi' },
  { kind: 'intrigue', title: 'Read the enemy\'s omens', desc: 'Divine the enemy\'s fortunes. A clever onmyōji can tilt a campaign with a well-timed prophecy.', days: 2, gold: 60, rep: 10, fame: 7, exp: 70, minRank: 1, stat: 'level' },
  { kind: 'battle', title: 'Break the ikki cell', desc: 'Armed peasants and sōhei gather in the hills. Scatter them before they march.', enemy: 'ashigaru', days: 3, gold: 110, rep: 10, fame: 9, exp: 100, minRank: 2 },
  { kind: 'battle', title: 'Slay the mountain oni', desc: 'An oni has taken the pass and eats travelers. End it.', enemy: 'oni', days: 4, gold: 150, rep: 12, fame: 12, exp: 130, minRank: 2 },
];

export function generateMissions(s, fid) {
  const rank = s.world.service.faction === fid ? s.world.service.rank : 0;
  const pool = MISSION_FLAVOR.filter((m) => m.minRank <= rank);
  const out = [];
  const used = new Set();
  while (out.length < 3 && used.size < pool.length) {
    const m = pool[Math.floor(Math.random() * pool.length)];
    if (used.has(m.title)) continue;
    used.add(m.title);
    out.push({ ...m, fid, id: m.title.toLowerCase().replace(/[^a-z]+/g, '_') + '_' + Date.now() % 997 });
  }
  return out;
}

// ---------------------------------------------------------------- daimyo voices
// Each style: how they greet, accept service, refuse, talk of the realm, etc.
export const DAIMYO_VOICES = {
  nobunaga: {
    greet: (s) => `So. The onmyōji everyone's whispering about. Speak plainly — I have a country to steal and no patience for incense smoke.`,
    pledge_yes: (s) => `HA! A spirit-talker in my ranks. Serve me well and I'll give you provinces. Serve me poorly and I'll give you a shorter life. Welcome.`,
    pledge_no: (s) => `You want to serve ME with that reputation? Come back when the bards know your name, little ghost-talker.`,
    mission: (s) => `Work? I have work. Mountains of it. Take your pick and don't bore me with the details.`,
    aid_yes: (s) => `Gold? Troops? Hmph. You've earned my attention. Take what you need — and make it worth my while.`,
    aid_no: (s) => `You ask ME for favors? Earn them first. The Oda do not feed strays.`,
    gift: (s) => `A gift. ${/tea/i.test(s._giftName || '') ? 'Tea utensils! Now you speak my language. The tea room is where REAL battles are won.' : 'Hm. Acceptable. I\'ll remember the gesture.'}`,
    realm: (s, next) => `The realm? Listen: ${next} Mark me — the old order is kindling, and I am the flame. Tenka fubu! Rule the realm by force!`,
    leave: (s) => `Leaving? Pity. The door is there. Don't let ambition bite you on the way out.`,
    insult: (s) => `You DARE? ...Hahaha! HA! I like that. Wrong, but I like it. My champion will teach you manners — with a spear.`,
  },
  hideyoshi: {
    greet: (s) => `Oho! The famous onmyōji! Come, come — sit! You look clever. I like clever. Nobunaga-sama always said I collect clever people like others collect swords!`,
    pledge_yes: (s) => `Wonderful! Absolutely wonderful! A spirit-talker! You know, I was a sandal-bearer once — look at me now! In my service, ANYONE can rise. Anyone!`,
    pledge_no: (s) => `Hmm, hmm. Not yet, not yet. Go make a name for yourself — win a battle, charm a court — then come back and we'll talk like old friends!`,
    mission: (s) => `Work for you? Of course! I always have work! So much work! Pick something juicy!`,
    aid_yes: (s) => `Of course, of course! What's mine is yours, friend! Just remember who smiled at you first, eh?`,
    aid_no: (s) => `Ahh, I'd love to, truly! But the coffers — the coffers are shy today. Do me a favor first, then we'll talk gold!`,
    gift: (s) => `For ME? You shouldn't have! ...No, really, you should have, and you did! Marvelous! We're friends now. Friends!`,
    realm: (s, next) => `The realm, you ask? ${next} But don't worry! Leave it to me — I'll stitch this country together with laughter and, ah, occasional sieges!`,
    leave: (s) => `Leaving? Ah, that's a shame! A real shame! Well — the road is long, friend. If you ever get hungry, my door is open!`,
    insult: (s) => `Insult me? In MY castle? ...Hahaha! Bold! Stupid, but bold! Tell you what — beat my champion and I'll forgive you. Lose, and... well. Let's not dwell.`,
  },
  ieyasu: {
    greet: (s) => `...An onmyōji. Sit. Tea? Good. I have learned that a man who listens for an hour learns what a man who shouts for a day never will. Speak.`,
    pledge_yes: (s) => `You wish to serve the Tokugawa. Hmm. Loyalty is a seed, not a flower — it must be planted and watered. I accept. Grow well.`,
    pledge_no: (s) => `Not yet. The pine does not rush the spring. Return when your name carries weight.`,
    mission: (s) => `Patience wins campaigns, but work must still be done. Choose carefully. I dislike waste.`,
    aid_yes: (s) => `Very well. I give this not from plenty but from trust. Do not make me regret the arithmetic.`,
    aid_no: (s) => `No. A lord who spends freely in spring starves in winter. Prove your worth first.`,
    gift: (s) => `A gift... You understand courtesy. In these times, courtesy is rarer than gold. I accept — and I remember.`,
    realm: (s, next) => `You ask of the realm. ${next} The strong move quickly; the wise move last. I intend to be standing when the dust settles.`,
    leave: (s) => `So be it. The tanuki does not chase those who leave its burrow. Go — and go wisely.`,
    insult: (s) => `...You test my patience. Very well. My champion will answer you. I suggest you answer him with equal care.`,
  },
  shingen: {
    greet: (s) => `An onmyōji comes to Kai. Swift as the wind, you are — but are you silent as the forest? Speak, and be still within.`,
    pledge_yes: (s) => `Fūrinkazan: as fast as the wind, as gentle as the forest, as fierce as fire, as unshakeable as the mountain. Be all four, and the Takeda banners are your home.`,
    pledge_no: (s) => `The mountain does not open its gates to every traveler. Return when you are... more.`,
    mission: (s) => `Every campaign is won before it is fought. These tasks are the quiet stones of victory. Choose.`,
    aid_yes: (s) => `The Takeda reward the proven. Take what you need. Spend it like a general, not a gambler.`,
    aid_no: (s) => `No. Even tigers count their teeth. Prove yourself first.`,
    gift: (s) => `A thoughtful gift. Strategy begins with understanding what men value. You understand. Good.`,
    realm: (s, next) => `The realm turns. ${next} I move west when the season favors. A general who masters timing masters all.`,
    leave: (s) => `The mountain does not beg the river to stay. Go with the wind.`,
    insult: (s) => `Insolence in my hall. My twenty-four generals weep for you already. Face my champion — and learn stillness.`,
  },
  katsuyori: {
    greet: (s) => `An onmyōji. My father collected clever men. I... I collect victories. Or I will. Speak.`,
    pledge_yes: (s) => `You\'ll serve the Takeda? Good. GOOD. They say I am not my father. Help me prove them wrong and I\'ll shower you in gold.`,
    pledge_no: (s) => `Not yet? Hmph. Even my own generals doubt me. Go. Make a name. Then we\'ll see who doubts whom.`,
    mission: (s) => `Work. Yes — work silences doubters. Pick one. Succeed, and no one will whisper about me... or you.`,
    aid_yes: (s) => `Take it. Take it all if you must. The Takeda are not misers — we are lions!`,
    aid_no: (s) => `I... cannot. Not yet. The coffers answer to my council, and my council answers to my father\'s ghost. Prove yourself first.`,
    gift: (s) => `A gift for me? You... thank you. Few remember courtesy toward Katsuyori. I won\'t forget this.`,
    realm: (s, next) => `The realm? ${next} My father feared the guns. I do not fear them. The Takeda charge — that is our answer to everything.`,
    leave: (s) => `Go, then. Everyone leaves eventually. Even... never mind. Go.`,
    insult: (s) => `You mock ME? In KAI? My champion will carve your apology into the dirt. COME.`,
  },
  kenshin: {
    greet: (s) => `I am Kenshin, avatar of Bishamonten. I fight not for gain but for justice. If your heart is crooked, leave now — the god of war sees through masks.`,
    pledge_yes: (s) => `You would serve righteousness itself? Then kneel not to me but to the ideal. Fight the unjust, protect the weak, and Bishamonten will know your name.`,
    pledge_no: (s) => `Your name is yet unknown to the heavens. Do just deeds, and return. The god of war is patient with the sincere.`,
    mission: (s) => `There is always injustice to answer. Choose your battlefield, warrior of the gods.`,
    aid_yes: (s) => `For a righteous cause, my stores are open. Use them justly — Bishamonten watches.`,
    aid_no: (s) => `I cannot. My duty is to the righteous, and I do not yet know your heart. Show me deeds first.`,
    gift: (s) => `You honor me with gifts? I own little and want less. But courtesy is a virtue — I accept in the spirit given.`,
    realm: (s, next) => `The realm bleeds. ${next} I will march where justice calls, though all the warlords of Japan stand against me.`,
    leave: (s) => `Go with the gods. Righteousness is a road, not a castle — walk it wherever you are.`,
    insult: (s) => `You insult the avatar of Bishamonten? Then the god himself answers through my champion\'s spear. Prepare your soul.`,
  },
  kagekatsu: {
    greet: (s) => `...Onmyōji. The Uesugi have bled for this house. I have no time for flattery. State your business.`,
    pledge_yes: (s) => `Serve, then. Loyalty is proven in winter, not spring. The Uesugi remember every debt — owed and owing.`,
    pledge_no: (s) => `No. Come back with deeds, not words.`,
    mission: (s) => `Work. There is always work. The north does not forgive idleness.`,
    aid_yes: (s) => `Take it. But know: the Uesugi ledger is long, and every entry is remembered.`,
    aid_no: (s) => `No.`,
    gift: (s) => `Hm. ...Accepted.`,
    realm: (s, next) => `${next} The Uesugi endure. We always endure.`,
    leave: (s) => `Go.`,
    insult: (s) => `My champion. Now.`,
  },
  terumoto: {
    greet: (s) => `Welcome to the west, onmyōji. We Mōri are in no hurry — the sea teaches patience. Tea? The view of the Inland Sea is best at dusk.`,
    pledge_yes: (s) => `Three arrows bound together cannot be broken — my grandfather's lesson. Join our bundle, and no storm will snap you.`,
    pledge_no: (s) => `A pity, but the sea does not chase ships. Sail far, make your name, and our harbors will welcome you back.`,
    mission: (s) => `We have ventures by land and sea. Choose one that suits your talents — haste is optional, success is not.`,
    aid_yes: (s) => `Of course. The Mōri look after their own — and their friends. The Inland Sea provides.`,
    aid_no: (s) => `I must decline for now. Even the sea has its tides. Do us a service first, and ask again at high tide.`,
    gift: (s) => `Ah, a gift! How civilized. We westerners appreciate the old courtesies. Please, stay for dinner.`,
    realm: (s, next) => `The realm? ${next} Let the east burn itself out. The Mōri will still be here, fishing and waiting, when the smoke clears.`,
    leave: (s) => `Fair winds, traveler. The Mōri forget neither friends nor debts.`,
    insult: (s) => `My, my. Such fire. Pity it's wasted on manners. My champion will cool you down — try the sea air afterward.`,
  },
  nagamasa: {
    greet: (s) => `An onmyōji... Forgive the gloom of Odani. I am Nagamasa. They say I chose my oath over my marriage. They say many things. Few ask what it cost.`,
    pledge_yes: (s) => `You would serve the Asai? In these dark days? ...Thank you. Whatever comes, we will face it as warriors should — together.`,
    pledge_no: (s) => `I understand. Even I would not bind another soul to a sinking ship... though I pray it is not sinking. Not yet.`,
    mission: (s) => `There is work — guarding roads, calming villages. Small things. Perhaps small things are all that remain to us.`,
    aid_yes: (s) => `Take what we have. It is little, but it is given freely. Oichi always said generosity is the last thing they can take from you.`,
    aid_no: (s) => `I wish I could. The storehouses are thin and the future thinner. Forgive me.`,
    gift: (s) => `You honor a doomed house with gifts? ...You are kind. Whatever history writes of Nagamasa, it will write kindly of you.`,
    realm: (s, next) => `The realm... ${next} I chose honor over family. Tell me, onmyōji — when the bards sing of it, will they understand?`,
    leave: (s) => `Go safely. And if you ever see Oichi... tell her the lake is beautiful this year.`,
    insult: (s) => `You come to MY hall, in MY final days, to mock me? ...My champion will answer. I no longer have the heart for it myself.`,
  },
  yoshikage: {
    greet: (s) => `Ah, an onmyōji! Welcome to Ichijōdani — the little Kyoto of the north. Mind the poets; they bite. Tell me, have you read the new linked verse from the capital?`,
    pledge_yes: (s) => `Splendid! The Asakura patronize all the arts — war being merely the least subtle of them. You shall find us... civilized employers.`,
    pledge_no: (s) => `A pity. But art cannot be rushed, nor can allegiance. Do visit our salons again sometime.`,
    mission: (s) => `We have some... practical matters requiring attention. Bandits lack aesthetic sensibility, I'm afraid. Do deal with them.`,
    aid_yes: (s) => `But of course! Patronage is the soul of civilization. Take what you need — and do compose something about our generosity.`,
    aid_no: (s) => `Alas, the treasury is currently... invested in culture. Return after you've done us a service, and we'll talk.`,
    gift: (s) => `Oh! Exquisite taste! You simply MUST tell me where you found this. We shall display it at the next moon-viewing.`,
    realm: (s, next) => `The realm, dear me. ${next} War is so... unrefined. But I suppose even poetry needs peace to flourish. Perhaps I should act. Soon. Eventually.`,
    leave: (s) => `Farewell! Do come to the next poetry gathering — bring the shikigami, she sounds delightful.`,
    insult: (s) => `I... beg your pardon? In MY salon? ...Guards. Champion. Someone remove this barbarian. Preferably in iambic pentameter.`,
  },
  kennyo: {
    greet: (s) => `Namu Amida Butsu. An onmyōji seeks the Hongan-ji. All beings are embraced by the Primal Vow — even spirit-talkers. Sit. Breathe.`,
    pledge_yes: (s) => `You would take up arms for the Dharma? Then know: we fight not for land but for the right to pray. If your heart is sincere, the Buddha is already your commander.`,
    pledge_no: (s) => `The Vow does not compel. Go in peace — Amida's light follows even those who walk away.`,
    mission: (s) => `Our people suffer — villages burned, temples desecrated. Ease their suffering. That is the whole of our strategy.`,
    aid_yes: (s) => `What little we have, we share. The sangha provides — take, and give thanks to Amida.`,
    aid_no: (s) => `Forgive us. Our rice feeds ten thousand refugees. When you have served the Dharma, ask again.`,
    gift: (s) => `A gift... We monks own nothing, yet receive everything with gratitude. Namu Amida Butsu.`,
    realm: (s, next) => `The world burns, child. ${next} But the Vow is unburnable. We will chant when the castles are dust.`,
    leave: (s) => `Namu Amida Butsu. Walk gently — every road is a temple if you tread it mindfully.`,
    insult: (s) => `Anger is a fire that burns the holder first. ...But even monks keep spearmen. My champion will teach you calm.`,
  },
  yoshiaki: {
    greet: (s) => `An onmyōji! Oh, good, good — the spirits, yes, perhaps the spirits can help. Nobunaga watches everything, you know. EVERYTHING. Sit where the screens hide you. Quickly.`,
    pledge_yes: (s) => `You'll serve the shogunate? Oh, excellent! With men like you — and the Mōri, and the Takeda, and... and... — we'll be rid of that Oda brute in no time! Shh. Did anyone hear?`,
    pledge_no: (s) => `No? NO? ...I understand. Everyone abandons the shogun. It's traditional. Like cherry blossoms. Bitter, bitter blossoms.`,
    mission: (s) => `I have letters — so many letters — to carry. Secret letters. If Nobunaga's men catch you, you never met me. You NEVER met me.`,
    aid_yes: (s) => `Yes, yes! Take it! Gold buys swords, swords buy... oh, what do swords buy? Loyalty, that's it. Probably.`,
    aid_no: (s) => `I can't! The coffers are... Nobunaga counts them. He counts EVERYTHING. Do something for me first, quietly.`,
    gift: (s) => `A gift! For the shogun! You see? SOMEONE respects the office! Take a poem in return — I wrote it myself. It's about betrayal.`,
    realm: (s, next) => `The realm?! ${next} It's all falling apart and Nobunaga did it! I have a plan, though. A secret plan. Would you like to hear it? ...No. Too dangerous. Forget I spoke.`,
    leave: (s) => `Leaving? Already? ...Tell no one you were here. Tell no one ANYTHING. Goodbye. Shh.`,
    insult: (s) => `You DARE insult the SHOGUN?! ...Oh no. Oh no, the guards heard. Champion! CHAMPION! Deal with this before Nobunaga hears!`,
  },
  ujimasa: {
    greet: (s) => `So. An onmyōji graces Odawara. I am Ujimasa. The Hōjō do not grovel and do not boast — our walls speak for us. State your purpose.`,
    pledge_yes: (s) => `You would serve the lion of the Kantō? Then know our law: duty first, reward second, excuses never. Welcome to Odawara.`,
    pledge_no: (s) => `Hm. The Hōjō endure regardless. Return when you understand what permanence means.`,
    mission: (s) => `The Kantō is vast and full of work. Choose. Execute it with Hōjō precision.`,
    aid_yes: (s) => `Granted. The Hōjō administration wastes nothing — including, it seems, you. Do not disappoint the ledgers.`,
    aid_no: (s) => `Denied. Our granaries are counted to the grain. Earn your entry in the ledger first.`,
    gift: (s) => `A proper tribute, correctly presented. You understand order. The Hōjō value those who value form.`,
    realm: (s, next) => `The realm? ${next} Let them come. Odawara has never fallen. It will not fall in your lifetime, onmyōji.`,
    leave: (s) => `Dismissed. The Kantō will be here when your wanderings end. It is always here.`,
    insult: (s) => `Insolence. In Odawara. My champion will demonstrate why no army has ever taken these walls — starting with you.`,
  },
  emperor: {
    greet: (s) => `...An onmyōji approaches the Chrysanthemum Throne. We are pleased. The court has watched the warlords' dance for a century. Tell us — what do the spirits say of it all?`,
    pledge_yes: (s) => `You would serve the Throne itself? We have no armies to offer, only legitimacy — which, child, is the rarest currency of all. Serve with grace.`,
    pledge_no: (s) => `We understand. The Throne does not compel — it merely... endures. As do we all, in time.`,
    mission: (s) => `The court has quiet needs. A poem delivered. A shrine cleansed. A rumor... gently corrected. Choose.`,
    aid_yes: (s) => `The imperial purse is not deep, but our gratitude is fathomless. Take this — and our blessing.`,
    aid_no: (s) => `We cannot — the court survives on frugality and dignity. Serve us first, and we shall remember.`,
    gift: (s) => `You honor the Throne with tribute? How... proper. We shall mention your name at the next moon-viewing. That is no small thing.`,
    realm: (s, next) => `The realm? ${next} Dynasties are seasons, child. The Throne is the mountain beneath the snow. Remember that when the warlords preen.`,
    leave: (s) => `Go with our blessing. The court will be here — the court is always here — when you return.`,
    insult: (s) => `...We did not hear that. For your sake, pray no one else did either. Our guards, however, heard everything.`,
  },
};

// ---------------------------------------------------------------- wiring
// main.js calls wireFactionHooks() once at boot.
export function wireFactionHooks() {
  // late imports avoided: main.js passes the real modules
}

// Build the dynamic daimyo audience NPC for dialogue.js.
// nextEventText: a one-line hint of the next historical event (realm gossip).
export function daimyoNpc(s, fid, nextEventText) {
  const dm = currentDaimyo(s, fid);
  const voice = DAIMYO_VOICES[dm.style] || DAIMYO_VOICES.ieyasu;
  const fname = factionDisplayName(s, fid);
  const serving = s.world.service.faction === fid;
  const topics = [];

  const T = (id, label, beats, extra = {}) => ({ id, label, beats: (st) => beats(st), ...extra });

  if (!serving) {
    topics.push(T('pledge', `Pledge service to ${fname}`, (st) => {
      const req = s.player.fame >= 5 || repOf(s, fid) >= 10;
      if (req) {
        const r = pledge(s, fid);
        if (r.honorLoss) addHonor(s, -r.honorLoss);
        return [
          { who: 'daimyo', text: voice.pledge_yes(s) },
          { who: 'n', text: `You kneel and pledge your sword and spirit to ${fname}. Rank: ${RANKS[r.rank]}. A stipend will come each month.${r.old ? ` (Honor -${r.honorLoss} for abandoning your former lord.)` : ''}` },
        ];
      }
      return [
        { who: 'daimyo', text: voice.pledge_no(s) },
        { who: 'n', text: '(Increase your fame or reputation with them, then ask again.)' },
      ];
    }, { effects: [] }));
  } else {
    topics.push(T('mission', 'Request a mission', (st) => [
      { who: 'daimyo', text: voice.mission(s) },
      { who: 'n', text: '(Choose a mission from the missions board — missions take days to complete.)' },
    ]));
    topics.push(T('aid', 'Request aid (gold & supplies)', (st) => {
      const ok = repOf(s, fid) >= 20 || s.world.service.rank >= 2;
      if (ok) {
        const gold = 60 + s.world.service.rank * 40;
        s.player.gold += gold;
        changeRep(s, fid, -3);
        return [
          { who: 'daimyo', text: voice.aid_yes(s) },
          { who: 'n', text: `You receive ${gold} gold. (Reputation -3: favors are remembered.)` },
        ];
      }
      return [{ who: 'daimyo', text: voice.aid_no(s) }];
    }));
    topics.push(T('leave', 'Take leave of service', (st) => {
      resign(s);
      return [
        { who: 'daimyo', text: voice.leave(s) },
        { who: 'n', text: 'You are rōnin once more. (Honor -15, reputation with them -10.)' },
      ];
    }));
  }

  topics.push(T('gift', 'Present a gift', (st) => {
    const gifts = ['fine_silk', 'war_horse', 'tea_set'].filter((id) =>
      s.player.inventory.some((i) => i.id === id && i.qty > 0));
    if (!gifts.length) {
      return [{ who: 'n', text: 'You carry nothing fit for a daimyo\'s court. (Buy fine silk, a war horse, or tea utensils in Sakai.)' }];
    }
    const id = gifts[0];
    s._giftName = id;
    const names = { fine_silk: 'fine silk', war_horse: 'a war horse', tea_set: 'tea utensils' };
    const bonus = (fid === 'oda' && id === 'tea_set') ? 20 : 12;
    const { removeItem } = giftHooks;
    if (removeItem) removeItem(s, id, 1);
    changeRep(s, fid, bonus);
    return [
      { who: 'h', text: `My lord, I humbly present ${names[id]}.` },
      { who: 'daimyo', text: voice.gift(s) },
      { who: 'n', text: `(Reputation with ${fname} +${bonus}.)` },
    ];
  }));

  topics.push(T('realm', 'Ask about the realm', (st) => [
    { who: 'daimyo', text: voice.realm(s, nextEventText || 'The winds are quiet... for now.') },
  ]));

  topics.push(T('duel', 'Challenge their champion (duel)', (st) => [
    { who: 'daimyo', text: voice.insult(s) },
    { who: 'n', text: '(A champion steps forward, spear leveled. This will be a real fight.)' },
  ], { effects: [{ combat: 'officer' }] }));

  if (fid === 'court') {
    topics.push(T('courtrank', 'Request an imperial court rank', (st) => {
      const cur = s.world.courtRank;
      if (cur >= COURT_RANKS.length - 1) return [{ who: 'n', text: 'You already hold the highest rank the court will grant a wandering onmyōji.' }];
      const need = COURT_FAME_NEED[cur + 1];
      if (s.player.fame >= need) {
        s.world.courtRank = cur + 1;
        return [
          { who: 'daimyo', text: `Then let it be known: we grant you the ${COURT_RANKS[cur + 1]}. Wear it with grace, child of the spirits.` },
          { who: 'n', text: `(Court rank gained! Your fame carries new weight in every hall of Japan.)` },
        ];
      }
      return [{ who: 'daimyo', text: `The ${COURT_RANKS[cur + 1]} requires a name that echoes through the provinces (fame ${need}). Return when the bards sing of you.` }];
    }));
  }

  return {
    id: 'daimyo_' + fid,
    name: dm.name,
    archetype: 'daimyo',
    faction: fid,
    portrait: daimyoPortrait(s, fid),
    greet: (st) => {
      const lines = [
        { who: 'n', text: `You are admitted to the audience hall of ${fname}. ${dm.name} regards you.` },
        { who: 'daimyo', text: voice.greet(s) },
      ];
      if (serving) lines.push({ who: 'daimyo', text: `Ah, my ${RANKS[s.world.service.rank].toLowerCase()}. What do you require?` });
      return lines;
    },
    topics,
  };
}

let giftHooks = {};
export function setGiftHooks(hooks) { giftHooks = hooks; }
