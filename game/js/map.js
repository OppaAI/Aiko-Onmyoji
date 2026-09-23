// map.js — location graph, day-based travel, random encounters.
// Real Sengoku-period places. Travel takes DAYS; the clock moves slowly.

import { advanceHours, restUntilMorning, discover, rand, pick } from './state.js';
import { processDate } from './history.js';

export const LOCATIONS = {
  kyoto: {
    name: 'Kyoto', jp: '京都',
    desc: 'The imperial capital. Incense smoke, temple bells, and beneath it all the plotting of shoguns and emperors.',
    bg: 'bg_kyoto.png', danger: 0, enemies: [],
    npcs: ['noble_fujiwara', 'lady_tsubaki', 'dancer_koharu'],
    services: ['inn', 'shop'],
    connections: { sakai: 1, otsu: 1, shrine: 1, ishiyama: 2, honnoji: 1 },
  },
  sakai: {
    name: 'Sakai', jp: '堺',
    desc: 'A free merchant city of warehouses and coin-counters. Everything has a price here — even gossip, even loyalty.',
    bg: 'bg_kyoto.png', danger: 0, enemies: [],
    npcs: ['merchant_daijiro', 'merchant_yae'],
    services: ['inn', 'shop'],
    connections: { kyoto: 1 },
  },
  otsu: {
    name: 'Ōtsu, Lake Biwa', jp: '大津・琵琶湖',
    desc: 'Reed beds and grey water stretching to the horizon. The fishermen speak of a kappa demanding tolls.',
    bg: 'bg_forest.png', danger: 1, enemies: ['kappa', 'kappa', 'ronin'],
    npcs: ['kappa_kawataro'],
    services: [],
    connections: { kyoto: 1, azuchi: 1, hiei: 1, gifu: 2 },
  },
  gifu: {
    name: 'Gifu', jp: '岐阜',
    desc: 'Nobunaga\'s mountain stronghold. Black-lacquered walls rise above the town; the air smells of gunpowder and ambition.',
    bg: 'bg_battlefield.png', danger: 1, enemies: ['ashigaru', 'ronin'],
    npcs: ['samurai_tetsuzo', 'innkeep_okiku'],
    services: ['inn'],
    connections: { otsu: 2, sekigahara: 1, odani: 2 },
  },
  azuchi: {
    name: 'Azuchi', jp: '安土',
    desc: 'A castle town rising around Nobunaga\'s great new fortress — five stories of gold and lacquer. Soldiers drill; ronin loiter; spies whisper.',
    bg: 'bg_battlefield.png', danger: 1, enemies: ['ashigaru', 'ronin', 'ronin'],
    npcs: ['musha_ayame', 'princess_iroha'],
    services: ['inn', 'shop'],
    connections: { otsu: 1, sekigahara: 2, odani: 1 },
  },
  odani: {
    name: 'Odani Castle', jp: '小谷城',
    desc: 'The Asai mountain fortress, beautiful and doomed. From its heights you can see all of northern Ōmi — and the Oda banners gathering.',
    bg: 'bg_battlefield.png', danger: 1, enemies: ['ashigaru', 'samurai'],
    npcs: [],
    services: ['inn'],
    connections: { azuchi: 1, gifu: 2, ichijodani: 2, kasugayama: 4 },
  },
  ichijodani: {
    name: 'Ichijōdani', jp: '一乗谷',
    desc: 'The Asakura\'s "little Kyoto" — refined streets, poetry salons, and walls that have never been tested. Yet.',
    bg: 'bg_kyoto.png', danger: 1, enemies: ['ronin', 'ashigaru'],
    npcs: [],
    services: ['inn'],
    connections: { odani: 2, kasugayama: 3 },
  },
  hamamatsu: {
    name: 'Hamamatsu', jp: '浜松',
    desc: 'Ieyasu\'s castle town. Orderly, frugal, watchful. The Tokugawa endure here like pines on a cliff.',
    bg: 'bg_battlefield.png', danger: 1, enemies: ['ronin', 'ashigaru'],
    npcs: [],
    services: ['inn'],
    connections: { sekigahara: 2, kofu: 3 },
  },
  kofu: {
    name: 'Kōfu', jp: '甲府',
    desc: 'Seat of the Takeda. War banners snap in the mountain wind; the cavalry drills never stop. Fūrinkazan.',
    bg: 'bg_battlefield.png', danger: 1, enemies: ['samurai', 'ronin'],
    npcs: ['princess_yu'],
    services: ['inn'],
    connections: { hamamatsu: 3, odawara: 3 },
  },
  kasugayama: {
    name: 'Kasugayama', jp: '春日山',
    desc: 'Kenshin\'s mountain fortress in Echigo. Snow half the year, prayer banners the other half. The God of War resides here.',
    bg: 'bg_battlefield.png', danger: 1, enemies: ['samurai', 'yurei'],
    npcs: ['princess_setsu'],
    services: ['inn'],
    connections: { ichijodani: 3, odani: 4 },
  },
  koriyama: {
    name: 'Yoshida-Kōriyama', jp: '吉田郡山',
    desc: 'The Mōri mountain stronghold above the Inland Sea. Patient, wealthy, and watching the east with calm eyes.',
    bg: 'bg_battlefield.png', danger: 1, enemies: ['ashigaru', 'ronin'],
    npcs: [],
    services: ['inn'],
    connections: { ishiyama: 3, kyoto: 4 },
  },
  odawara: {
    name: 'Odawara', jp: '小田原',
    desc: 'The Hōjō\'s impregnable castle town. Triple moats, endless walls, and clerks who count everything twice.',
    bg: 'bg_battlefield.png', danger: 1, enemies: ['ashigaru', 'samurai'],
    npcs: [],
    services: ['inn'],
    connections: { kofu: 3 },
  },
  ishiyama: {
    name: 'Ishiyama Hongan-ji', jp: '石山本願寺',
    desc: 'The great temple-fortress of Osaka. Moats, walls, and ten thousand faithful chanting Namu Amida Butsu as one.',
    bg: 'bg_shrine.png', danger: 1, enemies: ['ashigaru', 'ronin'],
    npcs: [],
    services: ['shrine'],
    connections: { kyoto: 2, koriyama: 3 },
  },
  hiei: {
    name: 'Mt. Hiei', jp: '比叡山',
    desc: 'Cedar forests and temple halls above the clouds. The warrior monks watch the capital — and the spirits — with wary eyes.',
    bg: 'bg_shrine.png', danger: 1, enemies: ['yurei', 'ronin'],
    npcs: ['monk_enkai'],
    services: ['shrine'],
    connections: { otsu: 1 },
  },
  sekigahara: {
    name: 'Sekigahara Pass', jp: '関ヶ原',
    desc: 'A windswept mountain pass. Armies will march here one day; for now it belongs to bandits and ghosts of old battles.',
    bg: 'bg_battlefield.png', danger: 2, enemies: ['ronin', 'ashigaru', 'samurai', 'yurei'],
    npcs: [],
    services: [],
    connections: { gifu: 1, azuchi: 2, kutsuki: 1, hamamatsu: 2 },
  },
  kutsuki: {
    name: 'Kutsuki Village', jp: '朽木村',
    desc: 'A small mountain village of thatched roofs and terraced paddies. The elder waits by the great camphor tree.',
    bg: 'bg_forest.png', danger: 1, enemies: ['ronin', 'kappa'],
    npcs: ['elder_mosuke', 'widow_hanae'],
    services: ['inn'],
    connections: { sekigahara: 1, forest: 1 },
  },
  forest: {
    name: 'Bamboo Forest', jp: '竹林',
    desc: 'Green gloom and whispering stalks. Foxfire dances between the shadows, and something laughs just out of sight.',
    bg: 'bg_forest.png', danger: 2, enemies: ['kitsune', 'kitsune', 'yurei', 'oni'],
    npcs: [],
    services: [],
    connections: { kutsuki: 1, shrine: 2 },
  },
  shrine: {
    name: 'Old Shrine', jp: '古社',
    desc: 'A weathered shrine half-swallowed by moss. A shrine maiden still tends it — and a sorrowful ghost lingers by the offering box.',
    bg: 'bg_shrine.png', danger: 1, enemies: ['yurei', 'yurei'],
    npcs: ['miko_hana', 'yurei_oyuki'],
    services: ['shrine'],
    connections: { forest: 2, kyoto: 1 },
  },
  honnoji: {
    name: 'Honnō-ji', jp: '本能寺',
    desc: 'A temple in the capital where the air tastes of iron and old smoke. Since that night in 1582, no bell hangs in its tower — yet travelers swear they hear one.',
    bg: 'bg_shrine.png', danger: 3, enemies: ['oni', 'yurei', 'samurai'],
    npcs: [],
    services: [],
    connections: { kyoto: 1 },
    locked: true, // discovered when history reaches 1582-06-02
  },
};

