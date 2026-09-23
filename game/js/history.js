// history.js — the real Sengoku timeline, 1570–1590.
// Historical events fire on their actual dates as the slow clock advances.
// The player can join major battles and, with enough impact, CHANGE history.

import { addNews, dateKey } from './state.js';

// ---------------------------------------------------------------------------
// Battles the player can join. sides: a/b are arrays of faction ids.
// winner is the historical victor ('a' or 'b'). If the player fights for the
// losing side and their impact is great enough, history flips (upsetFlag set).
// ---------------------------------------------------------------------------
export const BATTLES = {
  anegawa: {
    id: 'anegawa', name: 'Battle of Anegawa', jp: '姉川の戦い', d: '1570-06-28',
    sideA: ['oda', 'tokugawa'], sideB: ['asai', 'asakura'], winner: 'a',
    locations: ['odani', 'otsu', 'azuchi', 'gifu'],
    desc: 'Allied Oda–Tokugawa banners face the Asai and Asakura across the Anegawa river. Thirty thousand men, and the summer rain smells of iron.',
    effectsA: [['strength', 'asai', -30], ['strength', 'asakura', -30]],
    effectsB: [['strength', 'oda', -25], ['strength', 'tokugawa', -20]],
    upsetFlag: 'anegawa_upset',
    upsetNews: 'Against all expectation, the Asai–Asakura alliance holds the field at Anegawa! The Oda advance stalls — history trembles.',
  },
  mikatagahara: {
    id: 'mikatagahara', name: 'Battle of Mikatagahara', jp: '三方ヶ原の戦い', d: '1573-01-25',
    sideA: ['takeda'], sideB: ['tokugawa', 'oda'], winner: 'a',
    locations: ['hamamatsu'],
    desc: 'Takeda Shingen\'s horsemen sweep down on Ieyasu\'s army outside Hamamatsu. The Tiger of Kai smells blood.',
    effectsA: [['strength', 'tokugawa', -35], ['strength', 'oda', -10]],
    effectsB: [['strength', 'takeda', -35]],
    upsetFlag: 'mikatagahara_upset',
    upsetNews: 'Impossible — Ieyasu\'s outnumbered host breaks the Takeda at Mikatagahara! The Tiger limps home. The realm reels.',
  },
  nagashino: {
    id: 'nagashino', name: 'Battle of Nagashino', jp: '長篠の戦い', d: '1575-05-21',
    sideA: ['oda', 'tokugawa'], sideB: ['takeda'], winner: 'a',
    locations: ['hamamatsu', 'kofu'],
    desc: 'Oda matchlocks glint behind palisades at Nagashino. Katsuyori\'s cavalry — the finest in Japan — prepares to charge into the guns.',
    effectsA: [['strength', 'takeda', -45]],
    effectsB: [['strength', 'oda', -30], ['strength', 'tokugawa', -20]],
    upsetFlag: 'nagashino_upset',
    upsetNews: 'The Takeda horsemen overrun the palisades at Nagashino! Oda\'s guns fall silent under samurai steel. History itself has been unhorsed.',
  },
  tedorigawa: {
    id: 'tedorigawa', name: 'Battle of Tedorigawa', jp: '手取川の戦い', d: '1577-11-23',
    sideA: ['uesugi'], sideB: ['oda'], winner: 'a',
    locations: ['kasugayama', 'ichijodani', 'odani'],
    desc: 'Uesugi Kenshin — the God of War — faces Oda\'s generals across the Tedori river in Kaga. Snow threatens; neither army will yield the crossing.',
    effectsA: [['strength', 'oda', -25]],
    effectsB: [['strength', 'uesugi', -30]],
    upsetFlag: 'tedorigawa_upset',
    upsetNews: 'Oda\'s generals outmaneuver the God of War at Tedorigawa! Kenshin retreats into the snow. The bards will sing of this for centuries.',
  },
};

