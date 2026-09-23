// state.js — game state: creation, persistence, stat helpers, slow historical clock.
// Aiko Onmyoji: Sengoku Spirits — historical sandbox edition.
// Time moves slowly: actions cost hours, travel costs days. History fires on
// its real dates (1570–1590) whether the player acts or not.

export const SAVE_KEY = 'aiko_onmyoji_save_v2';

export const ITEMS = {
  herb:        { name: 'Healing Herb',   desc: 'Restores 40 HP.', price: 30, use: 'heal40' },
  spirit_pill: { name: 'Spirit Pill',    desc: 'Restores 20 Rei.', price: 25, use: 'rei20' },
  sweet_buns:  { name: 'Sweet Bean Buns',desc: 'A gift. Aiko loves these. (+Bond)', price: 15, use: 'gift' },
  iron_talisman:{ name: 'Iron Talisman', desc: 'Passive: +2 ATK while carried.', price: 120, use: 'passive' },
  warding_cord:{ name: 'Warding Cord',   desc: 'Passive: +2 DEF while carried.', price: 120, use: 'passive' },
  sacred_sake: { name: 'Sacred Sake',    desc: 'Used in rites of release.', price: 80, use: 'quest' },
  bride_charm: { name: 'Bound Bride Charm', desc: 'Combat: unleash a bound yurei on a yokai foe.', price: 0, use: 'charm' },
  moon_mirror: { name: 'Moon Mirror',    desc: 'A mirror that shows what the eye refuses.', price: 0, use: 'quest' },
  fine_silk:   { name: 'Fine Silk',      desc: 'A gift fit for a daimyo\'s court. (+Audience favor)', price: 150, use: 'gift_daimyo' },
  war_horse:   { name: 'War Horse',      desc: 'A fine steed. A gift no commander refuses. (+Audience favor)', price: 400, use: 'gift_daimyo' },
  tea_set:     { name: 'Tea Utensils',   desc: 'A famed tea set. Nobunaga-sama would notice. (+Audience favor)', price: 300, use: 'gift_daimyo' },
};

export function newGame(playerName) {
  const s = {
    player: {
      name: playerName || 'Onmyoji',
      level: 1, exp: 0,
      hp: 60, maxHp: 60,
      rei: 30, maxRei: 30,
      atk: 10, def: 6, agi: 8,
      gold: 80, karma: 0,
      fame: 0, honor: 50,
      location: 'kyoto',
      inventory: [{ id: 'herb', qty: 2 }],
    },
    aiko: { name: 'Aiko', hp: 50, maxHp: 50, bond: 30, mood: 'curious' },
    world: {
      y: 1570, m: 6, d: 1, hour: 8, // dawn of the 1st day, 6th month, Genki 1 (1570)
      discovered: ['kyoto', 'sakai'],
      npcMemory: {},
      questFlags: {},
      flags: {},
      news: [],            // [{d:'1570-06-28', text}] — most recent last
      lastHistory: '1570-05-31',
      factions: {},        // fid -> { rep, strength, active, daimyoIdx }
      service: { faction: null, rank: 0 }, // rank index into RANKS
      courtRank: 0,        // imperial court titles granted
      activeMission: null,
      pendingBattle: null, // battle id the player may join right now
      metDaimyo: {},       // fid -> true (has had an audience)
      lastFactionAidMonth: {}, // fid -> YYYY-M of the last granted aid request
    },
  };
  return s;
}

// ---------- persistence ----------
export function saveGame(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; }
  catch (e) { return false; }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function hasSave() { return !!loadGame(); }
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); }
  catch (e) {}
}

// ---------- helpers ----------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function karmaTier(k) {
  if (k >= 60) return 'benevolent';
  if (k >= 20) return 'kind';
  if (k > -20) return 'neutral';
  if (k > -60) return 'harsh';
  return 'ruthless';
}
export function addKarma(s, d) {
  const old = s.player.karma;
  s.player.karma = clamp(s.player.karma + d, -100, 100);
  return { old, now: s.player.karma, tier: karmaTier(s.player.karma), delta: d };
}
export function addFame(s, d) {
  s.player.fame = Math.max(0, s.player.fame + d);
  return s.player.fame;
}
export function addHonor(s, d) {
  const old = s.player.honor;
  s.player.honor = clamp(s.player.honor + d, 0, 100);
  return { old, now: s.player.honor, delta: d };
}

export function expNext(level) { return level * 100; }
export function addExp(s, n) {
  s.player.exp += n;
  let ups = 0;
  while (s.player.exp >= expNext(s.player.level)) {
    s.player.exp -= expNext(s.player.level);
    s.player.level += 1; ups += 1;
    s.player.maxHp += 8; s.player.atk += 2; s.player.def += 1;
    s.player.agi += 1; s.player.maxRei += 5;
    s.player.hp = Math.min(s.player.maxHp, s.player.hp + Math.floor(s.player.maxHp * 0.35));
    s.player.rei = s.player.maxRei;
    s.aiko.maxHp += 6; s.aiko.hp = s.aiko.maxHp;
  }
  return { leveled: ups > 0, levels: ups };
}