export function getLocation(id) { return LOCATIONS[id]; }
export function locationName(id) { const l = LOCATIONS[id]; return l ? `${l.name} (${l.jp})` : id; }

export function availableDestinations(s) {
  const here = LOCATIONS[s.player.location];
  return Object.entries(here.connections)
    .filter(([id]) => !LOCATIONS[id].locked || s.world.discovered.includes(id))
    .map(([id, days]) => ({ id, days, ...LOCATIONS[id] }));
}

// Travel: costs DAYS on the road. History advances while you walk.
export function travel(s, destId) {
  const here = LOCATIONS[s.player.location];
  const days = here.connections[destId];
  if (!days) return { ok: false, reason: 'No road leads there from here.' };
  if (LOCATIONS[destId].locked && !s.world.discovered.includes(destId)) {
    return { ok: false, reason: 'That place is not yet open to you.' };
  }
  const rolled = advanceHours(s, days * 24);
  s.player.location = destId;
  discover(s, destId);

  const dest = LOCATIONS[destId];
  let encounter = null;
  if (dest.danger > 0 && dest.enemies.length) {
    let chance = dest.danger * 14;
    if (Math.random() * 100 < chance) encounter = pick(dest.enemies);
  }
  s.player.rei = Math.min(s.player.maxRei, s.player.rei + 4);
  const news = processDate(s);
  return { ok: true, days, encounter, news, rolled };
}

export function innRest(s, cost) {
  if (s.player.gold < cost) return { ok: false, reason: 'Not enough gold.' };
  s.player.gold -= cost;
  restUntilMorning(s);
  s.player.hp = s.player.maxHp;
  s.player.rei = s.player.maxRei;
  s.aiko.hp = s.aiko.maxHp;
  const news = processDate(s);
  return { ok: true, news };
}

// wait a full day without spending gold (no healing)
export function waitDay(s) {
  advanceHours(s, 24);
  const news = processDate(s);
  return { ok: true, news };
}

export function shrinePray(s) {
  advanceHours(s, 2);
  s.player.rei = s.player.maxRei;
  s.player.hp = Math.min(s.player.maxHp, s.player.hp + 10);
  const news = processDate(s);
  return { ok: true, news };
}