// ---------------------------------------------------------------------------
// Timeline events. effects DSL:
//   ['news', text]  ['destroy', fid]  ['strength', fid, delta]
//   ['flag', key, val]  ['discover', locId]  ['odaRename'] (special)
// skipIf: flag that cancels this event (alternate history).
// ---------------------------------------------------------------------------
export const EVENTS = [
  { d: '1570-06-28', battle: 'anegawa' },
  { d: '1570-09-12', news: '⚔ The warrior monks of Ishiyama Hongan-ji rise against Nobunaga. The long Hongan-ji war begins.' },
  { d: '1571-09-12', news: '🔥 Nobunaga burns Enryaku-ji on Mt. Hiei — three thousand monks perish. The realm shudders at his ruthlessness.', effects: [['flag', 'hiei_burnt', true], ['strength', 'oda', 5]] },
  { d: '1572-12-01', news: '🐯 Takeda Shingen marches west from Kai with 30,000 men, banners reading Fūrinkazan. All eyes turn to Hamamatsu.' },
  { d: '1573-01-25', battle: 'mikatagahara' },
  { d: '1573-04-12', news: '🕯 Takeda Shingen, the Tiger of Kai, dies of illness on campaign. His son Katsuyori inherits the Takeda banners.' },
  { d: '1573-07-18', news: '🏯 Shogun Ashikaga Yoshiaki is driven from Kyoto by Nobunaga. The Muromachi shogunate ends — after 235 years.', effects: [['destroy', 'ashikaga']] },
  { d: '1573-08-29', skipIf: 'anegawa_upset', news: '🏯 Odani Castle falls. Asai Nagamasa, Nobunaga\'s brother-in-law, dies with his clan. Oichi\'s tears are the stuff of legend.', effects: [['destroy', 'asai']] },
  { d: '1573-09-16', skipIf: 'anegawa_upset', news: '🏯 Ichijōdani falls. The cultured Asakura clan is wiped out. Echizen passes to Oda.', effects: [['destroy', 'asakura']] },
  { d: '1574-09-01', news: '⚔ The Ikkō-ikki of Echizen are crushed by Oda generals. Peasant and monk alike fall before the guns.' },
  { d: '1575-05-21', battle: 'nagashino' },
  { d: '1575-11-01', news: '🏯 Nobunaga grants the great province of Echizen to Shibata Katsuie, and Kaga to Maeda Toshiie. The Oda realm grows.' },
  { d: '1576-01-01', news: '🏯 Construction begins on Nobunaga\'s great castle at Azuchi, on Lake Biwa\'s shore. The Oda court moves there.' },
  { d: '1576-07-13', news: '🌊 At Kizugawaguchi, the Mōri navy smashes Oda\'s fleet and resupplies Ishiyama Hongan-ji. The war at sea turns.' },
  { d: '1577-11-23', battle: 'tedorigawa' },
  { d: '1578-03-13', news: '🕯 Uesugi Kenshin, the God of War, dies suddenly at Kasugayama. His adopted sons Kagekatsu and Kagetora will tear the clan apart.' },
  { d: '1578-06-01', news: '⚔ The Ōtate no Ran: Uesugi kinsmen war over the succession. Kagekatsu prevails, but the clan is bled white.', effects: [['strength', 'uesugi', -25]] },
  { d: '1579-01-01', news: '🏯 Nobunaga\'s new castle town at Azuchi now rivals Kyoto itself. Merchants, artisans, and spies crowd its streets.' },
  { d: '1580-04-09', news: '⛩ After ten years of war, Ishiyama Hongan-ji surrenders. Abbot Kennyo leaves Osaka; the temple burns behind him.', effects: [['destroy', 'honganji']] },
  { d: '1580-09-01', news: '⚔ The Siege of Tottori: Hideyoshi starves the Mōri garrison into surrender. "Birds do not fly over Tottori," they say.', effects: [['strength', 'mori', -15]] },
  { d: '1582-03-11', skipIf: 'nagashino_upset', news: '🐯 The Takeda clan is annihilated at Tenmokuzan. Katsuyori dies with his house. The Tiger\'s line ends in the mountains of Kai.', effects: [['destroy', 'takeda']] },
  { d: '1582-06-02', news: '🔥🔥 HONNŌ-JI. Akechi Mitsuhide turns his banners at dawn and surrounds Nobunaga at Honnō-ji in Kyoto. The Demon King dies in the flames.', effects: [['strength', 'oda', -35], ['flag', 'honnoji_fired', true], ['discover', 'honnoji']] },
  { d: '1582-06-13', news: '⚔ At Yamazaki, Hashiba Hideyoshi avenges his lord and crushes Akechi Mitsuhide in thirteen days. The realm holds its breath: who now?', effects: [['odaRename']] },
  { d: '1582-07-01', news: '🏯 At Kiyosu, Oda\'s generals divide the realm. Hideyoshi takes the lion\'s share. The Toyotomi sun begins to rise.' },
  { d: '1583-04-24', news: '⚔ Shizugatake: Hideyoshi shatters Shibata Katsuie. The Seven Spears become legend overnight.', effects: [['strength', 'oda', 10]] },
  { d: '1584-04-09', news: '⚔ Komaki-Nagakute: Hideyoshi and Ieyasu maneuver for months and bleed each other white. Neither yields. A stalemate of giants.' },
  { d: '1585-06-01', news: '🌊 Hideyoshi\'s armies land in Shikoku. Chōsokabe Motochika submits and keeps Tosa. The island bows to the Toyotomi.' },
  { d: '1586-01-01', news: '👑 Emperor Ōgimachi abdicates; Prince Katahito ascends as Emperor Go-Yōzei. The court endures, as it always does.' },
  { d: '1587-05-01', news: '🌊 The Kyushu campaign: the mighty Shimazu submit to Hideyoshi. All western Japan now answers to one man.' },
  { d: '1590-07-05', news: '🏯 Odawara falls after a three-month siege. The Hōjō clan ends. Japan — for the first time in a century — is at peace.', effects: [['destroy', 'hojo']] },
  { d: '1590-08-01', news: '🕊 The great wars are over. What remains is YOUR story, onmyoji. The realm is yours to wander — history from here is unwritten.' },
];

