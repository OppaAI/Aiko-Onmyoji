// dialogue.js — state-aware template dialogue engine.
// NPC archetypes each speak in a DISTINCT style. Beats may be strings or
// functions of state. Topic effects use the effect DSL interpreted by main.js:
//   {karma:n} {gold:n} {exp:n} {bond:n} {heal:n} {item:[id,qty]} {flag:[k,v]}
//   {quest:[qid,stage]} {qchoice:[qid,choice]} {memory:[npc,key,val]}
//   {discover:loc} {combat:enemyId} {aiko:'eventName'}

import { karmaTier, hasItem, dateKey } from './state.js';
import { aikoLine } from './aiko.js';
import { daimyoNpc } from './factions.js';
import { EVENTS } from './history.js';

export const ARCHETYPES = {
  noble:    { label: 'Kyoto Noble',  portrait: 'npc_noble.png',     fallback: '🎎' },
  merchant: { label: 'Sakai Merchant', portrait: 'npc_merchant.png', fallback: '💰' },
  samurai:  { label: 'Gruff Samurai', portrait: 'enemy_samurai.png', fallback: '⚔️' },
  elder:    { label: 'Village Elder', portrait: 'npc_elder.png',    fallback: '🧓' },
  miko:     { label: 'Shrine Maiden', portrait: 'npc_miko.png',     fallback: '⛩️' },
  kappa:    { label: 'Kappa',         portrait: 'enemy_kappa.png',   fallback: '🐢' },
  yurei:    { label: 'Yurei',         portrait: 'enemy_yurei.png',   fallback: '👻' },
  oni:      { label: 'Oni',           portrait: 'enemy_oni.png',     fallback: '👹' },
  daimyo:   { label: 'Daimyo',        portrait: 'enemy_samurai.png', fallback: '👑' },
};

// who: 'n' narrator | 'h' hero | 'a' aiko | npcId
const N = (text) => ({ who: 'n', text });
const H = (text) => ({ who: 'h', text });
const A = (sit) => ({ who: 'a', text: (s) => aikoLine(s, { situation: sit }) });

function karmaGreetExtra(s) {
  const t = karmaTier(s.player.karma);
  if (t === 'benevolent' || t === 'kind') return 'Your reputation as a kind soul precedes you.';
  if (t === 'ruthless' || t === 'harsh') return 'Your dark reputation precedes you. They step aside.';
  return '';
}

