// explore.js — point-and-click district exploration, Dragon Knight 4 style.
//
// Instead of a flat button list, each location is a scene you walk with your
// eyes: positioned hotspots for the audience hall, people, market, inn,
// shrine and gates. Hotspots are generated from live game data (factions
// seated here, NPCs present, services) so every place in the realm is
// explorable with zero per-location scripting.

import { getLocation } from './map.js';
import * as Factions from './factions.js';
import * as DLG from './dialogue.js';

export const KINDS = {
  kyoto: 'capital', sakai: 'city', otsu: 'town', gifu: 'castle',
  azuchi: 'castle', odani: 'castle', ichijodani: 'city', hamamatsu: 'castle',
  kofu: 'castle', kasugayama: 'castle', koriyama: 'castle', odawara: 'castle',
  ishiyama: 'temple', hiei: 'temple', sekigahara: 'wilds', kutsuki: 'village',
  forest: 'wilds', shrine: 'temple', honnoji: 'temple',
};

export const KIND_LABEL = {
  capital: 'the capital streets', city: 'the city', town: 'the town',
  castle: 'the castle town', village: 'the village',
  temple: 'the temple grounds', wilds: 'the wilds',
};

export function kindOf(locId) { return KINDS[locId] || 'wilds'; }

// Slots are {role, x, y, icon, label, flavor?} — positions in percent.
const SLOTS = {
  capital: [
    { role: 'audience', x: 50, y: 22, icon: '🏯', label: 'Audience hall' },
    { role: 'npc', x: 76, y: 40, icon: '💬' },
    { role: 'shop', x: 26, y: 54, icon: '🛒', label: 'Market' },
    { role: 'inn', x: 58, y: 66, icon: '🍶', label: 'Inn' },
    { role: 'flavor', x: 84, y: 60, flavor: 'rumor' },
    { role: 'flavor', x: 38, y: 74, flavor: 'aiko' },
    { role: 'gate', x: 12, y: 84, icon: '🚪', label: 'City gate' },
  ],
  city: [
    { role: 'audience', x: 50, y: 24, icon: '🏯', label: 'Audience hall' },
    { role: 'npc', x: 74, y: 44, icon: '💬' },
    { role: 'shop', x: 28, y: 56, icon: '🛒', label: 'Market' },
    { role: 'inn', x: 60, y: 68, icon: '🍶', label: 'Inn' },
    { role: 'flavor', x: 84, y: 62, flavor: 'rumor' },
    { role: 'gate', x: 12, y: 84, icon: '🚪', label: 'City gate' },
  ],
  town: [
    { role: 'npc', x: 60, y: 40, icon: '💬' },
    { role: 'shop', x: 30, y: 56, icon: '🛒', label: 'Market' },
    { role: 'inn', x: 62, y: 68, icon: '🍶', label: 'Inn' },
    { role: 'flavor', x: 82, y: 52, flavor: 'rumor' },
    { role: 'flavor', x: 40, y: 74, flavor: 'aiko' },
    { role: 'gate', x: 12, y: 84, icon: '🚪', label: 'Town gate' },
  ],
  castle: [
    { role: 'audience', x: 50, y: 20, icon: '🏯', label: 'Castle keep' },
    { role: 'npc', x: 74, y: 44, icon: '💬' },
    { role: 'shop', x: 28, y: 56, icon: '🛒', label: 'Castle town market' },
    { role: 'inn', x: 60, y: 68, icon: '🍶', label: 'Inn' },
    { role: 'flavor', x: 84, y: 58, flavor: 'drills' },
    { role: 'gate', x: 12, y: 84, icon: '🚪', label: 'Castle gate' },
  ],
  village: [
    { role: 'npc', x: 52, y: 34, icon: '💬' },
    { role: 'inn', x: 64, y: 62, icon: '🍶', label: 'Inn' },
    { role: 'shrine', x: 82, y: 46, icon: '⛩️', label: 'Wayside shrine' },
    { role: 'flavor', x: 30, y: 58, flavor: 'restspot' },
    { role: 'flavor', x: 44, y: 76, flavor: 'aiko' },
    { role: 'gate', x: 12, y: 84, icon: '🚪', label: 'Village edge' },
  ],
  temple: [
    { role: 'audience', x: 50, y: 24, icon: '🏯', label: 'Audience hall' },
    { role: 'npc', x: 70, y: 46, icon: '💬' },
    { role: 'shrine', x: 34, y: 58, icon: '⛩️', label: 'Pray' },
    { role: 'flavor', x: 82, y: 60, flavor: 'aiko' },
    { role: 'flavor', x: 46, y: 74, flavor: 'rumor' },
    { role: 'gate', x: 12, y: 84, icon: '🚪', label: 'Temple gate' },
  ],
  wilds: [
    { role: 'npc', x: 60, y: 42, icon: '💬' },
    { role: 'flavor', x: 34, y: 56, flavor: 'restspot' },
    { role: 'flavor', x: 72, y: 64, flavor: 'aiko' },
    { role: 'gate', x: 12, y: 84, icon: '🥾', label: 'Take the road' },
  ],
};

