// actions.js — the action-template system.
//
// The game renders characters as cute pixel sprites. Actions (talking,
// shaking hands, kissing, fighting, intimacy) are conveyed by SPRITE POSES
// plus short text lines — never by detailed art. This module is pure data +
// choreography: an ES module with no dependencies and no DOM access.
//
// Conventions:
// - `npc` arguments are NPC records as produced by npcsAt() in dialogue.js,
//   i.e. `{ id, name, adult, ... }`. The short romance key is derived from
//   the id the same way loverKeyFor() does ('princess_iroha' -> 'iroha').
// - dx/dy are pixel offsets from a character's base tile position.
//   Positive dxSelf moves the player toward the NPC and vice versa.
// - 'TODAY' in consequence flags is the magic date-key token resolved by
//   applyEffects() in main.js.
// - POLICY: intimate/sexual content is generated ONLY for explicitly adult
//   female NPCs (npc.adult === true). Aiko, minors, and ambiguous-age
//   characters are excluded; allowed() enforces this. Intimacy text is
//   sensual but never pornographic: no explicit anatomical terms, focus on
//   romance, passion, and emotion.

// ---------------------------------------------------------------------------
// Poses the sprite renderer supports.
// ---------------------------------------------------------------------------
export const POSES = [
  'stand', 'walk', 'talk', 'attack', 'hurt',
  'kiss', 'embrace', 'lie', 'sit', 'kneel', 'fly',
];

// ---------------------------------------------------------------------------
// Small helpers (local copies — this module has no dependencies).
// ---------------------------------------------------------------------------
export function npcKeyFromId(npcId) {
  const parts = String(npcId || '').split('_').slice(1);
  const key = parts.join('_');
  return key || String(npcId || '');
}

export function npcKey(npc) {
  return npcKeyFromId(npc.id || npc.npcId || '');
}

export function isAiko(npc) {
  return npc.id === 'aiko' || npc.isAiko === true || /^aiko$/i.test(npc.name || '');
}

function prettifyId(id) {
  const key = npcKeyFromId(id);
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Traveler';
}

export function npcDisplayName(npc) {
  if (npc.name) return npc.name;
  return prettifyId(npc.id || npc.npcId || '');
}

function playerName(S) {
  return (S.player && S.player.name) || 'Onmyoji';
}

function fillPlaceholders(text, ctx) {
  return String(text)
    .replace(/\{m\}/g, ctx.m)
    .replace(/\{f2\}/g, ctx.f2)
    .replace(/\{f\}/g, ctx.f);
}

// ---------------------------------------------------------------------------
// Quick actions (preset buttons).
// allowed(npc, S) -> true | false | string reason.
// ---------------------------------------------------------------------------
export const QUICK_ACTIONS = [
  {
    id: 'talk', label: '💬 Talk', icon: '💬',
    allowed: () => true,
  },
  {
    id: 'shake', label: '🤝 Shake hands', icon: '🤝',
    allowed: (npc) => {
      if (isAiko(npc)) return true;
      if (npc.hostile) return 'They refuse your hand — too hostile right now.';
      return true;
    },
  },
  {
    id: 'kiss', label: '💋 Kiss', icon: '💋',
    allowed: (npc, S) => {
      if (!npc.adult) return 'A kiss would be inappropriate here.';
      const key = npcKey(npc);
      const f = S.world.flags;
      if (f['lover_' + key] || f['aff_' + key]) return true;
      return 'You are not close enough for that yet.';
    },
  },
  {
    id: 'fight', label: '⚔️ Fight', icon: '⚔️',
    allowed: (npc) => {
      if (isAiko(npc)) return 'You would never raise a blade against Aiko.';
      if (npc.noFight) return 'There is nothing to gain by fighting them.';
      return true;
    },
  },
  {
    id: 'give', label: '🎁 Give gift', icon: '🎁',
    allowed: (npc, S) => {
      const inv = (S.player && S.player.inventory) || [];
      if (!inv.length) return 'You carry nothing worth giving.';
      return true;
    },
  },
  {
    id: 'bow', label: '🙇 Bow', icon: '🙇',
    allowed: () => true,
  },
  {
    id: 'sex', label: '🔞 Be intimate', icon: '🔞',
    allowed: (npc, S) => {
      if (!npc.adult) return 'Not appropriate — strictly adults only.';
      const key = npcKey(npc);
      const f = S.world.flags;
      if (!(f['lover_' + key] || f['aff_' + key])) return 'You share no such intimacy yet.';
      return true;
    },
  },
];

export function quickActionById(id) {
  return QUICK_ACTIONS.find(a => a.id === id) || null;
}