export const NPCS = {
  // ---------------- KYOTO ----------------
  noble_fujiwara: {
    name: 'Fujiwara no Michitaka', archetype: 'noble', location: 'kyoto',
    greet(s) {
      const mem = s.world.npcMemory.noble_fujiwara;
      return [
        N('A courtier in layered silk regards you with practiced grace.'),
        { who: 'noble_fujiwara', text: `Ah — the traveling onmyoji of whom the gossips whisper. What a singular delight. ${karmaGreetExtra(s)}` },
        ...(mem && mem.met ? [{ who: 'noble_fujiwara', text: 'We meet again! The capital is ever so much brighter for your return.' }] : []),
        A('idle'),
      ];
    },
    topics: [
      {
        id: 'bell', label: 'Ask about the Hollow Bell',
        need: (s) => (s.world.questFlags.hollow_bell?.stage || 0) === 0,
        beats: (s) => [
          { who: 'noble_fujiwara', text: 'You have heard it, then? A bell — tolling — where no bell hangs. Three nights now, from the direction of the old shrine road.' },
          { who: 'noble_fujiwara', text: 'The court diviners wring their hands and bill by the hour. I prefer results. Investigate the Old Shrine, and you shall find me… appreciative.' },
          A('heeded'),
        ],
        effects: [{ quest: ['hollow_bell', 1] }, { memory: ['noble_fujiwara', 'note', 'Asked to investigate the Hollow Bell'] }],
      },
      {
        id: 'gossip', label: 'Court gossip',
        beats: (s) => [
          { who: 'noble_fujiwara', text: 'The warlords circle like koi round a crumb. Nobunaga builds his castle at Azuchi — so modern, so dreadfully ambitious.' },
          { who: 'noble_fujiwara', text: 'And between us? The Minister of the Left has been seen consulting a fox. A FOX. One simply cannot trust the Left these days.' },
          A('idle'),
        ],
      },
      {
        id: 'spirits', label: "The capital's spirits",
        beats: (s) => [
          { who: 'noble_fujiwara', text: 'Kyoto floats upon a sea of spirits, dear diviner. Most are harmless gossips. Lately, though, even the harmless ones seem… frightened.' },
          N('He lowers his fan. For a moment the courtier mask slips, and he looks genuinely afraid.'),
        ],
      },
    ],
  },

  // ---------------- SAKAI ----------------
  merchant_daijiro: {
    name: 'Daijirō the Merchant', archetype: 'merchant', location: 'sakai',
    greet(s) {
      return [
        N('A round-faced merchant bows so fast his abacus rattles.'),
        { who: 'merchant_daijiro', text: `Friend! Welcome to Sakai, where every problem has a price and every price is negotiable! ${karmaGreetExtra(s)}` },
        { who: 'merchant_daijiro', text: 'Browsing is free! Talking is nearly free! Buying — buying is where the magic happens!' },
      ];
    },
    topics: [
      {
        id: 'rumor', label: 'Buy rumors (10 gold)',
        need: (s) => s.player.gold >= 10,
        beats: (s) => [
          { who: 'merchant_daijiro', text: 'Pleasure doing business! Now: a kappa shakes down travelers at Lake Biwa — tolls! Can you imagine? Even *I* never thought of tolls.' },
          { who: 'merchant_daijiro', text: 'Also: the shrine maiden at the Old Shrine pays in blessings, which — between us — do not spend well, but the heart wants what it wants.' },
          A('idle'),
        ],
        effects: [{ gold: -10 }],
      },
      {
        id: 'sake', label: 'Ask about sacred sake',
        beats: (s) => [
          { who: 'merchant_daijiro', text: 'Sacred sake? For rites? I keep a cask behind the counter — eighty gold, and I throw in my personal guarantee it was blessed by *someone*.' },
          { who: 'merchant_daijiro', text: 'Ghosts love the stuff. No refunds if the ghost is picky.' },
        ],
      },
    ],
  },

  // ---------------- AZUCHI ----------------
  samurai_tetsuzo: {
    name: 'Tetsuzō', archetype: 'samurai', location: 'azuchi',
    greet(s) {
      return [
        N('A scarred samurai leans on his spear, watching you the way a hawk watches a field mouse.'),
        { who: 'samurai_tetsuzo', text: `Onmyoji. Talk. Quick.` },
        ...(karmaTier(s.player.karma) === 'ruthless' || karmaTier(s.player.karma) === 'harsh'
          ? [{ who: 'samurai_tetsuzo', text: 'Heard about you. Keep your darkness leashed in my town.' }]
          : []),
      ];
    },
    topics: [
      {
        id: 'bell4', label: 'Report: the disturbances are converging',
        need: (s) => (s.world.questFlags.hollow_bell?.stage || 0) === 4,
        beats: (s) => [
          { who: 'samurai_tetsuzo', text: 'Hmph. Monks, kappa, ghosts. All pointing one way.' },
          { who: 'samurai_tetsuzo', text: 'My patrols found ashigaru deserting near Honnō-ji. Men don\'t desert pay. They desert *fear*.' },
          { who: 'samurai_tetsuzo', text: 'Take this mirror. It shows what the eye refuses. End it, onmyoji — before the sixth month of 1582, or we all hang.' },
          A('heeded'),
        ],
        effects: [{ quest: ['hollow_bell', 5] }, { item: ['moon_mirror', 1] }, { discover: 'honnoji' }, { bond: 3 }],
      },
      {
        id: 'roads', label: 'Trouble on the roads?',
        beats: (s) => [
          { who: 'samurai_tetsuzo', text: 'Ronin. Everywhere. Masterless dogs with swords. Sekigahara Pass is worst.' },
          { who: 'samurai_tetsuzo', text: 'You meet one? Strike first. Mercy is for people with backup.' },
          A('idle'),
        ],
      },
      {
        id: 'train', label: 'Ask for sword training',
        need: (s) => !s.world.flags.sword_trained,
        beats: (s) => [
          N('He grunts, adjusts your grip twice, and has you drill cuts until sunset.'),
          { who: 'samurai_tetsuzo', text: 'Better. Still sloppy. Come back when you\'ve survived something.' },
        ],
        effects: [{ flag: ['sword_trained', true] }, { exp: 40 }, { bond: 2 }],
      },
    ],
  },

  // ---------------- LAKE BIWA / OTSU ----------------
  kappa_kawataro: {
    name: 'Kawatarō the Kappa', archetype: 'kappa', location: 'otsu',
    greet(s) {
      const mem = s.world.npcMemory.kappa_kawataro;
      if (mem && mem.met && mem.helped > 0) {
        return [
          N('The kappa waves a webbed hand, grinning.'),
          { who: 'kappa_kawataro', text: 'Well well, if it isn\'t my favorite two-legger! The water\'s fine today — I checked. Extensively. You\'re welcome.' },
        ];
      }
      return [
        N('A kappa pops out of the reeds, water glistening on his dish-head.'),
        { who: 'kappa_kawataro', text: 'Halt, halt! This is a toll bridge! …Okay, it\'s a lake. Toll LAKE. Pay up, pay up — cucumbers accepted, flattery also accepted!' },
        A('idle'),
      ];
    },
    topics: [
      {
        id: 'toll', label: 'Confront him about the tolls',
        need: (s) => (s.world.questFlags.kappa_toll?.stage || 0) === 0,
        beats: (s) => [
          { who: 'kappa_kawataro', text: 'The fishermen? Oh, they pay! A toll a day keeps the drownings away! It\'s protection! Very legitimate! Water-legitimate!' },
          A('idle'),
          N('The kappa watches you, suddenly less sure of himself. This is your moment: help the village, exploit the racket — or walk away.'),
        ],
        choices: [
          {
            label: '⚖ Help: end the tolls (sumo challenge!)',
            beats: (s) => [
              H('A sumo match. You versus me. I win, the tolls stay. You win, the tolls end forever.'),
              { who: 'kappa_kawataro', text: 'OHO! A wager! I haven\'t been challenged since the great cucumber famine! …Wait, why did I agree to this. FINE. Let\'s splash!' },
            ],
            effects: [{ combat: 'kappa' }, { qchoice: ['kappa_toll', 'help'] }],
          },
          {
            label: '💰 Exploit: take a cut of the tolls',
            beats: (s) => [
              H('Here\'s a better idea. You keep shaking down travelers — and I get half.'),
              { who: 'kappa_kawataro', text: '…Half?! …You drive a hard bargain, long-legs. FINE. Partners! Shake on it! …You didn\'t bow. Rude. Profitable, but rude.' },
              A('danger'),
            ],
            effects: [{ gold: 60 }, { karma: -12 }, { bond: -5 }, { qchoice: ['kappa_toll', 'exploit'] }, { memory: ['kappa_kawataro', 'wronged', 1] }, { flag: ['kappa_business', true] }],
          },
          {
            label: '🚶 Walk away',
            beats: (s) => [
              N('You turn and leave. Behind you, the kappa resumes his toll booth with renewed enthusiasm.'),
              A('neglect'),
            ],
            effects: [{ karma: -3 }, { bond: -2 }, { qchoice: ['kappa_toll', 'abandon'] }],
          },
        ],
      },
      {
        id: 'lore', label: 'Kappa lore',
        beats: (s) => [
          { who: 'kappa_kawataro', text: 'Lesson one, free of charge: bow to a kappa and we bow back — spill the water on our heads and we\'re powerless! Why am I telling you this. Forget it. Forget it!' },
          { who: 'kappa_kawataro', text: 'Lesson two: we LOVE cucumbers. Sumo. And mischief. Mostly mischief. The cucumbers are just lunch.' },
          A('idle'),
        ],
      },
    ],
  },

  // ---------------- KUTSUKI ----------------
  elder_mosuke: {
    name: 'Elder Mosuke', archetype: 'elder', location: 'kutsuki',
    greet(s) {
      return [
        N('An old man dozes beneath the great camphor tree. One eye opens as you approach.'),
        { who: 'elder_mosuke', text: `Mm? …Ah. The onmyoji. Sit, sit. The tree has waited a hundred years; it can wait while we talk. ${karmaGreetExtra(s)}` },
      ];
    },
    topics: [
      {
        id: 'rice', label: "Hear about the widow's rice",
        need: (s) => (s.world.questFlags.widows_rice?.stage || 0) === 0,
        beats: (s) => [
          { who: 'elder_mosuke', text: 'Slowly, slowly, the rice ripens… and swiftly, swiftly, the ronin steal it. A widow, Hanae, works her paddies alone since her husband fell at Okehazama.' },
          { who: 'elder_mosuke', text: '“A full granary,” the old saying goes, “invites empty hearts.” These ronin have very empty hearts, and very full sacks.' },
          { who: 'elder_mosuke', text: 'Drive them off, and the village remembers. Fleece us for “protection,” and the village remembers that too. Or do nothing — the rice will still grow. Probably. For the ronin.' },
          A('idle'),
        ],
        choices: [
          {
            label: '⚖ Help: drive off the ronin',
            beats: (s) => [
              { who: 'elder_mosuke', text: 'The camphor bows to you, young one. They camp by the Sekigahara road. Go carefully — and come back for supper.' },
            ],
            effects: [{ combat: 'ronin' }, { qchoice: ['widows_rice', 'help'] }],
          },
          {
            label: '💰 Exploit: sell the village "protection" (80 gold)',
            beats: (s) => [
              { who: 'elder_mosuke', text: '…Eighty gold. The village will pay. The saying goes: “When the fox guards the hens, count the hens.” We will count them.' },
              A('danger'),
            ],
            effects: [{ gold: 80 }, { karma: -12 }, { bond: -5 }, { qchoice: ['widows_rice', 'exploit'] }, { memory: ['elder_mosuke', 'wronged', 1] }],
          },
          {
            label: '🚶 Walk away',
            beats: (s) => [
              N('You leave the village to its fate. The camphor leaves rustle, disappointed.'),
              A('neglect'),
            ],
            effects: [{ karma: -3 }, { bond: -2 }, { qchoice: ['widows_rice', 'abandon'] }],
          },
        ],
      },
      {
        id: 'proverb', label: 'Ask for village news',
        beats: (s) => [
          { who: 'elder_mosuke', text: 'News? The well ran sweet this week. Young Jirō caught a carp THIS big — the arms lie, the carp stays silent.' },
          { who: 'elder_mosuke', text: 'And the mountain road grows teeth after dark. “The nail that sticks up,” they say, “gets patrolled by ronin.” Something like that.' },
        ],
      },
    ],
  },

  // ---------------- OLD SHRINE ----------------
  miko_hana: {
    name: 'Hana the Shrine Maiden', archetype: 'miko', location: 'shrine',
    greet(s) {
      return [
        N('A young miko sweeps the mossy steps, bells chiming softly at her sleeves.'),
        { who: 'miko_hana', text: `Welcome, traveler. The kami are quiet today… mostly. ${karmaGreetExtra(s)} Please, rest your feet a moment.` },
      ];
    },
    topics: [
      {
        id: 'bell1', label: 'Ask about the Hollow Bell',
        need: (s) => (s.world.questFlags.hollow_bell?.stage || 0) === 1,
        beats: (s) => [
          { who: 'miko_hana', text: 'You heard it too? …Three nights. It tolls from nowhere, and afterward the lanterns gutter, though no wind blows.' },
          { who: 'miko_hana', text: 'Oyuki weeps harder when it tolls — the poor soul by the offering box. And the fishermen at Lake Biwa say their kappa has grown bold. It is all… connected, I feel it.' },
          { who: 'miko_hana', text: 'Please, look into the disturbances at Ōtsu. And be kind to Oyuki, if you can. She was kind, once.' },
          A('heeded'),
        ],
        effects: [{ quest: ['hollow_bell', 2] }, { bond: 2 }],
      },
      {
        id: 'oyuki', label: "Who is the grieving ghost?",
        beats: (s) => [
          { who: 'miko_hana', text: 'Oyuki. She waited here for a husband who never returned from the wars. She waited so long that waiting became… her.' },
          { who: 'miko_hana', text: 'I keep a lantern lit for her. Someone should remember her kindly. Perhaps that someone could be you?' },
        ],
      },
      {
        id: 'blessing', label: 'Receive a blessing',
        need: (s) => s.world.flags.blessed_day !== dateKey(s),
        beats: (s) => [
          N('Hana waves a sacred wand over you, bells ringing clear. Warmth settles into your bones.'),
          { who: 'miko_hana', text: 'Go with the kami\'s favor, traveler. And do come back safely — the lanterns burn brighter when friends return.' },
        ],
        effects: [{ heal: 25 }, { karma: 2 }, { flag: ['blessed_today', true] }, { flag: ['blessed_day', 'TODAY'] }],
      },
    ],
  },

  yurei_oyuki: {
    name: 'Oyuki the Yurei', archetype: 'yurei', location: 'shrine',
    greet(s) {
      return [
        N('By the offering box kneels a pale woman in a faded wedding kimono. She does not look up.'),
        { who: 'yurei_oyuki', text: '…cold… so cold… he said… “wait for me”… I waited… I am… still… waiting…' },
        A('idle'),
      ];
    },
    topics: [
      {
        id: 'rest', label: 'Lay her to rest — or bind her',
        need: (s) => (s.world.questFlags.restless_bride?.stage || 0) === 0,
        beats: (s) => [
          { who: 'yurei_oyuki', text: '…rest…? I… don\'t remember… how… the bell… it tolls… and I… forget his face… a little more… each time…' },
          N('Her form flickers. You could perform the rite of release — it needs sacred sake and a night visit. Or you could bind her sorrow to your service. Or leave her to the cold.'),
        ],
        choices: [
          {
            label: '⚖ Help: perform the rite of release',
            need: (s) => hasItem(s, 'sacred_sake') && (s.world.hour >= 20 || s.world.hour < 5),
            beats: (s) => [
              N('By moonlight you pour the sacred sake and speak the words of release. Oyuki looks up — and for the first time, she smiles.'),
              { who: 'yurei_oyuki', text: '…warm… I remember… his laugh… thank… you… I can… go… now…' },
              N('Petals of light rise from the offering box and scatter on the night wind. The shrine feels warmer already.'),
              A('karma_up'),
            ],
            effects: [{ item: ['sacred_sake', -1] }, { karma: 10 }, { bond: 6 }, { exp: 80 }, { qchoice: ['restless_bride', 'help'] }, { memory: ['yurei_oyuki', 'helped', 1] }],
          },
          {
            label: '⚖ Help: (need sacred sake, and visit at Night)',
            need: (s) => !(hasItem(s, 'sacred_sake') && (s.world.hour >= 20 || s.world.hour < 5)),
            beats: (s) => [ N('The rite needs sacred sake (sold in Sakai) and the stillness of night. You are not ready yet.') ],
            effects: [],
          },
          {
            label: '💰 Exploit: bind her as your servant',
            beats: (s) => [
              H('Your grief is power, Oyuki. Serve me, and I will give it… direction.'),
              N('You speak the binding words. Her flickering form stills — then bows, hollow-eyed, and folds herself into a charm at your belt. The shrine lanterns gutter out.'),
              { who: 'yurei_oyuki', text: '…as… you… command… master…' },
              A('karma_down'),
            ],
            effects: [{ item: ['bride_charm', 1] }, { karma: -14 }, { bond: -6 }, { qchoice: ['restless_bride', 'exploit'] }, { memory: ['yurei_oyuki', 'wronged', 1] }],
          },
          {
            label: '🚶 Walk away',
            beats: (s) => [
              N('You leave her kneeling in the cold. Behind you, very faintly, the weeping resumes.'),
              A('neglect'),
            ],
            effects: [{ karma: -3 }, { bond: -2 }, { qchoice: ['restless_bride', 'abandon'] }],
          },
        ],
      },
      {
        id: 'story', label: 'Hear her story',
        beats: (s) => [
          { who: 'yurei_oyuki', text: '…spring… he left… in armor… too big… for him… “wait,” he said… “I\'ll bring you… a comb… from the capital…”' },
          { who: 'yurei_oyuki', text: '…autumn… came… winter… came… the comb… never… came…' },
          A('idle'),
        ],
      },
    ],
  },

  // ---------------- MT. HIEI ----------------
  monk_enkai: {
    name: 'Monk Enkai', archetype: 'elder', location: 'hiei',
    greet(s) {
      return [
        N('A warrior monk with a naginata polishes the temple steps with military precision.'),
        { who: 'monk_enkai', text: 'An onmyoji climbs the mountain. The sutras say: “When the diviner comes unasked, the trouble is already here.” State your trouble.' },
      ];
    },
    topics: [
      {
        id: 'bell3', label: 'The disturbances point here',
        need: (s) => (s.world.questFlags.hollow_bell?.stage || 0) === 3,
        beats: (s) => [
          { who: 'monk_enkai', text: 'The shrine weeps, the lake demands tolls. Yes. We have watched the same pattern from this mountain.' },
          { who: 'monk_enkai', text: '“All bells,” the old sutra says, “toll for the living — save one.” The Hollow Bell tolls for the dead, and it counts down. To the sixth month of 1582.' },
          { who: 'monk_enkai', text: 'Its echo gathers at Azuchi, where ambition is thickest. A gruff samurai there has seen what you need to see. Go. And onmyoji — do not let it toll thirteen times.' },
          A('heeded'),
        ],
        effects: [{ quest: ['hollow_bell', 4] }, { bond: 2 }],
      },
      {
        id: 'sutra', label: 'Ask for wisdom',
        beats: (s) => [
          { who: 'monk_enkai', text: '“The bow that is always bent,” the sutra says, “loses its spring.” Rest, diviner. Even spirits need sleep.' },
          { who: 'monk_enkai', text: 'Also: “Trust a smiling kappa exactly as far as you can throw one.” Which is not far. They are slippery.' },
        ],
      },
    ],
  },
};