export function addGold(s, n) { s.player.gold = Math.max(0, s.player.gold + n); return s.player.gold; }
export function addItem(s, id, qty = 1) {
  const slot = s.player.inventory.find(i => i.id === id);
  if (slot) slot.qty += qty; else s.player.inventory.push({ id, qty });
}
export function removeItem(s, id, qty = 1) {
  const slot = s.player.inventory.find(i => i.id === id);
  if (!slot || slot.qty < qty) return false;
  slot.qty -= qty;
  if (slot.qty <= 0) s.player.inventory = s.player.inventory.filter(i => i.id !== id);
  return true;
}
export function hasItem(s, id, qty = 1) {
  const slot = s.player.inventory.find(i => i.id === id);
  return !!slot && slot.qty >= qty;
}
export function passiveBonus(s) {
  let atk = 0, def = 0;
  if (hasItem(s, 'iron_talisman')) atk += 2;
  if (hasItem(s, 'warding_cord')) def += 2;
  // generic passive items: use:'passiveAtkN' / use:'passiveDefN'
  for (const it of s.player.inventory || []) {
    const defn = ITEMS[it.id];
    if (defn && typeof defn.use === 'string') {
      let m = /^passiveAtk(\d+)$/.exec(defn.use); if (m) atk += +m[1];
      m = /^passiveDef(\d+)$/.exec(defn.use); if (m) def += +m[1];
    }
  }
  return { atk, def };
}

export function healPlayer(s, n) {
  s.player.hp = clamp(s.player.hp + n, 0, s.player.maxHp);
}
export function damagePlayer(s, n) {
  s.player.hp = clamp(s.player.hp - n, 0, s.player.maxHp);
}
export function spendRei(s, n) {
  if (s.player.rei < n) return false;
  s.player.rei -= n; return true;
}

export function bondChange(s, d, reason) {
  const old = s.aiko.bond;
  s.aiko.bond = clamp(s.aiko.bond + d, 0, 100);
  return { old, now: s.aiko.bond, delta: d, reason };
}
export function setMood(s, mood) { s.aiko.mood = mood; }

export function setFlag(s, k, v) { s.world.flags[k] = v; }
export function getFlag(s, k, dflt) {
  return Object.prototype.hasOwnProperty.call(s.world.flags, k) ? s.world.flags[k] : dflt;
}
export function rememberNpc(s, npcId, key, val) {
  if (!s.world.npcMemory[npcId]) s.world.npcMemory[npcId] = { met: true, helped: 0, wronged: 0, notes: [] };
  const m = s.world.npcMemory[npcId];
  if (key === 'note') m.notes.push(val);
  else if (key === 'helped') m.helped += val;
  else if (key === 'wronged') m.wronged += val;
  else m[key] = val;
}
export function npcMemory(s, npcId) {
  return s.world.npcMemory[npcId] || { met: false, helped: 0, wronged: 0, notes: [] };
}

// ---------- news ----------
export function addNews(s, text) {
  s.world.news.push({ d: dateKey(s), text });
  if (s.world.news.length > 40) s.world.news = s.world.news.slice(-40);
}
export function recentNews(s, n = 6) {
  return s.world.news.slice(-n).reverse();
}

// ---------- slow historical clock ----------
const MONTH_LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function dateKey(s) {
  const p = (n) => String(n).padStart(2, '0');
  return `${s.world.y}-${p(s.world.m)}-${p(s.world.d)}`;
}

export function nengo(y, m) {
  if (y < 1570 || (y === 1570 && m < 5)) return 'Eiroku 13';
  if (y < 1573 || (y === 1573 && m < 8)) return `Genki ${y - 1569}`;
  if (y < 1592) return `Tenshō ${y - 1572}`;
  return `Bunroku ${y - 1591}`;
}

export function timeOfDay(hour) {
  if (hour < 5) return 'Night';
  if (hour < 8) return 'Early morning';
  if (hour < 12) return 'Morning';
  if (hour < 14) return 'Noon';
  if (hour < 17) return 'Afternoon';
  if (hour < 20) return 'Evening';
  return 'Night';
}

export function dateLabel(s) {
  return `${nengo(s.world.y, s.world.m)} (${s.world.y}), ${s.world.m}${ordinal(s.world.m)} month, ${s.world.d}${ordinal(s.world.d)} day — ${timeOfDay(s.world.hour).toLowerCase()}`;
}
function ordinal(n) {
  const value = Math.abs(n);
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return 'th';
  if (value % 10 === 1) return 'st';
  if (value % 10 === 2) return 'nd';
  if (value % 10 === 3) return 'rd';
  return 'th';
}

function addDay(s) {
  s.world.d += 1;
  if (s.world.d > MONTH_LEN[s.world.m - 1]) { s.world.d = 1; s.world.m += 1; }
  if (s.world.m > 12) { s.world.m = 1; s.world.y += 1; }
  // monthly stipend for serving retainers
  if (s.world.service.faction && s.world.d === 1) {
    payStipend(s);
  }
}

// advance the clock by h hours; returns number of days rolled over
export function advanceHours(s, h) {
  let days = 0;
  s.world.hour += h;
  while (s.world.hour >= 24) { s.world.hour -= 24; addDay(s); days += 1; }
  return days;
}

// rest until next morning (used by inns / waiting)
export function restUntilMorning(s) {
  const h = s.world.hour < 5 ? (5 - s.world.hour) : (24 - s.world.hour + 5);
  return advanceHours(s, h);
}

// stipend hook — implemented here to avoid circular imports; factions.js
// supplies the rank table via setStipendTable().
let stipendTable = null;
export function setStipendTable(t) { stipendTable = t; }
function payStipend(s) {
  if (!stipendTable || !s.world.service.faction) return;
  const rank = s.world.service.rank || 0;
  const pay = stipendTable[rank] || 0;
  if (pay > 0) {
    s.player.gold += pay;
    addNews(s, `📜 Stipend received: ${pay} gold for your service.`);
  }
}

export function discover(s, locId) {
  if (!s.world.discovered.includes(locId)) s.world.discovered.push(locId);
}