EVENTS.sort((a, b) => (a.d < b.d ? -1 : 1));

function cmpDate(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

// Fire every event with lastHistory < d <= today. Returns fired news lines.
export function processDate(s) {
  const today = dateKey(s);
  const fired = [];
  for (const ev of EVENTS) {
    if (cmpDate(ev.d, s.world.lastHistory) <= 0) continue;
    if (cmpDate(ev.d, today) > 0) break;
    if (ev.skipIf && s.world.flags[ev.skipIf]) continue;
    if (ev.battle) {
      fireBattle(s, BATTLES[ev.battle], fired);
    } else {
      if (ev.news) { addNews(s, ev.news); fired.push(ev.news); }
      applyEffects(s, ev.effects);
    }
  }
  s.world.lastHistory = today;
  return fired;
}

function fireBattle(s, b, fired) {
  const canJoin = b.locations.includes(s.player.location);
  addNews(s, `⚔ ${b.name} (${b.jp}) — ${sideNames(b.sideA).join(' & ')} face ${sideNames(b.sideB).join(' & ')}.`);
  fired.push(`⚔ ${b.name} erupts!`);
  if (canJoin) {
    s.world.pendingBattle = b.id;
    fired.push(`📯 You are close enough to JOIN ${b.name}! Decide quickly — battles wait for no one.`);
  } else {
    // resolve historically without the player
    resolveBattle(s, b, null, false, fired);
  }
}

function sideNames(fids) {
  // lazy import avoided; factions.js registers display names via setter
  return fids.map((f) => (factionName ? factionName(f) : f));
}
let factionName = null;
export function setFactionName(fn) { factionName = fn; }

function applyEffects(s, effects) {
  for (const ef of effects || []) {
    const [kind, a, b] = ef;
    if (kind === 'strength' && changeStrength) changeStrength(s, a, b);
    else if (kind === 'destroy' && destroyFaction) destroyFaction(s, a);
    else if (kind === 'flag') s.world.flags[a] = b;
    else if (kind === 'discover' && discoverLoc) discoverLoc(s, a);
    else if (kind === 'odaRename' && odaRename) odaRename(s);
  }
}
let changeStrength = null, destroyFaction = null, discoverLoc = null, odaRename = null;
export function setFactionHooks(hooks) {
  changeStrength = hooks.changeStrength;
  destroyFaction = hooks.destroyFaction;
  discoverLoc = hooks.discoverLoc;
  odaRename = hooks.odaRename;
}

// Player's impact score — can they bend history?
export function playerImpact(s) {
  const rank = s.world.service.rank || 0;
  return s.player.fame + rank * 25 + s.player.level * 6 + s.aiko.bond * 0.3;
}

// Resolve a battle. side: 'a' | 'b' | null (player absent). wonSkirmish: did
// the player win their personal skirmish? fired: array to append news to.
export function resolveBattle(s, battle, side, wonSkirmish, fired = []) {
  const b = typeof battle === 'string' ? BATTLES[battle] : battle;
  let winner = b.winner;
  let upset = false;
  const historicalLoser = b.winner === 'a' ? 'b' : 'a';
  if (side === historicalLoser && wonSkirmish && playerImpact(s) >= 110) {
    winner = historicalLoser;
    upset = true;
    s.world.flags[b.upsetFlag] = true;
  }
  const fx = winner === 'a' ? b.effectsA : b.effectsB;
  applyEffects(s, fx);
  if (upset) {
    addNews(s, b.upsetNews);
    fired.push('🌪 ' + b.upsetNews);
  } else {
    const wnames = sideNames(winner === 'a' ? b.sideA : b.sideB).join(' & ');
    const line = `🏳 ${b.name} ends in victory for ${wnames}. The bards will sing of it.`;
    addNews(s, line);
    fired.push(line);
  }
  if (side) {
    const { addFame, addExp } = impactHooks;
    if (addFame) addFame(s, upset ? 40 : 15);
    if (addExp) addExp(s, wonSkirmish ? 120 : 40);
  }
  s.world.pendingBattle = null;
  return { winner, upset };
}
let impactHooks = {};
export function setImpactHooks(hooks) { impactHooks = hooks; }

// Describe a battle for the join prompt.
export function battleSidesText(battle) {
  const b = typeof battle === 'string' ? BATTLES[battle] : battle;
  return {
    a: sideNames(b.sideA).join(' & '),
    b: sideNames(b.sideB).join(' & '),
  };
}
