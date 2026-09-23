// dialogue.js — state-aware template dialogue engine.
// NPC archetypes each speak in a DISTINCT style. Beats may be strings or
// functions of state. Topic effects use the effect DSL interpreted by main.js:
//   {karma:n} {gold:n} {exp:n} {bond:n} {heal:n} {item:[id,qty]} {flag:[k,v]}
//   {quest:[qid,stage]} {qchoice:[qid,choice]} {qcomplete:qid} {memory:[npc,key,val]}
//   {discover:loc} {combat:enemyId} {aiko:'eventName'}

import { karmaTier, hasItem, dateKey, pick } from './state.js';
import { aikoLine } from './aiko.js';
import { daimyoNpc } from './factions.js';
import { EVENTS } from './history.js';

export const ARCHETYPES = {
  noble:    { label: 'Kyoto Noble',  portrait: 'npc_noble.png',     fallback: '🎎' },
  merchant: { label: 'Sakai Merchant', portrait: 'npc_merchant.png', fallback: '💰' },
  samurai:  { label: 'Gruff Samurai', portrait: 'enemy_samurai.png', fallback: '⚔️' },
  elder:    { label: 'Village Elder', portrait: 'npc_elder.png',    fallback: '🧓' },
  miko:     { label: 'Shrine Maiden', portrait: 'npc_miko.png',     fallback: '⛩️' },
  monk:     { label: 'Warrior Monk', portrait: 'npc_monk.png',     fallback: '🙏' },
  kappa:    { label: 'Kappa',         portrait: 'enemy_kappa.png',   fallback: '🐢' },
  yurei:    { label: 'Yurei',         portrait: 'enemy_yurei.png',   fallback: '👻' },
  oni:      { label: 'Oni',           portrait: 'enemy_oni.png',     fallback: '👹' },
  daimyo:   { label: 'Daimyo',        portrait: 'enemy_samurai.png', fallback: '👑' },
  // Adult romance archetypes — portraits are fully-clothed, tasteful bust portraits.
  villager_woman: { label: 'Village Woman', portrait: 'npc_villager_woman.png', fallback: '👩‍🌾' },
  merchant_woman: { label: 'Sakai Merchant', portrait: 'npc_merchant_woman.png', fallback: '💰' },
  noble_lady:  { label: 'Court Lady',   portrait: 'npc_noble_lady.png',   fallback: '🎎' },
  dancer:      { label: 'Shirabyoshi Dancer', portrait: 'npc_dancer.png', fallback: '💃' },
  onna_musha:  { label: 'Woman Warrior', portrait: 'npc_onna_musha.png',  fallback: '🗡️' },
  innkeeper:   { label: 'Innkeeper',    portrait: 'npc_innkeeper.png',    fallback: '🏮' },
  princess:    { label: 'Princess',     portrait: 'npc_princess_iroha.png', fallback: '👸' },
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
        need: (s) => {
          const q = s.world.questFlags.kappa_toll;
          return !q?.done && (!q?.choice || q.choice === 'help');
        },
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
            effects: [{ qchoice: ['kappa_toll', 'help'] }, { combat: 'kappa' }],
          },
          {
            label: '💰 Exploit: take a cut of the tolls',
            beats: (s) => [
              H('Here\'s a better idea. You keep shaking down travelers — and I get half.'),
              { who: 'kappa_kawataro', text: '…Half?! …You drive a hard bargain, long-legs. FINE. Partners! Shake on it! …You didn\'t bow. Rude. Profitable, but rude.' },
              A('danger'),
            ],
            effects: [{ gold: 60 }, { karma: -12 }, { bond: -5 }, { qchoice: ['kappa_toll', 'exploit'] }, { qcomplete: 'kappa_toll' }, { memory: ['kappa_kawataro', 'wronged', 1] }, { flag: ['kappa_business', true] }],
          },
          {
            label: '🚶 Walk away',
            beats: (s) => [
              N('You turn and leave. Behind you, the kappa resumes his toll booth with renewed enthusiasm.'),
              A('neglect'),
            ],
            effects: [{ karma: -3 }, { bond: -2 }, { qchoice: ['kappa_toll', 'abandon'] }, { qcomplete: 'kappa_toll' }],
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
        need: (s) => {
          const q = s.world.questFlags.widows_rice;
          return !q?.done && (!q?.choice || q.choice === 'help');
        },
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
            effects: [{ qchoice: ['widows_rice', 'help'] }, { combat: 'ronin' }],
          },
          {
            label: '💰 Exploit: sell the village "protection" (80 gold)',
            beats: (s) => [
              { who: 'elder_mosuke', text: '…Eighty gold. The village will pay. The saying goes: “When the fox guards the hens, count the hens.” We will count them.' },
              A('danger'),
            ],
            effects: [{ gold: 80 }, { karma: -12 }, { bond: -5 }, { qchoice: ['widows_rice', 'exploit'] }, { qcomplete: 'widows_rice' }, { memory: ['elder_mosuke', 'wronged', 1] }],
          },
          {
            label: '🚶 Walk away',
            beats: (s) => [
              N('You leave the village to its fate. The camphor leaves rustle, disappointed.'),
              A('neglect'),
            ],
            effects: [{ karma: -3 }, { bond: -2 }, { qchoice: ['widows_rice', 'abandon'] }, { qcomplete: 'widows_rice' }],
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
        need: (s) => !s.world.questFlags.restless_bride?.done,
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
            effects: [{ item: ['sacred_sake', -1] }, { karma: 10 }, { bond: 6 }, { exp: 80 }, { qchoice: ['restless_bride', 'help'] }, { qcomplete: 'restless_bride' }, { memory: ['yurei_oyuki', 'helped', 1] }],
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
            effects: [{ item: ['bride_charm', 1] }, { karma: -14 }, { bond: -6 }, { qchoice: ['restless_bride', 'exploit'] }, { qcomplete: 'restless_bride' }, { memory: ['yurei_oyuki', 'wronged', 1] }],
          },
          {
            label: '🚶 Walk away',
            beats: (s) => [
              N('You leave her kneeling in the cold. Behind you, very faintly, the weeping resumes.'),
              A('neglect'),
            ],
            effects: [{ karma: -3 }, { bond: -2 }, { qchoice: ['restless_bride', 'abandon'] }, { qcomplete: 'restless_bride' }],
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
    name: 'Monk Enkai', archetype: 'monk', location: 'hiei',
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

  // ---------------------------------------------------------------- adult romance NPCs
  // POLICY: 🔞 topics exist ONLY on NPCs flagged `adult: true` — explicitly adult
  // women (ages stated in narration), always fully consensual. NEVER attach
  // intimate topics to Aiko, to minors, or to ambiguous-age NPCs
  // (miko_hana stays strictly platonic). Portraits are non-explicit; the 🔞
  // content lives in dialogue text only.

  // ---------------- KUTSUKI ----------------
  widow_hanae: {
    name: 'Hanae the Widow', archetype: 'villager_woman', location: 'kutsuki', adult: true,
    greet(s) {
      const helped = s.world.questFlags.widows_rice && s.world.questFlags.widows_rice.choice === 'help';
      return [
        N('A woman in her early thirties straightens up from the rice paddies, pushing damp hair from her forehead. Her late husband\'s ring hangs on a cord at her throat.'),
        ...(helped
          ? [{ who: 'widow_hanae', text: 'The onmyoji! …You drove those ronin off, and my rice stands tall because of it. Come, sit — the tea is already hot. I find I am always expecting you.' }]
          : [{ who: 'widow_hanae', text: `A traveler? Here? …Forgive me, I see few new faces since my husband fell at Okehazama. I am Hanae. ${karmaGreetExtra(s)}` }]),
      ];
    },
    topics: [
      {
        id: 'paddies', label: 'Talk about the paddies',
        beats: (s) => [
          { who: 'widow_hanae', text: 'Rice is honest work. You plant, you weed, you pray, you harvest — and the rice does not lie to you the way people do.' },
          { who: 'widow_hanae', text: 'My husband used to say a paddy is like a marriage: neglect it one season and it takes three to forgive you. …He would know. He neglected neither.' },
        ],
      },
      {
        id: 'evening', label: '💗 Spend an evening together',
        need: (s) => !s.world.flags.aff_hanae,
        beats: (s) => [
          N('You stay past dusk. Hanae serves barley tea, and the talk drifts — the war, the weather, the dead. She laughs for the first time, startled by the sound of it.'),
          { who: 'widow_hanae', text: 'Six years a widow, and I had forgotten what it is to simply… talk. To be looked at as a woman, not a problem to be solved. Thank you for this evening.' },
          N('When you leave, her hand lingers on your sleeve a moment longer than custom requires.'),
        ],
        effects: [{ flag: ['aff_hanae', 2] }, { exp: 25 }, { memory: ['widow_hanae', 'note', 'Shared a long evening of talk'] }],
      },
      {
        id: 'night', label: '🌙 Share her futon 🔞',
        need: (s) => (s.world.flags.aff_hanae || 0) >= 2 && !s.world.flags.lover_hanae,
        beats: (s) => [
          N('The lamp burns low. Hanae sets down her tea bowl with deliberate care and looks at you — really looks at you — the way a woman looks when she has decided something.'),
          { who: 'widow_hanae', text: 'Six years I have slept alone in this house. Six years of cold futon and colder mornings. …Tonight, I do not want to be alone. If you want me — say so plainly. I am too old for riddles.' },
          H('Then come here, Hanae. No riddles.'),
          N('She leads you past the butsudan where her husband\'s tablet watches without judgment, and slides the shoji closed. Her hands tremble only a little as she loosens her obi — then grow steadier as your fingers find the knot at her collar and ease her kimono from her shoulders.'),
          N('Her skin is warm from the hearth and smells of rice straw and soap. She sighs into your shoulder when you touch her — a sound six years deep — and pulls you down onto the futon with a widow\'s frank hunger. No maiden shyness remains in her, only need and warmth and living heat, and she moves with you urgently, whispering your name like a prayer she had forgotten she knew.'),
          N('After, she lies with her head on your chest, tracing idle patterns on your skin, and laughs softly — the first unguarded laugh you have heard from her. “Stay till the lamp gutters,” she whispers. “The morning will come soon enough.”'),
        ],
        effects: [{ flag: ['lover_hanae', true] }, { heal: 50 }, { exp: 60 }, { memory: ['widow_hanae', 'note', 'Lovers — spent the night together'] }],
      },
      {
        id: 'lover', label: '🌅 Visit Hanae',
        need: (s) => s.world.flags.lover_hanae && s.world.flags.lovday_hanae !== dateKey(s),
        beats: (s) => [
          N('Hanae\'s face lights up when she sees you on the path. She hurries over, unashamed, and takes your hand.'),
          { who: 'widow_hanae', text: 'You came back. The nights are warmer when I know you might. …Stay a while?' },
        ],
        choices: [
          {
            label: '🌙 Spend the night together 🔞',
            beats: (s) => [
              N('No words are needed now. She draws you inside, and the evening unfolds the way it has before — tea first, then talk, then the shoji sliding closed and her kimono pooling at her feet.'),
              N('She knows your body now, and you know hers — the places that make her gasp, the slow rhythm she loves. She arches beneath you in the lamplight, unhurried and unashamed, and afterward holds you close until the lamp gutters out. “The paddies can wait till dawn,” she murmurs, drowsy and sated.'),
            ],
            effects: [{ heal: 30 }, { exp: 15 }, { flag: ['lovday_hanae', 'TODAY'] }],
          },
          {
            label: '💗 Just talk till late',
            beats: (s) => [
              N('You talk till the tea goes cold — of rice, of the dead, of small bright things. When you leave, she presses a rice cake into your hands.'),
              { who: 'widow_hanae', text: 'Eat. You think too much on an empty stomach. …And come back soon. The futon is cold without you, but the evenings are warm.' },
              A('idle'),
            ],
            effects: [{ exp: 10 }, { bond: 2 }, { flag: ['lovday_hanae', 'TODAY'] }],
          },
        ],
      },
    ],
  },

  // ---------------- SAKAI ----------------
  merchant_yae: {
    name: 'Yae of Sakai', archetype: 'merchant_woman', location: 'sakai', adult: true,
    greet(s) {
      return [
        N('Behind a counter stacked with coin boxes, a woman in her late twenties tallies figures without looking up — then does, and smiles like a cat that owns the creamery.'),
        { who: 'merchant_yae', text: `Another customer? No — something more interesting. An onmyoji. I am Yae, and everything in this shop is for sale… except me. ${karmaGreetExtra(s)} Though some things can be… negotiated.` },
      ];
    },
    topics: [
      {
        id: 'trade', label: 'Talk business',
        beats: (s) => [
          { who: 'merchant_yae', text: 'Sakai runs on three things: coin, gossip, and other people\'s secrets. The Oda buy guns, the Hongan-ji buys rice, and everyone buys information — usually from me.' },
          { who: 'merchant_yae', text: 'A word of trade wisdom, free of charge: never bargain when you are hungry, lonely, or in love. You will overpay every time.' },
        ],
      },
      {
        id: 'evening', label: '💗 Share sake after closing',
        need: (s) => !s.world.flags.aff_yae,
        beats: (s) => [
          N('After the shutters close, Yae pours two cups of good sake and kicks her abacus aside. Business Yae melts away; what remains is simply a woman, tired and sharp and lonely in a city of coin-counters.'),
          { who: 'merchant_yae', text: 'You know what no one buys from me? Company. Everyone wants my goods, my gossip, my gold — nobody wants Yae. …You are a strange one, onmyoji. I find I do not mind it.' },
        ],
        effects: [{ flag: ['aff_yae', 2] }, { exp: 25 }, { memory: ['merchant_yae', 'note', 'Shared sake after closing'] }],
      },
      {
        id: 'night', label: '🌙 A merchant\'s private bargain 🔞',
        need: (s) => (s.world.flags.aff_yae || 0) >= 2 && !s.world.flags.lover_yae,
        beats: (s) => [
          N('Yae locks the shop door, turns the sign to CLOSED, and leans back against the counter, arms folded. Her merchant\'s smile has softened into something far more dangerous.'),
          { who: 'merchant_yae', text: 'Everything has a price, onmyoji — that is the law of Sakai. So here is my price, stated plainly: tonight, no coin. No bargaining. Just you, and me, and honesty. Do we have a deal?' },
          H('Deal.'),
          N('“Good,” she breathes, and crosses the room in three strides. Her kiss tastes of sake and ambition. She undresses with a merchant\'s efficiency and a lover\'s impatience, and pulls you down among the silk bolts in the back room, laughing breathlessly when the shelves rattle.'),
          N('She is demanding and generous by turns — used to getting what she wants, and discovering, delighted, that what she wants is to give. Her nails trace your back as she moves above you, silk sliding against skin, until you both collapse laughing into the bolts of cloth, gloriously disheveled. “Best… trade… I ever made,” she pants.'),
        ],
        effects: [{ flag: ['lover_yae', true] }, { heal: 50 }, { exp: 60 }, { memory: ['merchant_yae', 'note', 'Lovers — spent the night together'] }],
      },
      {
        id: 'lover', label: '🌅 Visit Yae',
        need: (s) => s.world.flags.lover_yae && s.world.flags.lovday_yae !== dateKey(s),
        beats: (s) => [
          N('Yae spots you through the shop curtains and shoos her apprentice out with startling speed.'),
          { who: 'merchant_yae', text: 'My favorite customer — the one who never pays and is worth every coin. The back room is free. …Or did you come to actually buy something? Disappointing, if so.' },
        ],
        choices: [
          {
            label: '🌙 Spend the night together 🔞',
            beats: (s) => [
              N('The sign flips to CLOSED with practiced speed. Among the silk bolts, Yae is every bit as bold as the first night — and now she knows exactly how to undo you, taking her time, savoring it, until the shop\'s rafters ring with her laughter and your name.'),
            ],
            effects: [{ heal: 30 }, { exp: 15 }, { flag: ['lovday_yae', 'TODAY'] }],
          },
          {
            label: '💗 Just talk till late',
            beats: (s) => [
              N('You talk markets and war and nonsense till the candles drown. She rests her head on your shoulder, briefly unguarded.'),
              { who: 'merchant_yae', text: 'Do not tell the guild. "Yae, soft." They would double my taxes out of spite.' },
              A('idle'),
            ],
            effects: [{ exp: 10 }, { bond: 2 }, { flag: ['lovday_yae', 'TODAY'] }],
          },
        ],
      },
    ],
  },

  // ---------------- KYOTO ----------------
  lady_tsubaki: {
    name: 'Lady Tsubaki', archetype: 'noble_lady', location: 'kyoto', adult: true,
    sceneCg: 'cg_garden_moon.png',
    greet(s) {
      return [
        N('In a palace garden, a court lady in her early twenties in layered juni-hitoe robes pauses her fan mid-stroke. She regards you with open curiosity — rare in this court of masks.'),
        { who: 'lady_tsubaki', text: `An onmyoji, in the flesh, and not one of the court's dusty old diviners. I am Tsubaki, lady-in-waiting. ${karmaGreetExtra(s)} Do speak — the court is starved of honest voices.` },
      ];
    },
    topics: [
      {
        id: 'court', label: 'Court gossip',
        beats: (s) => [
          { who: 'lady_tsubaki', text: 'The gossip? The Minister of the Right is writing love poems to a married lady — badly. The Emperor\'s cat has taken to sleeping on state documents, which improves them.' },
          { who: 'lady_tsubaki', text: 'And the warlords send gifts and veiled threats in equal measure. Nobunaga sent melons. One does not send melons without meaning something. Nobody knows what.' },
        ],
      },
      {
        id: 'evening', label: '💗 Exchange poems',
        need: (s) => !s.world.flags.aff_tsubaki,
        beats: (s) => [
          N('You trade waka as the garden darkens — thirty-one syllables at a time, saying what cannot be said plainly. Her verses grow bolder with each exchange.'),
          { who: 'lady_tsubaki', text: '“If only night / had no dawn to follow — / I would not grieve / the moon that sets, / but the hours we lose.” …There. I have shocked myself. Do not tell the other ladies. Or do — I am past caring what they think.' },
        ],
        effects: [{ flag: ['aff_tsubaki', 2] }, { exp: 25 }, { memory: ['lady_tsubaki', 'note', 'Exchanged waka poems in the garden'] }],
      },
      {
        id: 'night', label: '🌙 A stolen night 🔞',
        need: (s) => (s.world.flags.aff_tsubaki || 0) >= 2 && !s.world.flags.lover_tsubaki,
        beats: (s) => [
          N('A folded poem arrives at dusk: “The garden gate will be unbarred at the hour of the boar. Come alone. Burn this.” You burn it.'),
          N('Tsubaki waits among the maples in a plain sleeping robe, all court artifice set aside — just a young woman, breathless, her composure cracking the moment she sees you. “If we are caught,” she whispers, “I am ruined. …Kiss me anyway.”'),
          H('Then we will simply have to be worth the risk.'),
          N('Her mouth is eager and unpracticed in the most endearing way, and her hands shake as she draws you down onto the moss. Layer by layer the court lady disappears, until there is only Tsubaki — flushed, gasping, clinging to you in the moonlight filtering through the maples, propriety abandoned entirely to pleasure.'),
          N('After, she lies in the circle of your arms, robes hopelessly disordered, and laughs at the scandal of it. “The other ladies write poems about nights like this,” she murmurs. “I shall simply have lived one.”'),
        ],
        effects: [{ flag: ['lover_tsubaki', true] }, { heal: 50 }, { exp: 60 }, { memory: ['lady_tsubaki', 'note', 'Lovers — a stolen night in the palace garden'] }],
      },
      {
        id: 'lover', label: '🌅 Visit Tsubaki',
        need: (s) => s.world.flags.lover_tsubaki && s.world.flags.lovday_tsubaki !== dateKey(s),
        beats: (s) => [
          N('Tsubaki contrives to meet you by the garden pond, fan fluttering with suspicious innocence.'),
          { who: 'lady_tsubaki', text: 'You are late. I have composed three poems about your lateness, each more cutting than the last. …I missed you. The poems are lies.' },
        ],
        choices: [
          {
            label: '🌙 A stolen night together 🔞',
            beats: (s) => [
              N('The garden gate, the hour of the boar, the maples. Tsubaki has grown bolder — she meets your kiss with practiced hunger now, and what follows among the shadows is unhurried and exquisite, two conspirators fluent at last in each other\'s pleasure.'),
            ],
            effects: [{ heal: 30 }, { exp: 15 }, { flag: ['lovday_tsubaki', 'TODAY'] }],
          },
          {
            label: '💗 Just talk till late',
            beats: (s) => [
              N('You walk the garden paths, trading verses and gossip. For an hour the war does not exist.'),
              { who: 'lady_tsubaki', text: 'When this is all over — the wars, the waiting — write me a poem that does not have to be burned.' },
              A('idle'),
            ],
            effects: [{ exp: 10 }, { bond: 2 }, { flag: ['lovday_tsubaki', 'TODAY'] }],
          },
        ],
      },
    ],
  },

  dancer_koharu: {
    name: 'Koharu the Dancer', archetype: 'dancer', location: 'kyoto', adult: true,
    greet(s) {
      return [
        N('A shirabyoshi dancer in her early twenties practices steps in an empty courtyard, hand drum tapping. She spins, spots you, and bows with a performer\'s flourish.'),
        { who: 'dancer_koharu', text: `An audience of one! How luxurious. I am Koharu — I dance for gods, warlords, and anyone with eyes. ${karmaGreetExtra(s)} Stay for a song?` },
      ];
    },
    topics: [
      {
        id: 'dance', label: 'Watch her dance',
        beats: (s) => [
          N('Koharu dances — sleeves sweeping, drum keeping time, every step a prayer and a tease at once. For a few minutes the war, the spirits, the hunger all fall away.'),
          { who: 'dancer_koharu', text: 'Did you feel it? That is what dance is for — reminding the body it is alive. You look like a man who needed reminding.' },
        ],
        effects: [{ heal: 15 }, { exp: 10 }],
      },
      {
        id: 'evening', label: '💗 Walk her home after the show',
        need: (s) => !s.world.flags.aff_koharu,
        beats: (s) => [
          N('After her last performance you walk Koharu home through lantern-lit streets. Offstage she is quieter — thoughtful, funny, tired in a way that has nothing to do with dancing.'),
          { who: 'dancer_koharu', text: 'Everyone watches me dance. Nobody walks me home. …You are the first person in years to ask what *I* like. I like this. I like you, onmyoji. There — I said it. Dancers are supposed to be mysterious, so forget I did.' },
        ],
        effects: [{ flag: ['aff_koharu', 2] }, { exp: 25 }, { memory: ['dancer_koharu', 'note', 'Walked her home after the show'] }],
      },
      {
        id: 'night', label: '🌙 A dance for two 🔞',
        need: (s) => (s.world.flags.aff_koharu || 0) >= 2 && !s.world.flags.lover_koharu,
        beats: (s) => [
          N('Koharu meets you after the crowds have gone, still in her dancing robes, hair coming loose. She closes the door of her small room and turns to you with a look that is pure invitation.'),
          { who: 'dancer_koharu', text: 'One audience. One dancer. …Dance with me? Not the steps — I will teach you those later. The other dance. The one with no audience at all.' },
          N('She undresses the way she dances — slowly, deliberately, every movement a promise. Her body is strong and supple from years of training, and she uses all of it: leading, teasing, drawing you into a rhythm that needs no drum. When she finally takes you into her arms in earnest, it is with a dancer\'s total commitment — breathless, laughing, utterly alive.'),
          N('After, she drums a soft beat on your chest with her fingertips. “Best performance of my life,” she whispers, “and no one will ever see it. Ours alone.”'),
        ],
        effects: [{ flag: ['lover_koharu', true] }, { heal: 50 }, { exp: 60 }, { memory: ['dancer_koharu', 'note', 'Lovers — a private dance for two'] }],
      },
      {
        id: 'lover', label: '🌅 Visit Koharu',
        need: (s) => s.world.flags.lover_koharu && s.world.flags.lovday_koharu !== dateKey(s),
        beats: (s) => [
          N('Koharu waves from the stage door, already half out of costume.'),
          { who: 'dancer_koharu', text: 'My favorite audience! Front row, every time. …Come in. The drum is resting, but I am not.' },
        ],
        choices: [
          {
            label: '🌙 A private dance together 🔞',
            beats: (s) => [
              N('No performance this time — just the two of you, and Koharu\'s dancer\'s grace turned entirely to pleasure. She takes her time, savoring every moment, and the small room fills with soft laughter and softer sounds until you both lie tangled and spent among the discarded robes.'),
            ],
            effects: [{ heal: 30 }, { exp: 15 }, { flag: ['lovday_koharu', 'TODAY'] }],
          },
          {
            label: '💗 Just talk till late',
            beats: (s) => [
              N('She teaches you a simple drum pattern; you are terrible at it; she laughs until she cries.'),
              { who: 'dancer_koharu', text: 'The gods gave you spirit sight and took your rhythm as payment. A fair trade. Mostly.' },
              A('idle'),
            ],
            effects: [{ exp: 10 }, { bond: 2 }, { flag: ['lovday_koharu', 'TODAY'] }],
          },
        ],
      },
    ],
  },

  // ---------------- AZUCHI ----------------
  musha_ayame: {
    name: 'Ayame the Onna-musha', archetype: 'onna_musha', location: 'azuchi', adult: true,
    greet(s) {
      return [
        N('A woman warrior in her mid-twenties drills spear forms in the castle town\'s training ground, naginata whistling. She halts mid-cut and studies you with a soldier\'s frank appraisal.'),
        { who: 'musha_ayame', text: `Onmyoji. I am Ayame — I held the gate at Anegawa with thirty others while the men decided what "honor" meant. ${karmaGreetExtra(s)} You look like you have seen battle. Talk to me of real things.` },
      ];
    },
    topics: [
      {
        id: 'war', label: 'Talk of war',
        beats: (s) => [
          { who: 'musha_ayame', text: 'War is logistics wearing a drama mask. Spears, rice, roads. The Takeda win because their horses eat before their men do — remember that.' },
          { who: 'musha_ayame', text: 'And if you ever face a so-called "honorable" duel — kick dust in his eyes first. Honor is for the living to debate afterward.' },
        ],
      },
      {
        id: 'evening', label: '💗 Spar at dusk',
        need: (s) => !s.world.flags.aff_ayame,
        beats: (s) => [
          N('You spar till dusk — wooden blades, honest sweat. She wins twice, you win once, and afterward you share water and war stories as the training ground empties.'),
          { who: 'musha_ayame', text: 'You fight like someone who has buried friends. …I like you, onmyoji. Men usually want me to be either a lady or a legend. You just hand me the water gourd. That is rarer than you think.' },
        ],
        effects: [{ flag: ['aff_ayame', 2] }, { exp: 40 }, { memory: ['musha_ayame', 'note', 'Sparred at dusk'] }],
      },
      {
        id: 'night', label: '🌙 The warrior\'s rest 🔞',
        need: (s) => (s.world.flags.aff_ayame || 0) >= 2 && !s.world.flags.lover_ayame,
        beats: (s) => [
          N('Ayame finds you after the evening drill, armor already half off, and states it with a soldier\'s directness: “My quarters. Tonight. No poetry, no bargaining — I want you, and I am tired of wanting quietly.”'),
          H('No poetry. Just us.'),
          N('Her quarters are spare — a futon, a sword stand, a single candle. She unbuckles her armor piece by piece, and beneath it she is all warmth and strength, calloused hands surprisingly gentle as they map your body like familiar terrain.'),
          N('She takes you with a warrior\'s intensity and a woman\'s tenderness at once — fierce, honest, holding nothing back, her breath hot against your neck as she moves above you in the candlelight. After, she keeps her head on your shoulder and her hand on your heart, as if guarding it. “Best rest I have had in years,” she murmurs. “Do not tell the men. They would never let me hear the end of it.”'),
        ],
        effects: [{ flag: ['lover_ayame', true] }, { heal: 50 }, { exp: 60 }, { memory: ['musha_ayame', 'note', 'Lovers — the warrior\'s rest'] }],
      },
      {
        id: 'lover', label: '🌅 Visit Ayame',
        need: (s) => s.world.flags.lover_ayame && s.world.flags.lovday_ayame !== dateKey(s),
        beats: (s) => [
          N('Ayame grins when she sees you — a rare, unguarded thing — and jerks her head toward the barracks.'),
          { who: 'musha_ayame', text: 'You. Me. Evening. …That is the whole invitation. I am a soldier, not a poet.' },
        ],
        choices: [
          {
            label: '🌙 Spend the night together 🔞',
            beats: (s) => [
              N('No poetry, as promised — just the two of you, and Ayame\'s fierce tenderness in the candlelight. She knows your body\'s old wounds and kisses each one like a general honoring fallen ground, until you both surrender gladly to sleep.'),
            ],
            effects: [{ heal: 30 }, { exp: 15 }, { flag: ['lovday_ayame', 'TODAY'] }],
          },
          {
            label: '💗 Just talk till late',
            beats: (s) => [
              N('You oil blades and trade stories. She tells you about Anegawa — the parts that never make the songs.'),
              { who: 'musha_ayame', text: 'You are good to talk to. Do not go getting yourself killed. That is an order.' },
              A('idle'),
            ],
            effects: [{ exp: 10 }, { bond: 2 }, { flag: ['lovday_ayame', 'TODAY'] }],
          },
        ],
      },
    ],
  },

  // ---------------- GIFU ----------------
  innkeep_okiku: {
    name: 'Okiku the Innkeeper', archetype: 'innkeeper', location: 'gifu', adult: true,
    greet(s) {
      return [
        N('A woman in her mid-thirties with a tenugui headcloth looks up from her ledger at the Gifu inn, and her professional smile warms into something genuine.'),
        { who: 'innkeep_okiku', text: `Welcome, traveler. I am Okiku — I keep this inn as my mother did, and her mother before her. ${karmaGreetExtra(s)} Rooms are clean, the bath is hot, and the gossip is free.` },
      ];
    },
    topics: [
      {
        id: 'inn', label: 'Ask about the inn',
        beats: (s) => [
          N('Okiku pours you tea while she talks — it tastes of roast barley and comfort.'),
          { who: 'innkeep_okiku', text: 'An innkeeper learns everything: who is fleeing, who is hunting, who is lying about both. The Oda officers drink here — they tip well and talk loudly. If you ever need to know something… ask Okiku.' },
        ],
        effects: [{ heal: 15 }],
      },
      {
        id: 'evening', label: '💗 Late-night tea',
        need: (s) => !s.world.flags.aff_okiku,
        beats: (s) => [
          N('After the last guest retires, Okiku joins you for tea in the quiet common room. The innkeeper\'s mask slips; beneath it is a woman who has been widowed ten years and has not been truly seen in all of them.'),
          { who: 'innkeep_okiku', text: 'Ten years I have poured tea for other people\'s stories. Tonight, for once, someone asked for mine. …You are kind, onmyoji. Kinder than this road usually allows.' },
        ],
        effects: [{ flag: ['aff_okiku', 2] }, { exp: 25 }, { memory: ['innkeep_okiku', 'note', 'Shared late-night tea'] }],
      },
      {
        id: 'night', label: '🌙 The innkeeper\'s back room 🔞',
        need: (s) => (s.world.flags.aff_okiku || 0) >= 2 && !s.world.flags.lover_okiku,
        beats: (s) => [
          N('Okiku banks the common-room fire, hangs the CLOSED sign, and takes your hand with the quiet certainty of a woman who has made up her mind. “My room is behind the kitchen,” she says softly. “Ten years, I have kept that door locked to everyone but grief. Tonight I am unlocking it for you.”'),
          N('Her room is small and immaculate, smelling of lavender and clean linen. She undresses unhurriedly, without shyness — a woman in her prime, comfortable in her own skin — and draws you down onto the futon with a soft, certain strength.'),
          N('She loves the way she keeps her inn: thoroughly, attentively, missing nothing. Her hands learn you completely — every scar, every sensitive place — and she gives herself with a generosity that leaves you breathless, sighing your name into the pillow so the guests will not hear. After, she holds you close in the lavender dark. “Stay till the kitchen fires are lit,” she whispers. “No one will know but us.”'),
        ],
        effects: [{ flag: ['lover_okiku', true] }, { heal: 50 }, { exp: 60 }, { memory: ['innkeep_okiku', 'note', 'Lovers — the innkeeper\'s back room'] }],
      },
      {
        id: 'lover', label: '🌅 Visit Okiku',
        need: (s) => s.world.flags.lover_okiku && s.world.flags.lovday_okiku !== dateKey(s),
        beats: (s) => [
          N('Okiku\'s eyes brighten when you enter, and she finds an excuse to touch your sleeve as she passes.'),
          { who: 'innkeep_okiku', text: 'The back room is… available. The tea is also available. A woman can offer both, you know.' },
        ],
        choices: [
          {
            label: '🌙 Spend the night together 🔞',
            beats: (s) => [
              N('The CLOSED sign, the banked fire, the lavender-dark room. Okiku\'s lovemaking is unhurried and complete — she takes her time with you the way she does with everything she values, until you fall asleep to the sound of her heartbeat and wake to tea already poured.'),
            ],
            effects: [{ heal: 30 }, { exp: 15 }, { flag: ['lovday_okiku', 'TODAY'] }],
          },
          {
            label: '💗 Just talk till late',
            beats: (s) => [
              N('You talk inn business and life while the candles burn down. She leans against your shoulder, content.'),
              { who: 'innkeep_okiku', text: 'Whatever road you walk, onmyoji — this inn is your home on it. And I… am glad of your company. More than glad.' },
              A('idle'),
            ],
            effects: [{ exp: 10 }, { bond: 2 }, { flag: ['lovday_okiku', 'TODAY'] }],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Princesses of the great houses — adult, romanceable, fully consensual.
  // (Same 18+ policy as the other adult NPCs: 🔞 text only, portraits modest.)
  // ---------------------------------------------------------------------------
  princess_iroha: {
    name: 'Princess Iroha', archetype: 'princess', location: 'azuchi', portrait: 'npc_princess_iroha.png',
    adult: true, desc: 'A 25-year-old daughter of the Oda house, in red and gold — sharp-eyed, sharper-tongued, and utterly fearless.',
    greet(s) {
      return [pick([
        N('Princess Iroha regards you over the rim of her tea cup. "An onmyoji. How... useful you might be. Sit — if you can keep up."'),
        N('Iroha is flying a hawk in the courtyard when you arrive. "Watch," she commands, and the bird stoops like a thunderbolt. She grins. "The Oda take what they want."'),
      ])];
    },
    topics: [
      {
        id: 'court', label: 'Ask about the Oda court', beats: (s) => [
          N('"My uncle builds an empire out of ashigaru and guns," Iroha says. "The old houses sneer — and then they kneel. Remember that, onmyoji: power respects only power."'),
          N('She leans closer. "But even he needs softer weapons. Poetry. Marriage. A well-placed whisper. That is where women like me rule."'),
        ],
      },
      {
        id: 'evening', label: '💗 Spend an evening with Iroha',
        need: (s) => !s.world.flags.aff_iroha,
        beats: (s) => [
          N('You ask the princess for an evening of her time — expecting refusal. Instead she laughs, delighted. "Bold! I like bold. Come — we\'ll drink plum wine, and I\'ll tell you which courtiers are fools."'),
          N('The evening stretches: poetry games, gossip, her hawk asleep on its perch. When you finally rise to leave, Iroha catches your sleeve. "Stay a little longer," she says quietly. "No one commands me — but tonight, I\'m asking."'),
          H('You stay. Nothing happens that the chronicles would record — but something shifts between you all the same.'),
        ],
        effects: [{ flag: ['aff_iroha', true] }, { bond: 2 }, { exp: 20 }, { karma: 1 }],
      },
      {
        id: 'night', label: '🌙 Share a night with Iroha 🔞',
        need: (s) => s.world.flags.aff_iroha && !s.world.flags.lover_iroha,
        beats: (s) => [
          N('Iroha dismisses her attendants with a look that brooks no argument. The shoji slides shut. "The Oda take what they want," she reminds you, untying her obi with deliberate slowness. "Tonight — I want you."'),
          N('"No politics in this room," she whispers, pulling you down beside her. "No war, no courts. Just you and me, onmyoji. Show me what your arts are good for."'),
          H('What follows is fierce and laughing and utterly without restraint — a princess claiming her pleasure the way her house claims provinces: completely. Dawn finds you both wrecked and grinning.'),
          N('"Mine," Iroha declares, tracing a finger down your chest. "You\'re mine now. Come back to me — that\'s a command, not a request."'),
        ],
        effects: [{ flag: ['lover_iroha', true] }, { bond: 3 }, { exp: 40 }, { heal: 20 }, { memory: ['princess_iroha', 'note', 'Lovers — fierce and laughing'] }],
      },
      {
        id: 'lover', label: '🌅 Visit your lover Iroha',
        need: (s) => s.world.flags.lover_iroha && s.world.flags.lovday_iroha !== dateKey(s),
        beats: (s) => [
          N('Iroha\'s face lights up when you slip into her chambers — a smile no courtier ever sees. "There you are," she breathes. "The day was unbearable without you."'),
        ],
        choices: [
          {
            label: '🌙 A passionate night 🔞',
            beats: (s) => [
              H('She meets you halfway, fierce and joyful — a tangle of silk and laughter and heat. Afterwards she sleeps with her head on your chest, a hawk\'s possessive grip on your heart. "Stay till dawn," she mumbles. "The realm can wait."'),
            ],
            effects: [{ flag: ['lovday_iroha', 'TODAY'] }, { bond: 1 }, { exp: 30 }, { heal: 30 }],
          },
          {
            label: '🍶 A quiet evening of wine and talk',
            beats: (s) => [
              N('You drink plum wine and trade verses until late. Iroha beats you at poetry and is insufferable about it — and utterly adorable. "You let me win," she accuses. You didn\'t.'),
            ],
            effects: [{ flag: ['lovday_iroha', 'TODAY'] }, { bond: 1 }, { exp: 15 }],
          },
        ],
      },
    ],
  },

  princess_yu: {
    name: 'Princess Yū', archetype: 'princess', location: 'kofu', portrait: 'npc_princess_yu.png',
    adult: true, desc: 'A 23-year-old daughter of the Takeda, in purple and gold — a horsewoman with her father\'s fire.',
    greet(s) {
      return [pick([
        N('Princess Yū is just dismounting, cheeks flushed from the ride. "You! Onmyoji! Tell me — do the spirits favor the swift or the strong?"'),
        N('Yū is drilling with a wooden sword when you arrive, and nearly takes your head off before recognizing you. "Ha! Good reflexes. Father says a warrior is measured by their scars — and their lovers."'),
      ])];
    },
    topics: [
      {
        id: 'takeda', label: 'Ask about the Takeda', beats: (s) => [
          N('"Swift as the wind, silent as the forest, fierce as fire, immovable as the mountain!" Yū recites, eyes blazing. "That is the Takeda way. My father will unite this land — you\'ll see."'),
          N('Her fire dims a fraction. "...though the Oda guns... no. Never mind. The Takeda do not doubt. We ride."'),
        ],
      },
      {
        id: 'evening', label: '💗 Spend an evening with Yū',
        need: (s) => !s.world.flags.aff_yu,
        beats: (s) => [
          N('"Race me," Yū demands, already mounting. "If you keep up, I\'ll share my supper and my stories. If not — you groom my horse."'),
          N('You keep up — barely. Over supper she talks of campaigns and cavalry charges with shining eyes, then goes quiet. "...it\'s nice," she admits, "talking to someone who doesn\'t want anything from the Takeda. Just... me."'),
          H('You walk her back under a spray of stars. At her door she squeezes your hand hard. "Tomorrow," she says, "we ride again. Don\'t be late."'),
        ],
        effects: [{ flag: ['aff_yu', true] }, { bond: 2 }, { exp: 20 }, { karma: 1 }],
      },
      {
        id: 'night', label: '🌙 Share a night with Yū 🔞',
        need: (s) => s.world.flags.aff_yu && !s.world.flags.lover_yu,
        beats: (s) => [
          N('Yū meets you at the stables at dusk, alone, her hair still damp from the bath. "No servants tonight," she says, taking your hand. "Just us. I\'ve been thinking about this all day — don\'t make me wait any longer."'),
          N('In the hayloft above the sleeping horses she is all fierce grace — strong, eager, laughing breathlessly as she pulls you down into the straw. "Like a cavalry charge," she gasps. "No retreat!"'),
          H('She loves the way she rides: all-in, fearless, laughing. Afterwards you lie tangled in the straw while the horses shift below, and she traces old scars on your arms with reverent fingers. "Warriors," she whispers. "Both of us."'),
        ],
        effects: [{ flag: ['lover_yu', true] }, { bond: 3 }, { exp: 40 }, { heal: 20 }, { memory: ['princess_yu', 'note', 'Lovers — fierce as fire'] }],
      },
      {
        id: 'lover', label: '🌅 Visit your lover Yū',
        need: (s) => s.world.flags.lover_yu && s.world.flags.lovday_yu !== dateKey(s),
        beats: (s) => [
          N('Yū spots you across the courtyard and her whole face transforms — the warrior melts into a young woman in love. She runs to you, uncaring who sees.'),
        ],
        choices: [
          {
            label: '🌙 A passionate night 🔞',
            beats: (s) => [
              H('The hayloft again — or her chambers when the castle sleeps. Either way she is fire and laughter, demanding and generous in equal measure, until you both collapse, spent and grinning, into each other\'s arms.'),
            ],
            effects: [{ flag: ['lovday_yu', 'TODAY'] }, { bond: 1 }, { exp: 30 }, { heal: 30 }],
          },
          {
            label: '🐎 A moonlit ride together',
            beats: (s) => [
              N('You ride out under the moon, just the two of you, hooves muffled on the grass. She talks about everything and nothing, and the world feels very far away.'),
            ],
            effects: [{ flag: ['lovday_yu', 'TODAY'] }, { bond: 1 }, { exp: 15 }],
          },
        ],
      },
    ],
  },

  princess_setsu: {
    name: 'Princess Setsu', archetype: 'princess', location: 'kasugayama', portrait: 'npc_princess_setsu.png',
    sceneCg: 'cg_garden_moon.png',
    adult: true, desc: 'A 26-year-old daughter of the Uesugi, in white and blue — serene as temple snow, with hidden depths.',
    greet(s) {
      return [pick([
        N('Princess Setsu is arranging flowers when you enter, and does not look up until the last stem is perfect. "Forgive me," she says softly. "Beauty deserves patience. ...You may sit."'),
        N('You find Setsu at the shrine, praying before the image of Bishamonten. She finishes, bows, and turns to you with a smile like moonrise. "The god of war watches over our house. Perhaps he watches over you too, onmyoji."'),
      ])];
    },
    topics: [
      {
        id: 'uesugi', label: 'Ask about the Uesugi', beats: (s) => [
          N('"My father is the avatar of Bishamonten," Setsu says — not boastfully, but as one stating the weather. "He fights not for land but for righteousness. The realm calls him the Dragon of Echigo."'),
          N('A shadow crosses her serenity. "Righteousness is a heavy armor to wear. Sometimes I wish... no. Forgive me. A princess does not wish aloud."'),
        ],
      },
      {
        id: 'evening', label: '💗 Spend an evening with Setsu',
        need: (s) => !s.world.flags.aff_setsu,
        beats: (s) => [
          N('You find Setsu alone in the moon-viewing garden, and she does not send you away. You sit in companionable silence a long while, watching the moon on the pond. "No one is ever just... quiet with me," she says at last. "Thank you."'),
          N('She talks then — of duty, of the weight of a famous name, of poems she writes and burns. When the moon is high she takes your hand, almost shyly. "I\'m glad the god of war sent you to Echigo. Even if he didn\'t — I\'m glad."'),
          H('You walk her back in silence that feels like music. At her door she bows — formal, perfect — but her fingers linger on yours a heartbeat too long.'),
        ],
        effects: [{ flag: ['aff_setsu', true] }, { bond: 2 }, { exp: 20 }, { karma: 1 }],
      },
      {
        id: 'night', label: '🌙 Share a night with Setsu 🔞',
        need: (s) => s.world.flags.aff_setsu && !s.world.flags.lover_setsu,
        beats: (s) => [
          N('Setsu comes to the garden at midnight, as arranged — no attendants, her hair unbound for the first time you\'ve seen it. "I prayed about this," she confesses, breathless. "Bishamonten did not object. ...Or if he did, I have decided not to listen."'),
          N('On the veranda above the moonlit pond she unfolds like one of her flowers — slowly, then all at once, trembling and radiant. "Gently," she whispers. "I\'ve never— gently, please, and don\'t stop holding me."'),
          H('You are gentle. And then, as her trust blooms into wonder and wonder into abandon, you are everything she needs. Afterwards she weeps a little — happy tears, she insists — and clings to you under the indifferent moon. "I\'m not sorry," she whispers fiercely. "I\'m not sorry at all."'),
        ],
        effects: [{ flag: ['lover_setsu', true] }, { bond: 3 }, { exp: 40 }, { heal: 20 }, { memory: ['princess_setsu', 'note', 'Lovers — moonlit and tender'] }],
      },
      {
        id: 'lover', label: '🌅 Visit your lover Setsu',
        need: (s) => s.world.flags.lover_setsu && s.world.flags.lovday_setsu !== dateKey(s),
        beats: (s) => [
          N('Setsu\'s composure cracks the moment she sees you — the serene princess becomes, for one unguarded instant, simply a young woman in love. She recovers, bows, and murmurs: "Walk with me?"'),
        ],
        choices: [
          {
            label: '🌙 A tender night 🔞',
            beats: (s) => [
              H('The moon-viewing veranda, the pond silver below. She comes to you trustingly now, and what follows is tender and unhurried and deep — two people who have learned exactly how to cherish each other. She falls asleep in your arms, smiling.'),
            ],
            effects: [{ flag: ['lovday_setsu', 'TODAY'] }, { bond: 1 }, { exp: 30 }, { heal: 30 }],
          },
          {
            label: '🌸 Arrange flowers together',
            beats: (s) => [
              N('You help her arrange flowers — badly. She laughs, a sound like temple bells, and guides your hands. "Patience," she teases. "Beauty deserves it. So do you."'),
            ],
            effects: [{ flag: ['lovday_setsu', 'TODAY'] }, { bond: 1 }, { exp: 15 }],
          },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Interactive H-scenes (Dragon Knight 4 flavor) for adult NPCs only.
// Tasteful CG art + clickable hotspots; the explicit content lives in the
// text. Aiko and all minors/ambiguous-age characters are excluded.
//
// NOTE: romance flags use a canonical SHORT key (e.g. 'iroha' from
// 'princess_iroha', 'hanae' from 'widow_hanae') — never the full npc id.
export function loverKeyFor(npcId) {
  return String(npcId).split('_').slice(1).join('_') || npcId;
}
for (const [id, npc] of Object.entries(NPCS)) {
  if (!npc.adult) continue;
  const key = loverKeyFor(id);
  npc.topics.push({
    id: 'hscene',
    label: '🌙 Interactive night together 🔞',
    need: (s) => !!s.world.flags['lover_' + key] && s.world.flags['lovday_' + key] !== dateKey(s),
    beats: () => [],
    effects: [{ scene: ['night_together', id] }],
  });
}

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