// ---------------------------------------------------------------------------
// actSequence(actionId, npc, S) -> beats describing 3-6 beats of sprite
// choreography. Pure: does not mutate S. Beat shape:
// { poseSelf, poseNpc, dxSelf, dySelf, dxNpc, dyNpc, text, sfx? }
// ---------------------------------------------------------------------------
export function actSequence(actionId, npc, S) {
  const you = playerName(S);
  const n = npcDisplayName(npc);
  const B = (poseSelf, poseNpc, dxSelf, dySelf, dxNpc, dyNpc, text, sfx) => {
    const b = { poseSelf, poseNpc, dxSelf, dySelf, dxNpc, dyNpc, text };
    if (sfx) b.sfx = sfx;
    return b;
  };

  switch (actionId) {
    case 'talk': return [
      B('walk', 'stand', 36, 0, 0, 0, `${you} walk${you.endsWith('s') ? '' : 's'} up to ${n}.`),
      B('talk', 'talk', 44, 0, 0, 0, `The two of you trade words — mouths moving, heads nodding, the easy rhythm of conversation.`, '💬'),
      B('talk', 'talk', 44, 0, 0, 0, `${n} says something that makes ${you} laugh despite yourself.`),
      B('stand', 'stand', 20, 0, 0, 0, `You part with a nod, the talk lingering pleasantly in the air.`),
    ];
    case 'shake': return [
      B('walk', 'stand', 36, 0, 0, 0, `${you} step${you.endsWith('s') ? '' : 's'} forward, hand extended.`),
      B('embrace', 'embrace', 48, 0, -6, 0, `Your hands meet — a firm, warm shake, held a heartbeat longer than custom demands.`, '🤝'),
      B('talk', 'talk', 44, 0, 0, 0, `${n} smiles. An understanding passes between you that needs no words.`),
      B('stand', 'stand', 12, 0, 0, 0, `You step back, the handshake's warmth still in your palm.`),
    ];
    case 'kiss': return [
      B('walk', 'stand', 40, 0, 0, 0, `${you} draw${you.endsWith('s') ? '' : 's'} close to ${n}, close enough to feel her breath.`),
      B('kiss', 'kiss', 52, 0, -4, 0, `Your lips meet — soft, unhurried, the world narrowing to that single point of warmth.`, '💋'),
      B('embrace', 'embrace', 52, 0, -4, 0, `Little hearts seem to drift up around you both. Neither of you pulls away first.`, '❤️'),
      B('stand', 'stand', 16, 0, 0, 0, `You part slowly, cheeks warm, something unspoken now spoken.`),
    ];
    case 'fight': {
      const pAtk = (S.player && S.player.atk) || 10;
      const nPow = npc.power || 8;
      const win = pAtk >= nPow;
      return [
        B('walk', 'walk', 24, 0, -24, 0, `${you} and ${n} circle each other, weapons half-raised, eyes locked.`, '⚔️'),
        B('attack', 'hurt', 48, 0, -4, 0, `${you} strike${you.endsWith('s') ? '' : 's'} first — a flash of steel and spirit! ${n} staggers.`, '💥'),
        B('hurt', 'attack', 8, 0, -48, 0, `${n} answers with a fierce counter. Pain blooms white behind your eyes.`),
        win
          ? B('stand', 'lie', 32, 0, 0, 0, `${n} goes down, breathing hard, and raises a hand in surrender. You lower your blade — victory, clean and undisputed.`, '🏆')
          : B('hurt', 'stand', 8, 0, -32, 0, `The last exchange goes against you. You yield with grace before worse happens — ${n} stands victorious, but respectful.`),
        B('stand', 'stand', 0, 0, 0, 0,
          win ? `Honor is satisfied. ${n} will remember this bout.` : `You live to fight another day — and ${n} nods to you, warrior to warrior.`,
          win ? undefined : '🩹'),
      ].map((b, i, arr) => (i === arr.length - 2 ? { ...b, outcome: win ? 'win' : 'lose' } : b));
    }
    case 'bow': return [
      B('stand', 'stand', 24, 0, 0, 0, `${you} face${you.endsWith('s') ? '' : 's'} ${n} and compose yourself.`),
      B('kneel', 'stand', 24, 0, 0, 0, `You sink into a deep, formal bow — forehead nearly to the floorboards, every line of your body speaking respect.`, '🙇'),
      B('stand', 'talk', 24, 0, 0, 0, `${n} returns the courtesy with visible pleasure. Protocol observed; regard earned.`),
    ];
    case 'give': {
      const inv = (S.player && S.player.inventory) || [];
      const gift = inv[0] ? prettifyId(inv[0].id) : 'a small gift';
      return [
        B('walk', 'stand', 36, 0, 0, 0, `${you} approach${you.endsWith('s') ? '' : 'es'} ${n}, something held carefully behind your back.`),
        B('talk', 'talk', 44, 0, 0, 0, `You present it with both hands: ${gift}. A small thing, but chosen with care.`, '🎁'),
        B('talk', 'talk', 44, 0, 0, 0, `${n}'s face lights up. She accepts it as if it were treasure, and perhaps to her it is.`),
        B('stand', 'stand', 16, 0, 0, 0, `The gift is given; the goodwill it bought will outlast the object itself.`),
      ];
    }
    case 'sex':
      // Lead-in only — the full scene runs through sexSequence().
      return [
        B('walk', 'stand', 40, 0, 0, 0, `${you} draw${you.endsWith('s') ? '' : 's'} close to ${n}. The air between you changes — charged, tender, inevitable.`),
        B('embrace', 'embrace', 52, 0, -4, 0, `She comes willingly into your arms. Heartbeats find each other's rhythm.`, '❤️'),
        B('embrace', 'embrace', 52, 0, -4, 0, `What follows belongs to the night — continue in the intimate scene.`),
      ];
    default:
      return [
        B('stand', 'stand', 0, 0, 0, 0, `${you} regard${you.endsWith('s') ? '' : 's'} ${n} for a moment, then carry on.`),
      ];
  }
}