export const FLAVORS = {
  rumor:    { icon: '👂', label: 'Listen for rumors', act: 'x-rumor' },
  drills:   { icon: '⚔️', label: 'Watch the drills', act: 'x-drills' },
  restspot: { icon: '🌳', label: 'Rest in the shade', act: 'x-restspot' },
  aiko:     { icon: '🦊', label: 'Ask Aiko what she senses', act: 'x-aiko' },
};

export const RUMORS = [
  'They say Nobunaga laughs at the old gods — and the old gods have started laughing back.',
  'A merchant from Sakai swears the Takeda cavalry drills day and night. "Like thunder that never stops."',
  'The monks of Hiei are buying spearheads. Spearheads! From a temple!',
  'Word from the west: the Mōri fleet grows fat on trade while the east bleeds.',
  'Kenshin was seen praying all night at Bishamonten\'s shrine. Again.',
  'Hideyoshi — that monkey-faced foot soldier — rises higher every month. The old retainers grind their teeth.',
  'A kappa near Ōtsu now demands poetry instead of cucumbers. The fishermen are baffled.',
  'The Emperor\'s court has no money for roof repairs, but plenty for ceremonies.',
  'Someone is buying up all the saltpeter in Sakai. Someone rich. Someone planning something.',
  'An onmyōji passed through last spring and every mirror in the village cracked. Cheerful fellow.',
  'The Asai are caught between oath and marriage. "A man torn in two," the old women cluck.',
  'Ghosts multiply along the Nakasendō. The living walk faster these days.',
];

// A hotspot: {x, y, icon, label, sub, act, id}
export function hotspotsFor(s, locId) {
  const loc = getLocation(locId);
  const kind = kindOf(locId);
  const slots = SLOTS[kind] || SLOTS.wilds;
  const spots = [];
  const fids = Object.keys(Factions.FACTIONS).filter((fid) =>
    Factions.factionActive(s, fid) && Factions.factionCapital(s, fid) === locId);
  const npcs = DLG.npcsAt(s, locId);
  let fi = 0, ni = 0;

  for (const sl of slots) {
    if (sl.role === 'audience') {
      for (const fid of fids) {
        const dm = Factions.currentDaimyo(s, fid);
        const serving = s.world.service.faction === fid;
        spots.push({
          x: sl.x, y: sl.y + (fi++) * 10, icon: '👑',
          label: dm.name, sub: Factions.factionDisplayName(s, fid) + (serving ? ' — your lord' : ''),
          act: 'audience', id: fid,
        });
      }
    } else if (sl.role === 'npc') {
      for (const n of npcs) {
        const arch = DLG.ARCHETYPES[n.archetype] || {};
        spots.push({
          x: sl.x, y: sl.y + (ni++) * 10, icon: sl.icon,
          label: n.name, sub: arch.label || '',
          act: 'talk', id: n.id,
        });
      }
    } else if (sl.role === 'shop') {
      if (loc.services.includes('shop')) spots.push({ x: sl.x, y: sl.y, icon: sl.icon, label: sl.label, sub: '', act: 'shop', id: '' });
    } else if (sl.role === 'inn') {
      if (loc.services.includes('inn')) spots.push({ x: sl.x, y: sl.y, icon: sl.icon, label: sl.label, sub: 'rest till morning (20g)', act: 'inn', id: '' });
    } else if (sl.role === 'shrine') {
      if (loc.services.includes('shrine')) spots.push({ x: sl.x, y: sl.y, icon: sl.icon, label: sl.label, sub: '2 hours', act: 'shrine', id: '' });
    } else if (sl.role === 'gate') {
      spots.push({ x: sl.x, y: sl.y, icon: sl.icon, label: sl.label, sub: 'travel the roads', act: 'map', id: '' });
    } else if (sl.role === 'flavor') {
      const f = FLAVORS[sl.flavor];
      if (f) spots.push({ x: sl.x, y: sl.y, icon: f.icon, label: f.label, sub: '', act: f.act, id: '' });
    }
  }
  return spots;
}
