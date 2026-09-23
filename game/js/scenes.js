// scenes.js — interactive HCG-style scenes (Dragon Knight 4 flavor).
//
// Tasteful CG art + clickable hotspots; the explicit content lives in the
// TEXT, never in the imagery. Scenes are only ever offered to explicitly
// adult NPCs (see the `adult` flag + hscene topic injection in dialogue.js).
// Aiko and all minors/ambiguous-age characters are excluded unconditionally.

export const SCENES = {
  night_together: {
    cg: 'cg_bedroom_night.png',
    stages: [
      {
        id: 'embrace', title: 'Embrace', need: 4,
        intro: (nm) => `The lamp burns low and the night is yours alone. ${nm} stands close, her breath already quick, her eyes bright. Touch her — explore — take your time. There is no hurry here, and no one to interrupt.`,
        spots: [
          {
            id: 'lips', x: 50, y: 30, icon: '💋', label: 'Kiss her lips',
            texts: [
              (nm) => `${nm}'s lips part under yours — soft, warm, eager. She makes a small sound deep in her throat and pulls you closer, her fingers tangling in your collar.`,
              (nm) => `You kiss her slowly, deeply, until she breaks away breathless and laughing. "Again," she whispers, and does not wait for an answer.`,
            ],
          },
          {
            id: 'hair', x: 29, y: 24, icon: '💇', label: 'Stroke her hair',
            texts: [
              (nm) => `You thread your fingers through her hair; ${nm} leans into the touch like a cat, eyes half-closing, a soft sigh escaping her.`,
              (nm) => `You loosen her hairpins one by one until her hair falls free around her shoulders. "You undo me," she murmurs, smiling.`,
            ],
          },
          {
            id: 'neck', x: 63, y: 38, icon: '💆', label: 'Kiss her neck',
            texts: [
              (nm) => `You press kisses along the curve of her neck; ${nm} shivers and tilts her head to give you better access, her breath hitching.`,
              (nm) => `Your lips find the hollow of her throat, where her pulse hammers fast and hot. She gasps your name like a prayer.`,
            ],
          },
          {
            id: 'hands', x: 43, y: 58, icon: '🤝', label: 'Hold her hands',
            texts: [
              (nm) => `You take her hands in yours and kiss each fingertip; ${nm} watches you with dark, shining eyes, her cheeks flushed.`,
              (nm) => `Your hands slide over her shoulders, easing her outer robe open. She doesn't stop you — she helps, shrugging it off herself.`,
            ],
          },
        ],
        advance: (nm) => `Her robes whisper to the floor. ${nm} stands before you without shyness now — only hunger. "Don't be gentle," she breathes. "Not tonight."`,
      },
      {
        id: 'passion', title: 'Passion', need: 5,
        intro: (nm) => `Skin on skin in the lamplight. ${nm} moves with you — urgent, unashamed, glorious.`,
        spots: [
          {
            id: 'lips', x: 50, y: 30, icon: '💋', label: 'Kiss her deeply',
            texts: [
              (nm) => `She kisses you fiercely, teeth grazing your lower lip, her nails raking down your back hard enough to leave marks you'll wear proudly.`,
              (nm) => `Between kisses she whispers wicked, wonderful things against your mouth — promises and demands that make you groan aloud.`,
            ],
          },
          {
            id: 'caress', x: 33, y: 46, icon: '🖐️', label: 'Caress her',
            texts: [
              (nm) => `Your hands roam freely and she arches into every touch, gasping, guiding you lower with impatient little sounds.`,
              (nm) => `She takes your wrist and places your hand exactly where she wants it most, her eyes daring you — and you accept the dare.`,
            ],
          },
          {
            id: 'entwine', x: 59, y: 57, icon: '💞', label: 'Move with her',
            texts: [
              (nm) => `You find the rhythm that undoes you both; her breath comes in ragged little cries against your shoulder.`,
              (nm) => `She wraps herself around you and pulls you impossibly close, whispering "don't stop, don't stop, don't stop."`,
            ],
          },
          {
            id: 'abandon', x: 44, y: 22, icon: '🔥', label: 'Lose control',
            texts: [
              (nm) => `All restraint burns away. There is only heat and need and ${nm}'s voice crying out in the dark, saying your name over and over.`,
              (nm) => `She comes apart beneath you with a shuddering cry, clinging to you as wave after wave takes her — then drags you right back under with her.`,
            ],
          },
        ],
        advance: (nm) => `Spent and trembling, ${nm} collapses against you, laughing breathlessly. "Gods," she pants. "Again — soon. But hold me first."`,
      },
      {
        id: 'afterglow', title: 'Afterglow', need: 3,
        intro: (nm) => `The lamp gutters low. ${nm} lies in the circle of your arms — sated, sleepy, glowing.`,
        spots: [
          {
            id: 'lips', x: 50, y: 33, icon: '💋', label: 'Kiss her softly',
            texts: [
              (nm) => `You kiss her softly, slowly; she smiles against your lips, drowsy and content, and hums a little tune.`,
              (nm) => `A lazy, lingering kiss — no urgency now, only sweetness and the taste of shared secrets.`,
            ],
          },
          {
            id: 'hair', x: 29, y: 26, icon: '💇', label: 'Stroke her hair',
            texts: [
              (nm) => `You stroke her hair as her breathing slows; she nestles closer, already half-asleep, utterly safe.`,
              (nm) => `She sighs happily while you play with her hair, one arm thrown possessively across your chest.`,
            ],
          },
          {
            id: 'hold', x: 62, y: 52, icon: '🤗', label: 'Hold her close',
            texts: [
              (nm) => `You hold her close, her head on your chest, listening together as the night settles around the room.`,
              (nm) => `"Mine," she mumbles into your shoulder, half-dreaming — and pulls the covers over you both.`,
            ],
          },
          {
            id: 'rest', x: 41, y: 63, icon: '💤', label: 'Let her sleep',
            texts: [
              (nm) => `Her breathing deepens into sleep; she looks impossibly peaceful in your arms, a small smile on her lips.`,
              (nm) => `You watch her sleep a while, memorizing this, then let yourself drift off beside her.`,
            ],
          },
        ],
        advance: (nm) => `Dawn finds you tangled together. ${nm} wakes, stretches like a cat, and kisses you good morning. "Best night of my life," she says simply. "Come back to me."`,
      },
    ],
  },
};