// ---------------------------------------------------------------------------
// consentFor(S, npcId, forced=false) -> 'eager' | 'willing' | 'unsure' | 'forced'
// 'forced' is never decided here — it is only returned when the player has
// explicitly chosen force (passed in).
// ---------------------------------------------------------------------------
export function consentFor(S, npcId, forced = false) {
  if (forced) return 'forced';
  const key = npcKeyFromId(npcId);
  const f = S.world.flags;
  if (f['lover_' + key]) return 'eager';
  if (f['aff_' + key]) return 'willing';
  return 'unsure';
}

// ---------------------------------------------------------------------------
// SEX_TEMPLATES — 18+ action templates. TEXT-BASED intimacy: sensual and
// romantic, never pornographic. No explicit anatomical terms anywhere.
// Placeholders: {m} = the man (player, unless witnessing), {f} = the woman,
// {f2} = second woman (ffm template). Each template: 4 stages
// (begin, middle, climax, afterglow), 2-4 lines per stage.
// ---------------------------------------------------------------------------
export const SEX_TEMPLATES = [
  {
    id: 'tender', name: 'Tender Union', participants: '1m1f',
    desc: 'Slow, loving, face to face — a union of hearts first, bodies second.',
    stages: [
      {
        id: 'begin', pose: 'embrace', arrangement: 'face',
        lines: [
          `{m} gathers {f} close as the lamp burns low, and for a long moment they simply hold each other, breathing in time.`,
          `"Stay with me tonight," {f} whispers against his shoulder. "Not as a warrior. Just as a man."`,
          `Their kisses begin gently — reverent, unhurried — as hands learn the familiar landscape of each other's shoulders and back.`,
        ],
        aftercare: [`{m} brushes a strand of hair from {f}'s face, memorizing her like this.`],
        forced: {
          lines: [
            `{f} trembles in {m}'s arms, her eyes bright with unshed tears. "Please," she breathes, "be gentle with me."`,
            `{m} holds her carefully, hating the fear he sees — and hating himself more for causing it.`,
          ],
          aftercare: [`{f} turns her face away, small and silent, and {m} cannot meet his own eyes in the dark.`],
        },
      },
      {
        id: 'middle', pose: 'lie', arrangement: 'face',
        lines: [
          `Side by side on the futon, they move together in a slow rhythm, foreheads touching, whispers passing lip to lip.`,
          `{f} sighs {m}'s name like a prayer, her fingers tracing idle patterns across his back as the world narrows to warmth.`,
          `"Look at me," {m} murmurs, and what passes between their eyes needs no words at all.`,
        ],
        aftercare: [`{m} kisses {f}'s brow, slow and deliberate, as if sealing a vow.`],
      },
      {
        id: 'climax', pose: 'lie', arrangement: 'face',
        lines: [
          `The slow rhythm deepens, quickens — {f} clings to {m}, her breath coming in soft gasps against his neck.`,
          `Wave after wave of feeling crests over them both until {f} cries out softly and holds him as if she would never let go.`,
          `For one suspended moment there is nothing in the world but the two of them, joined and complete.`,
        ],
        aftercare: [`They lie tangled together, laughing breathlessly at nothing and everything.`],
      },
      {
        id: 'afterglow', pose: 'lie', arrangement: 'side',
        lines: [
          `Afterward they lie curled together beneath the quilt, {f}'s head on {m}'s chest, listening to his heartbeat slow.`,
          `"That was..." {f} begins, then shakes her head, smiling. "There are no words. Stay until morning."`,
          `{m} strokes her hair until her breathing deepens into sleep, and watches over her dreams like a guardian.`,
        ],
        aftercare: [`At dawn {m} wakes first and simply watches her sleep, grateful beyond measure.`],
      },
    ],
  },
  {
    id: 'passion', name: 'Wild Passion', participants: '1m1f',
    desc: 'Fierce and unrestrained — desire that refuses to be tamed.',
    stages: [
      {
        id: 'begin', pose: 'embrace', arrangement: 'behind',
        lines: [
          `{m} catches {f} from behind and spins her into his arms; she laughs — wild, delighted — and pulls him down with her.`,
          `There is nothing gentle in their kisses now: teeth, breath, urgency, her hands fisted in his collar.`,
          `"Don't you dare be careful with me," {f} growls against his mouth, and {m} obeys with a grin.`,
        ],
        aftercare: [`{m} nips playfully at her shoulder; she shivers and demands more.`],
        forced: {
          lines: [
            `{f} struggles weakly, then goes still with a frightened whimper. "Please don't hurt me," she whispers.`,
            `Something cold settles in {m}'s chest at the sound — this is not desire he holds, only fear.`,
          ],
          aftercare: [`{f} curls away from him, shaking, and the room feels colder than winter.`],
        },
      },
      {
        id: 'middle', pose: 'kneel', arrangement: 'behind',
        lines: [
          `They come together like a summer storm — fierce, laughing, utterly without restraint, the futon a delightful wreck beneath them.`,
          `{f} arches against him with a gasp that turns into a laugh that turns into his name, cried out loud.`,
          `Sweat, tangled hair, racing hearts — neither would trade this beautiful chaos for all the gold in Sakai.`,
        ],
        aftercare: [`{m} traces the curve of her spine with one fingertip; she purrs like a cat.`],
      },
      {
        id: 'climax', pose: 'kneel', arrangement: 'behind',
        lines: [
          `Faster, fiercer — {f}'s nails dig into his arms as pleasure crests over her in a great rushing wave.`,
          `{m} follows her over the edge with a groan, holding her tight as they shudder together.`,
          `They collapse in a heap, laughing breathlessly, hearts hammering against each other.`,
        ],
        aftercare: [`"Again," {f} pants, grinning. "Later. Give me a moment to remember my own name."`],
      },
      {
        id: 'afterglow', pose: 'lie', arrangement: 'side',
        lines: [
          `Spent and glowing, they lie sprawled across the ruined bedding, {f}'s head pillowed on {m}'s arm.`,
          `"You fight like you love," {f} murmurs drowsily. "Completely. It's terrifying. Don't ever change."`,
          `{m} chuckles and pulls the quilt over them both as the candles gutter low.`,
        ],
        aftercare: [`They fall asleep mid-laugh, tangled together like puppies.`],
      },
    ],
  },
  {
    id: 'ride', name: 'Her Rhythm', participants: '1m1f',
    desc: 'She takes the lead, setting the pace — he surrenders gladly.',
    stages: [
      {
        id: 'begin', pose: 'sit', arrangement: 'face',
        lines: [
          `{f} pushes {m} gently back against the cushions and straddles his lap, eyes gleaming with mischief and intent.`,
          `"My turn to lead," she declares, silencing his protest with a long, slow kiss. "Just... feel."`,
          `{m} surrenders with a happy sigh, hands settling at her waist as she finds her rhythm.`,
        ],
        aftercare: [`{m} gazes up at her, utterly captivated. "You are magnificent like this."`],
        forced: {
          lines: [
            `{f} sits frozen, tears sliding silently down her cheeks. "I don't want this," she whispers. "Please."`,
            `{m}'s hands fall away from her waist as shame floods through him like ice water.`,
          ],
          aftercare: [`She slides off the cushions and wraps her arms around herself, small and shaking.`],
        },
      },
      {
        id: 'middle', pose: 'sit', arrangement: 'face',
        lines: [
          `She moves above him like a dancer, slow then quickening, her hair falling forward to curtain them both in privacy.`,
          `{m} watches her face — the wonder in it, the abandon — and thinks he has never seen anything so beautiful.`,
          `Their breath mingles; her soft cries grow bolder as she chases her own pleasure without apology.`,
        ],
        aftercare: [`{m} catches her hands and kisses each palm. "Take all the time you need."`],
      },
      {
        id: 'climax', pose: 'sit', arrangement: 'face',
        lines: [
          `With a cry of triumph {f} arches back, pleasure washing through her in bright cascading waves.`,
          `{m} holds her steady through it, then follows, groaning her name into the curve of her neck.`,
          `She collapses forward onto his chest, both of them shaking with laughter and release.`,
        ],
        aftercare: [`"I," {f} announces grandly, "am a genius." {m} cannot argue.`],
      },
      {
        id: 'afterglow', pose: 'lie', arrangement: 'face',
        lines: [
          `They lie facing each other, {f} still half-draped over him, too content to move.`,
          `"Thank you," she murmurs, "for letting me... be myself. Fierce and all."`,
          `"Thank you," {m} answers, "for trusting me with her."`,
        ],
        aftercare: [`They doze like that until the temple bell calls the hour.`],
      },
    ],
  },
  {
    id: 'standing', name: 'Against the Wall', participants: '1m1f',
    desc: 'Pressed against the wall in a stolen moment — urgent and breathless.',
    stages: [
      {
        id: 'begin', pose: 'stand', arrangement: 'face',
        lines: [
          `In the shadowed corridor {m} backs {f} gently against the wall; she goes willingly, already breathless.`,
          `"Someone might see," she whispers, even as her arms wind around his neck. "Let them," he answers.`,
          `Their kisses are hungry, hurried — the thrill of the stolen moment sharpening every touch.`,
        ],
        aftercare: [`{m} presses his forehead to hers, both of them listening for footsteps, grinning.`],
        forced: {
          lines: [
            `{f} flattens herself against the wall, shaking her head, tears in her eyes. "Not here. Not like this. Please."`,
            `{m} sees his own reflection in her frightened gaze and steps back as if burned.`,
          ],
          aftercare: [`She sinks down the wall and covers her face; the corridor suddenly feels very cold.`],
        },
      },
      {
        id: 'middle', pose: 'stand', arrangement: 'face',
        lines: [
          `Pinned sweetly between the wall and his body, {f} clings to him, her soft gasps muffled against his shoulder.`,
          `Every brush of his lips along her throat draws a shiver; every shift of weight draws a sigh.`,
          `The danger of discovery only feeds the fire — they are drunk on secrecy and each other.`,
        ],
        aftercare: [`{m} steadies her as her knees wobble; she laughs silently into his sleeve.`],
      },
      {
        id: 'climax', pose: 'stand', arrangement: 'face',
        lines: [
          `Urgency crests — {f} bites her lip to stifle a cry, nails pressing crescents into his shoulders.`,
          `{m} holds her through the shuddering wave, his own release following like thunder after lightning.`,
          `They cling together, breathing hard, the wall the only thing holding them both upright.`,
        ],
        aftercare: [`"We are terrible," {f} giggles. "Wonderfully terrible."`],
      },
      {
        id: 'afterglow', pose: 'stand', arrangement: 'side',
        lines: [
          `They straighten each other's clothes with shaking hands, grinning like guilty children.`,
          `"If the neighbors talk," {f} says, smoothing her hair, "let them talk of love."`,
          `They slip back into the evening separately — but their eyes keep finding each other across the room.`,
        ],
        aftercare: [`All evening, {f} wears a secret smile that {m} put there.`],
      },
    ],
  },
  {
    id: 'spoon', name: 'Spooning at Dawn', participants: '1m1f',
    desc: 'Curled together in the grey morning light — quiet, tender, unhurried.',
    stages: [
      {
        id: 'begin', pose: 'lie', arrangement: 'behind',
        lines: [
          `Dawn greys the shutters. {m} curls around {f} from behind, fitting himself to her like a second shadow.`,
          `She sighs contentedly and laces her fingers through his where his arm wraps her waist. "Don't move," she murmurs. "Perfect."`,
          `They lie in warm stillness, her hair tickling his nose, his breath stirring it gently.`,
        ],
        aftercare: [`{m} presses a sleepy kiss to the nape of her neck; she hums approval.`],
        forced: {
          lines: [
            `{f} lies rigid in the circle of his arms, staring at the grey shutters, tears wet on the pillow.`,
            `"I'm sorry," {m} whispers, and means it — but sorry cannot unmake fear.`,
          ],
          aftercare: [`She does not answer. The dawn feels very far away.`],
        },
      },
      {
        id: 'middle', pose: 'lie', arrangement: 'behind',
        lines: [
          `Slowly, drowsily, stillness kindles into warmth — lazy kisses to her shoulder, her temple, the shell of her ear.`,
          `{f} arches back against him with a soft sound of pleasure, fully awake now and gloriously willing.`,
          `There is no hurry in the world; morning can wait. They move together like water, gentle and deep.`,
        ],
        aftercare: [`{m} holds her a little tighter, as if morning might steal her.`],
      },
      {
        id: 'climax', pose: 'lie', arrangement: 'behind',
        lines: [
          `Pleasure rises like the sun — slow, golden, inevitable — until {f} gasps and trembles in his arms.`,
          `{m} follows her into the light, holding her close through every shuddering wave.`,
          `They lie still afterward, breathing as one, the dawn painting them gold.`,
        ],
        aftercare: [`"Good morning," {f} whispers, glowing. "The very best kind."`],
      },
      {
        id: 'afterglow', pose: 'lie', arrangement: 'side',
        lines: [
          `They doze and wake and doze again, reluctant to surrender the warm cocoon of the futon.`,
          `{f} traces the lines of his palm with one fingertip. "I read fortunes here," she teases. "It says: stay."`,
          `{m} closes his hand around hers. "The fortune is accurate."`,
        ],
        aftercare: [`They finally rise at noon, unrepentant, and share cold rice like a feast.`],
      },
    ],
  },
  {
    id: 'lap', name: 'On His Lap', participants: '1m1f',
    desc: 'Curled in his lap by the fire — intimate, playful, close.',
    stages: [
      {
        id: 'begin', pose: 'sit', arrangement: 'face',
        lines: [
          `By the crackling hearth {f} settles sideways into {m}'s lap as if she belongs there — and perhaps she does.`,
          `He wraps his arms around her; she tucks her head beneath his chin with a happy sigh. "This is my favorite place in the world."`,
          `Firelight dances over them as their kisses grow slower, deeper, warmer than the flames.`,
        ],
        aftercare: [`{m} rests his cheek against her hair, breathing in woodsmoke and her.`],
        forced: {
          lines: [
            `{f} perches stiffly on the edge of his lap, arms crossed tight, eyes fixed on the fire. "Don't," she says quietly.`,
            `The hearth crackles on, indifferent. {m} lets his arms fall to his sides.`,
          ],
          aftercare: [`She slides off his lap and sits apart, hugging her knees, silent.`],
        },
      },
      {
        id: 'middle', pose: 'sit', arrangement: 'face',
        lines: [
          `She turns in his arms to face him, knees bracketing his hips, and kisses him with growing boldness.`,
          `{m}'s hands roam her back, relearning every curve as if for the first time, as if for the hundredth.`,
          `Her soft laughter vibrates against his lips; the fire pops; nobody in the world exists but them.`,
        ],
        aftercare: [`{f} boops his nose with hers. "You look dazed." "I am dazed. Happily."`],
      },
      {
        id: 'climax', pose: 'sit', arrangement: 'face',
        lines: [
          `Rocking gently together, pleasure builds in warm rolling waves until {f} cries out against his mouth.`,
          `{m} holds her through it, groaning softly, the firelight blurring at the edges of his vision.`,
          `They cling together, trembling, as the waves slowly, sweetly recede.`,
        ],
        aftercare: [`{f} hides her burning face in his neck. "The fire saw everything." "The fire approves."`],
      },
      {
        id: 'afterglow', pose: 'sit', arrangement: 'side',
        lines: [
          `Afterward she curls back into the crook of his arm, drowsy and boneless, watching embers.`,
          `"Tell me a story," she murmurs. So {m} tells her one — about a fox spirit and an onmyoji, and it ends happily.`,
          `She is asleep before the ending, smiling. He carries her to the futon like something precious.`,
        ],
        aftercare: [`{m} banks the fire and lies down beside her, her story still unfinished on his lips.`],
      },
    ],
  },
  {
    id: 'festival', name: 'Festival Night', participants: '1m1f',
    desc: 'Beneath the festival lanterns — stolen kisses between the drumbeats.',
    stages: [
      {
        id: 'begin', pose: 'stand', arrangement: 'side',
        lines: [
          `The matsuri roars around them — drums, lanterns, laughter — but {m} and {f} have eyes only for each other.`,
          `He buys her a paper lantern; she ties a wish to it. Neither will say what they wished for. Both know.`,
          `In a quiet gap between stalls, he steals a kiss that tastes of festival sweets and summer.`,
        ],
        aftercare: [`{f} adjusts his crooked headband, fingers lingering. "There. Handsome."`],
        forced: {
          lines: [
            `Amid the festival's joy {f} walks beside {m} like a ghost, flinching at every drumbeat, eyes downcast.`,
            `"Smile," someone calls cheerfully — and her attempt at one nearly breaks {m}'s heart.`,
          ],
          aftercare: [`She lets the paper lantern slip from her fingers; it drifts away, wish and all.`],
        },
      },
      {
        id: 'middle', pose: 'kneel', arrangement: 'face',
        lines: [
          `They slip away to the dark shrine steps behind the stalls, the music muffled to a heartbeat.`,
          `Kneeling face to face on the cool stone, they kiss like the night is ending — urgent, laughing, breathless.`,
          `{f}'s festival hairpin comes loose; {m} catches it and tucks it into his sleeve. "For luck," he says.`,
        ],
        aftercare: [`Above them, the first fireworks bloom gold and green; neither looks up.`],
      },
      {
        id: 'climax', pose: 'kneel', arrangement: 'face',
        lines: [
          `As the grand fireworks erupt overhead, their own private celebration crests — {f} gasping his name into his shoulder.`,
          `{m} holds her tight through the shuddering joy, the sky raining light around them.`,
          `For one perfect moment, heaven and earth celebrate together, and they are the center of it.`,
        ],
        aftercare: [`"Best festival ever," {f} declares solemnly. {m} concurs with great dignity.`],
      },
      {
        id: 'afterglow', pose: 'sit', arrangement: 'side',
        lines: [
          `They rejoin the festival hand in hand, hair slightly mussed, grinning like conspirators.`,
          `They share grilled squid and amazake, feeding each other, drawing fond looks from old couples.`,
          `When the lanterns are released to the river, they watch theirs drift away together — one wish, two hearts.`,
        ],
        aftercare: [`{f} keeps the spare hairpin {m} bought her. She still wears it, years later.`],
      },
    ],
  },
  {
    id: 'threesome-mmf', name: 'Two Suitors', participants: '2m1f',
    desc: 'She is adored by two men at once — worshipped, cherished, overwhelmed.',
    stages: [
      {
        id: 'begin', pose: 'embrace', arrangement: 'face',
        lines: [
          `{f} stands between {m} and his sworn brother, flushed and laughing, utterly the center of their world.`,
          `Two pairs of hands, two heartbeats — she is kissed, caressed, and utterly cherished from both sides at once.`,
          `"I must have done something wonderful," {f} breathes, "to deserve two such men."`,
        ],
        aftercare: [`{m} and his brother exchange a look of perfect understanding over her head.`],
        forced: {
          lines: [
            `{f} stands trapped between two men, pale and shaking, her laughter gone. "Please," she whispers, "let me go."`,
            `The room's warmth curdles. {m} sees fear in her eyes and feels sick at what he has become.`,
          ],
          aftercare: [`She flees the moment she can, and neither man can look at the other.`],
        },
      },
      {
        id: 'middle', pose: 'lie', arrangement: 'face',
        lines: [
          `On the wide futon {f} is the undisputed queen — one man kissing her lips while the other worships her hands, her hair, her laughter.`,
          `She sighs with delight at being so thoroughly adored, giving herself to the delicious overwhelm.`,
          `{m} and his brother move in harmony, rivals in nothing, united in devotion to her pleasure.`,
        ],
        aftercare: [`{f} crowns them both with kisses. "My two champions."`],
      },
      {
        id: 'climax', pose: 'lie', arrangement: 'face',
        lines: [
          `Doubled devotion brings doubled bliss — {f} cries out, held safe between them, pleasure cresting in great waves.`,
          `They hold her through every tremor, murmuring praise, until she lies spent and glowing between them.`,
          `No jealousy, no awkwardness — only three hearts beating as one.`,
        ],
        aftercare: [`{f} sleeps between them like a treasure guarded by two dragons.`],
      },
      {
        id: 'afterglow', pose: 'lie', arrangement: 'side',
        lines: [
          `In the grey morning the three of them share tea and quiet laughter, the night a warm secret between them.`,
          `"We should do this," {f} says shyly, "on every festival." The men agree at once, perhaps too quickly.`,
          `What was daring becomes tradition; what was tradition becomes legend — told only in whispers.`,
        ],
        aftercare: [`Years later, the three still meet every summer — and smile at the memory.`],
      },
    ],
  },
  {
    id: 'threesome-ffm', name: 'Two Blossoms', participants: '1m2f',
    desc: 'Two women, one lucky man — a night of doubled beauty and laughter.',
    stages: [
      {
        id: 'begin', pose: 'embrace', arrangement: 'face',
        lines: [
          `{m} finds himself between {f} and {f2} — two blossoms, two smiles, four laughing eyes all fixed on him.`,
          `"We've decided to share you," {f} announces grandly. {f2} nods. "Tonight, you belong to us."`,
          `He is kissed from both sides at once and offers not the faintest objection.`,
        ],
        aftercare: [`{m} looks dazed and delighted. "I am the luckiest man in the provinces."`],
        forced: {
          lines: [
            `{f} and {f2} cling to each other, pale and silent, as {m} approaches. "Please," {f} whispers for them both, "don't."`,
            `Their fear mirrors itself, doubled — and {m} stops cold, ashamed to his core.`,
          ],
          aftercare: [`The two women hold each other and weep quietly; {m} leaves and does not return.`],
        },
      },
      {
        id: 'middle', pose: 'lie', arrangement: 'face',
        lines: [
          `The two women take turns — and then stop taking turns — lavishing attention on {m} and, playfully, on each other.`,
          `Laughter fills the room: {f2} is ticklish, {f} is bold, and {m} is hopelessly, happily overwhelmed.`,
          `Kisses are traded like currency, and everyone grows rich.`,
        ],
        aftercare: [`{f} braids {f2}'s hair while {m} watches, utterly content.`],
      },
      {
        id: 'climax', pose: 'lie', arrangement: 'face',
        lines: [
          `Pleasure rises in all three like a tide — {f} and {f2} crying out together, {m} swept along in the glorious flood.`,
          `They cling to each other, a tangle of limbs and laughter and racing hearts.`,
          `When the waves recede, all three lie staring at the ceiling, grinning like fools.`,
        ],
        aftercare: [`"We," {f2} declares, "are geniuses." No one disagrees.`],
      },
      {
        id: 'afterglow', pose: 'lie', arrangement: 'side',
        lines: [
          `The three of them doze in a heap, warm and boneless, as morning paints the shutters gold.`,
          `{f} and {f2} have become fast friends — they exchange hairpins as a pledge of sisterhood.`,
          `{m} makes tea for three and serves it in bed, feeling like a king with two queens.`,
        ],
        aftercare: [`The hairpins are still exchanged every year, on the anniversary.`],
      },
    ],
  },
];