export function npcsAt(s, locId) {
  return Object.entries(NPCS)
    .filter(([, n]) => n.location === locId)
    .map(([id, n]) => ({ id, ...n }));
}

export function archetypeOf(npcId) {
  const n = NPCS[npcId];
  return n ? ARCHETYPES[n.archetype] : ARCHETYPES.elder;
}

// ---------------------------------------------------------------- daimyo audiences
// Daimyo are dynamic NPCs (ids 'daimyo_<fid>') built from live faction state:
// the right lord, the right capital, the right personality — for the date.
export function isDaimyoNpc(npcId) { return typeof npcId === 'string' && npcId.startsWith('daimyo_'); }

// Gossip hint: the next historical event, phrased as rumor.
export function nextEventHint(s) {
  const today = dateKey(s);
  const ev = EVENTS.find((e) => e.d > today && e.news && !(e.skipIf && s.world.flags[e.skipIf]));
  if (!ev) return 'The realm is quiet. For now, that is blessing enough.';
  return ev.news.replace(/^[^\s]+\s/, '');
}

export function resolveNpc(s, npcId) {
  if (isDaimyoNpc(npcId)) {
    return daimyoNpc(s, npcId.slice('daimyo_'.length), nextEventHint(s));
  }
  return NPCS[npcId];
}

// Portrait override for dynamic NPCs (daimyo), else archetype default.
export function npcPortraitFor(npc) {
  if (npc && npc.portrait) return { portrait: npc.portrait, fallback: '👑' };
  if (npc && ARCHETYPES[npc.archetype]) return ARCHETYPES[npc.archetype];
  return ARCHETYPES.elder;
}

// Resolve a beat's text (string or function of state).
export function beatText(s, beat) {
  return typeof beat.text === 'function' ? beat.text(s) : beat.text;
}
