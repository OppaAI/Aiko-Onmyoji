// quests.js — main quest "The Hollow Bell" + 3 side quests with moral
// trilemmas (help / exploit / walk away). Quest state lives in
// world.questFlags[qid] = { stage, choice, done }.

import { addExp, addGold, addItem } from './state.js';

export const QUESTS = {
  hollow_bell: {
    title: 'The Hollow Bell', kind: 'main',
    desc: 'A bell tolls where no bell hangs. The disturbances point toward Honnō-ji — and the sixth month of 1582.',
    stages: [
      'Rumors in Kyoto: ask Fujiwara no Michitaka about the bell.',
      'The Weeping Shrine: investigate the Old Shrine.',
      'Trouble at Lake Biwa: look into the kappa tolls at Ōtsu.',
      'Warning from Mt. Hiei: climb the mountain and consult Monk Enkai.',
      'Omen at Azuchi: report to the samurai Tetsuzō.',
      'The Hollow Bell: enter Honnō-ji and silence it forever.',
      'Complete.',
    ],
  },
  kappa_toll: {
    title: "The Kappa's Toll", kind: 'side', giver: 'Kawatarō the Kappa', location: 'otsu',
    desc: 'A kappa shakes down travelers at Lake Biwa. Help the village, exploit the racket, or walk away.',
  },
  widows_rice: {
    title: "The Widow's Rice", kind: 'side', giver: 'Elder Mosuke', location: 'kutsuki',
    desc: 'Ronin steal rice from a war widow. Drive them off, sell "protection", or do nothing.',
  },
  restless_bride: {
    title: 'The Restless Bride', kind: 'side', giver: 'Oyuki the Yurei', location: 'shrine',
    desc: 'A ghost bride waits for a husband who never came home. Release her, bind her, or leave her.',
  },
};

export function questState(s, qid) {
  return s.world.questFlags[qid] || { stage: 0, choice: null, done: false };
}
export function setQuestStage(s, qid, stage) {
  const q = questState(s, qid);
  q.stage = stage;
  if (qid === 'hollow_bell' && stage >= QUESTS.hollow_bell.stages.length - 1) q.done = true;
  s.world.questFlags[qid] = q;
  return q;
}
export function setQuestChoice(s, qid, choice) {
  const q = questState(s, qid);
  q.choice = choice;
  s.world.questFlags[qid] = q;
  return q;
}
export function completeQuest(s, qid) {
  const q = questState(s, qid);
  q.done = true;
  s.world.questFlags[qid] = q;
}

// Called after combats that resolve quest steps.
export function onCombatVictoryQuest(s, enemyId, spared) {
  const notes = [];
  // kappa_toll help path: defeating (or sparing) the kappa in the sumo challenge
  const kt = questState(s, 'kappa_toll');
  if (kt.choice === 'help' && !kt.done && enemyId === 'kappa') {
    completeQuest(s, 'kappa_toll');
    notes.push('Kawatarō yields! “Best two out of three! …No? Fine! No more tolls! You fight like a drowned badger — respect!”');
    notes.push('The fishermen of Ōtsu will tell this story for years. (+8 karma, +80 EXP)');
    s.player.karma = Math.min(100, s.player.karma + 8);
    s.aiko.bond = Math.min(100, s.aiko.bond + 4);
    s.world.npcMemory.kappa_kawataro = { met: true, helped: 1, wronged: 0, notes: ['Lost the sumo challenge; ended the tolls'] };
    addExp(s, 80);
  }
  // widows_rice help path: defeating the ronin
  const wr = questState(s, 'widows_rice');
  if (wr.choice === 'help' && !wr.done && enemyId === 'ronin') {
    completeQuest(s, 'widows_rice');
    notes.push('The ronin flees toward Sekigahara, dropping a sack of rice. Widow Hanae weeps with relief.');
    notes.push('Elder Mosuke presses rice balls into your hands. “The village remembers.” (+8 karma, +60 gold, +herbs)');
    s.player.karma = Math.min(100, s.player.karma + 8);
    s.aiko.bond = Math.min(100, s.aiko.bond + 5);
    addExp(s, 80); addGold(s, 60); addItem(s, 'herb', 2);
    s.world.npcMemory.elder_mosuke = { met: true, helped: 1, wronged: s.world.npcMemory.elder_mosuke?.wronged || 0, notes: ['Drove off the rice-stealing ronin'] };
  }
  // hollow_bell finale
  const hb = questState(s, 'hollow_bell');
  if (hb.stage === 5 && enemyId === 'hollow_bell') {
    setQuestStage(s, 'hollow_bell', 6);
    s.world.flags.game_complete = true;
    notes.push('SILENCE. The Hollow Bell is still. Dawn breaks over Honnō-ji, ordinary and golden.');
  }
  return notes;
}

export function activeQuests(s) {
  return Object.entries(QUESTS)
    .map(([id, q]) => ({ id, ...q, state: questState(s, id) }))
    .filter(q => !q.state.done);
}

export function questJournalText(s, qid) {
  const q = QUESTS[qid], st = questState(s, qid);
  if (q.kind === 'main') return `${q.title} — ${q.stages[Math.min(st.stage, q.stages.length - 1)]}`;
  const c = st.choice ? ` (you chose: ${st.choice})` : '';
  return `${q.title}${st.done ? ' — complete' : ' — in progress'}${c}`;
}