export function sexTemplateById(id) {
  return SEX_TEMPLATES.find(t => t.id === id) || null;
}

// ---------------------------------------------------------------------------
// sexSequence(templateId, npcIds, S, forced=false) ->
//   { beats: [{ poses, arrangement, text }...],
//     consequences: { karma, flags, news } }
//
// npcIds: array of npc ids (strings) or { id, name, adult } records.
// The FIRST entry is the primary female participant ({f}); the second,
// if the template needs it, is {f2}. Male participant is the player ({m})
// unless S.witnessMode is set, in which case {m} is a named witness.
// ---------------------------------------------------------------------------
export function sexSequence(templateId, npcIds, S, forced = false) {
  const tpl = sexTemplateById(templateId);
  if (!tpl) throw new Error('unknown sex template: ' + templateId);
  const ids = Array.isArray(npcIds) ? npcIds : [npcIds];

  const femaleCount = tpl.participants === '1m2f' ? 2 : 1;
  const maleCount = tpl.participants === '2m1f' ? 2 : 1;
  if (ids.length < femaleCount) {
    throw new Error(`template ${templateId} needs ${femaleCount} female participant(s)`);
  }

  const nameOf = (entry) => {
    if (!entry) return '???';
    if (typeof entry === 'object' && entry.name) return entry.name;
    return prettifyId(String(entry.id || entry));
  };
  const adultOf = (entry) => {
    if (typeof entry === 'object' && 'adult' in entry) return entry.adult === true;
    return null; // unknown — caller must have checked allowed() first
  };
  for (const entry of ids.slice(0, femaleCount)) {
    if (adultOf(entry) === false) {
      throw new Error('intimate scenes are for explicitly adult NPCs only');
    }
  }

  const m = (S && S.witnessMode && S.witnessName) ? S.witnessName : playerName(S);
  const f = nameOf(ids[0]);
  const f2 = nameOf(ids[1]) || 'her friend';
  const ctx = { m, f, f2 };

  const beats = [];
  for (const stage of tpl.stages) {
    const useForced = forced && stage.forced;
    const lines = useForced ? stage.forced.lines : stage.lines;
    for (const line of lines) {
      beats.push({
        poses: { self: stage.pose, npc: stage.pose },
        arrangement: stage.arrangement,
        text: fillPlaceholders(line, ctx),
        stage: stage.id,
        tone: forced ? 'fearful' : 'tender',
      });
    }
  }

  const key = npcKeyFromId(typeof ids[0] === 'object' ? (ids[0].id || ids[0].npcId) : ids[0]);
  let consequences;
  if (forced) {
    consequences = {
      karma: -20,
      flags: { guard_alert: true, ['coerced_' + key]: true },
      news: `Dark rumors whisper of frightened tears behind closed doors — and of an onmyoji whose shadow has grown cold. The victim is blameless; the shame belongs to the one who forced it.`,
      tone: 'fearful',
    };
  } else {
    consequences = {
      karma: 2,
      flags: { ['lovday_' + key]: 'TODAY' },
      news: `🌙 A night of passion with ${f} — whispered of fondly, if at all. The realm need never know.`,
      tone: 'tender',
    };
  }
  return { beats, consequences };
}
