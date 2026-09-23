// combat.js — turn-based combat vs humans and yokai.
// Player: attack / onmyodo spells / items / flee. Aiko acts each round on
// orders (scout/strike/heal/seal) or auto. Weakened foes may be SPARED or
// FINISHED, affecting karma. All content non-explicit.

import { clamp, rand, pick, hasItem, removeItem, passiveBonus, spendRei, healPlayer, damagePlayer, addExp, addGold, addKarma, addItem } from './state.js';
import { battleBanter } from './aiko.js';

export const ENEMIES = {
  ashigaru: { name: 'Ashigaru Spearman', jp: '足軽', kind: 'human', hp: 35, atk: 9, def: 4, agi: 6, exp: 35, gold: 18, sprite: 'enemy_ashigaru.png',
    taunt: '“Halt! Toll for the war effort!”', sprable: true,
    ai: 'steady', desc: 'A conscripted spearman, more hungry than brave.' },
  ronin: { name: 'Bandit Ronin', jp: '浪人', kind: 'human', hp: 45, atk: 11, def: 5, agi: 9, exp: 50, gold: 35, sprite: 'enemy_samurai.png',
    taunt: '“Your purse or your life, diviner. I’m flexible.”', sprable: true,
    ai: 'tricky', desc: 'A masterless samurai turned highway robber.' },
  samurai: { name: 'Samurai Captain', jp: '侍大将', kind: 'human', hp: 70, atk: 14, def: 8, agi: 10, exp: 90, gold: 60, sprite: 'enemy_samurai.png',
    taunt: '“Face me with honor, spirit-talker!”', sprable: true,
    ai: 'heavy', desc: 'A disciplined officer. His heavy strikes are telegraphed.' },
  kappa: { name: 'River Kappa', jp: '河童', kind: 'yokai', hp: 40, atk: 10, def: 5, agi: 11, exp: 55, gold: 25, sprite: 'enemy_kappa.png',
    taunt: '“Toll! Toll! Cucumbers also accepted!”', sprable: true,
    ai: 'mischief', desc: 'A mischievous water imp. Bow to spill his head-water!' },
  yurei: { name: 'Wailing Yurei', jp: '幽霊', kind: 'yokai', hp: 50, atk: 12, def: 3, agi: 8, exp: 65, gold: 10, sprite: 'enemy_yurei.png',
    taunt: '“…why… did you… leave me…”', sprable: true,
    ai: 'drain', desc: 'A sorrowful ghost. Her wail chills the living.' },
  oni: { name: 'Mountain Oni', jp: '鬼', kind: 'yokai', hp: 90, atk: 16, def: 9, agi: 7, exp: 120, gold: 70, sprite: 'enemy_oni.png',
    taunt: '“GRAAAH! LITTLE HUMAN! BIG CLUB!”', sprable: true,
    ai: 'rage', desc: 'A booming brute with an iron club. Enrages when hurt.' },
  kitsune: { name: 'Trickster Kitsune', jp: '狐', kind: 'yokai', hp: 55, atk: 12, def: 6, agi: 14, exp: 85, gold: 45, sprite: 'enemy_kitsune.png',
    taunt: '“Oh my. A diviner? How… delicious.”', sprable: true,
    ai: 'illusion', desc: 'A fox spirit of illusions. Hard to pin down.' },
  hollow_bell: { name: 'The Hollow Bell', jp: '虚ろな鐘', kind: 'yokai', hp: 170, atk: 17, def: 10, agi: 9, exp: 400, gold: 200, sprite: 'enemy_oni.png',
    taunt: 'DONG… DONG… DONG… (there is no bell. there is no bell.)', sprable: false,
    ai: 'boss', desc: 'A tolling void where a temple bell should be. The source of the disturbances.' },
  officer: { name: "Daimyo's Champion", jp: '武将', kind: 'human', hp: 80, atk: 15, def: 9, agi: 11, exp: 110, gold: 80, sprite: 'enemy_samurai.png',
    taunt: '“My lord\'s honor is MY honor. Come!”', sprable: true,
    ai: 'heavy', desc: 'A daimyo\'s sworn champion. Defeat him and the whole court will know your name.' },
};

// A champion / battlefield officer scaled to the player's level.
// Used for duels at court and for the personal skirmish when joining a battle.
export function officerFor(s, label) {
  const lv = s.player.level;
  return {
    ...ENEMIES.officer,
    name: label || ENEMIES.officer.name,
    hp: 60 + lv * 12, atk: 10 + lv * 2, def: 6 + lv, agi: 8 + lv,
    exp: 80 + lv * 15, gold: 50 + lv * 10,
  };
}

export const SPELLS = {
  ward:   { name: 'Spirit Ward', cost: 4,  desc: '+6 DEF for 3 rounds.' },
  bind:   { name: 'Spirit Bind', cost: 6,  desc: '60% chance to stun the foe 1 round.' },
  purify: { name: 'Purify',      cost: 6,  desc: 'Spirit damage (strong vs yokai).' },
  fire:   { name: 'Fire Talisman', cost: 5, desc: 'Hurl a burning talisman.' },
  banish: { name: 'Banish',      cost: 12, desc: 'Devastating vs yokai. Weak vs humans.' },
};

export const AIKO_ORDERS = {
  auto:   { name: 'Free will', desc: 'Aiko decides each round.' },
  strike: { name: 'Strike',    desc: 'Aiko attacks the foe.' },
  heal:   { name: 'Heal',      desc: 'Aiko mends your wounds (25 HP).' },
  seal:   { name: 'Seal',      desc: 'Aiko seals the foe (stun/ATK down, best vs yokai).' },
  scout:  { name: 'Scout',     desc: 'Aiko reads the foe: reveals its next move.' },
};

function dmgCalc(atk, def) { return Math.max(1, atk - def + rand(0, 3)); }

export function createCombat(state, enemyIdOrObj) {
  const base = typeof enemyIdOrObj === 'string' ? ENEMIES[enemyIdOrObj] : enemyIdOrObj;
  if (!base) throw new Error('Unknown enemy: ' + enemyIdOrObj);
  const c = {
    enemyId: typeof enemyIdOrObj === 'string' ? enemyIdOrObj : 'officer',
    enemy: { ...base, maxHp: base.hp },
    round: 0,
    log: [`${base.name} ${base.taunt}`],
    playerBuffs: { ward: 0 },
    enemyDebuffs: { atkDown: 0 },
    enemyStun: 0,
    enemyTelegraph: null, // revealed by scout or telegraphed heavies
    aikoOrder: 'auto',
    aikoCooldown: 0,
    spareOffered: false,
    over: false,
    result: null, // 'victory' | 'defeat' | 'fled'
    fled: false,
  };
  c.log.push(battleBanter(state, c));
  return c;
}

export function playerAttack(s) { return s.player.atk + passiveBonus(s).atk; }
export function playerDefense(s) { return s.player.def + passiveBonus(s).def; }

// ---------------- player phase ----------------
// action: {type:'attack'} | {type:'spell', id} | {type:'item', id} | {type:'flee'}
export function playerPhase(c, s, action) {
  const e = c.enemy, out = [];
  const pAtk = playerAttack(s), pDef = playerDefense(s) + (c.playerBuffs.ward > 0 ? 6 : 0);

  if (action.type === 'flee') {
    if (rand(1, 20) + s.player.agi > 10 + e.agi) {
      c.fled = true; c.over = true; c.result = 'fled';
      out.push('You scatter ofuda and vanish into the treeline. Aiko follows, unimpressed.');
    } else {
      out.push('You try to flee — but the way is cut off!');
    }
    return out;
  }

  if (action.type === 'attack') {
    const d = dmgCalc(pAtk, e.def);
    e.hp = Math.max(0, e.hp - d);
    out.push(`You strike with your ritual blade for ${d} damage.`);
    return out;
  }

  if (action.type === 'item') {
    const id = action.id;
    if (!hasItem(s, id)) { out.push('You have none of those.'); return out; }
    if (id === 'herb') { removeItem(s, id); healPlayer(s, 40); out.push('You chew a healing herb. +40 HP. Bitter. Effective.'); }
    else if (id === 'spirit_pill') { removeItem(s, id); s.player.rei = Math.min(s.player.maxRei, s.player.rei + 20); out.push('The spirit pill burns cold down your throat. +20 Rei.'); }
    else if (id === 'bride_charm') {
      if (e.kind !== 'yokai') { out.push('The bound bride refuses to rise against a human. She has standards.'); return out; }
      removeItem(s, id);
      const d = 35 + rand(0, 10);
      e.hp = Math.max(0, e.hp - d);
      out.push(`You unstop the charm — Oyuki's pale form engulfs the foe for ${d} damage! She bows, and is gone.`);
    }
    else { out.push('That cannot be used in battle.'); }
    return out;
  }

  if (action.type === 'spell') {
    const sp = SPELLS[action.id];
    if (!sp) { out.push('No such spell.'); return out; }
    if (!spendRei(s, sp.cost)) { out.push('Not enough rei! Your sleeves produce only lint.'); return out; }
    switch (action.id) {
      case 'ward':
        c.playerBuffs.ward = 3;
        out.push('Blue wards spiral around you. +6 DEF for 3 rounds.');
        break;
      case 'bind':
        if (Math.random() < 0.6) { c.enemyStun = 1; out.push('Spirit chains lash out — the foe is BOUND and cannot move!'); }
        else out.push('The binding chains snap short. The foe slips free!');
        break;
      case 'purify': {
        const d = dmgCalc(14 + s.player.level * 2, e.def) + (e.kind === 'yokai' ? 10 : 0);
        e.hp = Math.max(0, e.hp - d);
        out.push(`Purifying light washes over ${e.name} for ${d} damage${e.kind === 'yokai' ? ' — yokai burn bright!' : '.'}`);
        break;
      }
      case 'fire': {
        const d = dmgCalc(12 + s.player.level * 2, e.def);
        e.hp = Math.max(0, e.hp - d);
        out.push(`A talisman bursts into foxfire: ${d} damage.`);
        break;
      }
      case 'banish': {
        if (e.kind !== 'yokai') {
          const d = dmgCalc(6, e.def);
          e.hp = Math.max(0, e.hp - d);
          out.push(`Banishment sputters against a mortal soul — a mere ${d} damage.`);
        } else {
          const d = dmgCalc(26 + s.player.level * 3, e.def);
          e.hp = Math.max(0, e.hp - d);
          out.push(`“BEGONE!” The banishment hits like a temple bell: ${d} damage!`);
        }
        break;
      }
    }
    return out;
  }
  out.push('You hesitate. That is also a choice. A bad one.');
  return out;
}

// ---------------- Aiko phase ----------------
export function aikoPhase(c, s) {
  const e = c.enemy, out = [];
  if (s.aiko.hp <= 0) { out.push('Aiko is dispelled — her paper form scattered. She will reform after battle.'); return out; }
  let order = c.aikoOrder;
  if (order === 'auto') {
    if (s.player.hp / s.player.maxHp < 0.45 && s.aiko.hp > 15) order = 'heal';
    else if (e.kind === 'yokai' && Math.random() < 0.35) order = 'seal';
    else order = 'strike';
  }
  const aAtk = 8 + s.player.level * 2;
  switch (order) {
    case 'strike': {
      const d = dmgCalc(aAtk, e.def);
      e.hp = Math.max(0, e.hp - d);
      out.push(pick([
        `Aiko's paper talons rake ${e.name} for ${d} damage! “ origami hurts, doesn't it?”`,
        `Aiko darts in, a blur of white sleeves — ${d} damage!`,
      ]));
      break;
    }
    case 'heal': {
      healPlayer(s, 25);
      out.push(`Aiko presses glowing paper to your wounds. +25 HP. “Hold still, you big baby.”`);
      break;
    }
    case 'seal': {
      if (e.kind === 'yokai' && Math.random() < 0.55) { c.enemyStun = 1; out.push('Aiko slaps a sealing ward on the yokai — it is STUNNED! “Sit. Stay. Good demon.”'); }
      else { c.enemyDebuffs.atkDown = 2; out.push(`Aiko's wards weigh the foe down. Its attack falters (−3 ATK, 2 rounds).`); }
      break;
    }
    case 'scout': {
      const intent = enemyIntent(c);
      c.enemyTelegraph = intent;
      out.push(`Aiko's eyes gleam. “It's going to ${intent.label.toLowerCase()} — watch for it!”`);
      break;
    }
  }
  if (c.aikoCooldown > 0) c.aikoCooldown -= 1;
  return out;
}

function enemyIntent(c) {
  const e = c.enemy;
  switch (e.ai) {
    case 'heavy': return (c.round % 3 === 2) ? { label: 'unleash a HEAVY strike', heavy: true } : { label: 'attack normally' };
    case 'rage': return (e.hp / e.maxHp < 0.4) ? { label: 'rampage wildly', heavy: true } : { label: 'attack normally' };
    case 'boss': return (c.round % 4 === 3) ? { label: 'toll the VOID BELL', heavy: true } : { label: 'attack normally' };
    default: return { label: 'attack normally' };
  }
}

// ---------------- enemy phase ----------------
export function enemyPhase(c, s) {
  const e = c.enemy, out = [];
  if (c.over) return out;
  if (c.enemyStun > 0) { c.enemyStun -= 1; out.push(`${e.name} strains against its bonds — it cannot move!`); return out; }

  const eAtk = Math.max(1, e.atk - (c.enemyDebuffs.atkDown > 0 ? 3 : 0));
  const pDef = playerDefense(s) + (c.playerBuffs.ward > 0 ? 6 : 0);
  const targetAiko = s.aiko.hp > 0 && Math.random() < 0.25;

  const hit = (atkV, defV, who) => {
    const d = dmgCalc(atkV, defV);
    if (who === 'aiko') { s.aiko.hp = Math.max(0, s.aiko.hp - d); }
    else damagePlayer(s, d);
    return d;
  };

  switch (e.ai) {
    case 'steady':
      if (Math.random() < 0.25) { e.def += 2; out.push(`${e.name} braces behind his spear. (+2 DEF)`); }
      else out.push(`${e.name} thrusts! ${hit(eAtk, targetAiko ? 4 : pDef, targetAiko ? 'aiko' : 'player')} damage${targetAiko ? ' to Aiko!' : '.'}`);
      break;
    case 'tricky':
      if (Math.random() < 0.3) { s.player.agi = Math.max(1, s.player.agi - 1); out.push(`${e.name} kicks dust in your eyes! Your agility falters. (−1 AGI this battle)`); }
      else out.push(`${e.name} slashes wildly! ${hit(eAtk, targetAiko ? 4 : pDef, targetAiko ? 'aiko' : 'player')} damage${targetAiko ? ' to Aiko!' : '.'}`);
      break;
    case 'heavy': {
      const intent = enemyIntent(c);
      if (c.enemyTelegraph || intent.heavy) {
        const d = hit(eAtk + 6, targetAiko ? 4 : pDef, targetAiko ? 'aiko' : 'player');
        out.push(`${e.name} unleashes a HEAVY overhead cut! ${d} damage${targetAiko ? ' to Aiko!' : '!'}`);
      } else out.push(`${e.name} circles, measuring you… (a heavy strike is coming — Ward or Bind!)`);
      break;
    }
    case 'mischief':
      if (Math.random() < 0.3 && s.player.gold > 0) { const steal = Math.min(s.player.gold, rand(5, 15)); addGold(s, -steal); out.push(`${e.name} splashes you and snatches ${steal} gold! “Toll! Toll!”`); }
      else out.push(`${e.name} headbutts your shins! ${hit(eAtk, targetAiko ? 4 : pDef, targetAiko ? 'aiko' : 'player')} damage${targetAiko ? ' to Aiko!' : '.'}`);
      break;
    case 'drain':
      if (Math.random() < 0.35) {
        const d = hit(eAtk, pDef, 'player');
        e.hp = Math.min(e.maxHp, e.hp + Math.floor(d / 2));
        out.push(`${e.name} WAILS — ${d} damage, and she drinks your warmth to heal herself!`);
      } else out.push(`${e.name} claws at you with cold hands! ${hit(eAtk, targetAiko ? 4 : pDef, targetAiko ? 'aiko' : 'player')} damage${targetAiko ? ' to Aiko!' : '.'}`);
      break;
    case 'rage': {
      const enraged = e.hp / e.maxHp < 0.4;
      const d = hit(eAtk + (enraged ? 5 : 0), targetAiko ? 4 : pDef, targetAiko ? 'aiko' : 'player');
      out.push(`${e.name} ${enraged ? 'RAMPAGES, eyes blazing!' : 'swings its iron club!'} ${d} damage${targetAiko ? ' to Aiko!' : '!'}`);
      break;
    }
    case 'illusion':
      if (Math.random() < 0.35) { out.push(`${e.name} shimmers into three fox-shadows — your eyes cannot track it! (its next attack will surely hit)`); c.enemyTelegraph = { label: 'strike from nowhere', heavy: true }; }
      else out.push(`${e.name} darts between illusions! ${hit(eAtk + 2, targetAiko ? 4 : pDef, targetAiko ? 'aiko' : 'player')} damage${targetAiko ? ' to Aiko!' : '.'}`);
      break;
    case 'boss': {
      const intent = enemyIntent(c);
      if (intent.heavy) {
        const d = hit(eAtk + 8, pDef, 'player');
        out.push(`The Hollow Bell TOLLS — DONG — a wave of void slams you for ${d} damage!`);
      } else out.push(`Tendrils of hollow sound lash out! ${hit(eAtk, targetAiko ? 4 : pDef, targetAiko ? 'aiko' : 'player')} damage${targetAiko ? ' to Aiko!' : '.'}`);
      break;
    }
    default:
      out.push(`${e.name} attacks! ${hit(eAtk, targetAiko ? 4 : pDef, targetAiko ? 'aiko' : 'player')} damage${targetAiko ? ' to Aiko!' : '.'}`);
  }
  return out;
}

// ---------------- round orchestration ----------------
export function doRound(c, s, action) {
  const events = [];
  c.round += 1;
  if (c.playerBuffs.ward > 0) c.playerBuffs.ward -= 1;
  if (c.enemyDebuffs.atkDown > 0) c.enemyDebuffs.atkDown -= 1;

  // initiative: higher agi acts first between player and enemy
  const pFirst = s.player.agi + rand(0, 4) >= c.enemy.agi;
  const phases = pFirst
    ? [() => playerPhase(c, s, action), () => aikoPhase(c, s), () => enemyPhase(c, s)]
    : [() => enemyPhase(c, s), () => playerPhase(c, s, action), () => aikoPhase(c, s)];

  for (const ph of phases) {
    events.push(...ph());
    const end = checkEnd(c, s);
    if (end) break;
  }
  if (c.round % 2 === 0 && !c.over) events.push('💬 ' + battleBanter(s, c));
  const end = checkEnd(c, s);
  return { events, end };
}

export function checkEnd(c, s) {
  if (c.over) return c.result === 'fled' ? 'fled' : c.result;
  if (s.player.hp <= 0) { c.over = true; c.result = 'defeat'; return 'defeat'; }
  if (c.enemy.hp <= 0) {
    // offer spare/finish for sprable foes weakened but not overkilled
    if (c.enemy.sprable && !c.spareOffered && c.enemy.hp === 0) {
      c.spareOffered = true;
      return 'spare_offer';
    }
    c.over = true; c.result = 'victory'; return 'victory';
  }
  if (c.enemy.sprable && !c.spareOffered && c.enemy.hp / c.enemy.maxHp <= 0.3) {
    c.spareOffered = true;
    return 'spare_offer';
  }
  return null;
}

// choice: 'spare' | 'finish'
export function resolveSpare(c, s, choice) {
  const e = c.enemy, out = [];
  if (choice === 'spare') {
    const k = e.kind === 'human' ? 6 : 4;
    const kr = addKarma(s, k);
    out.push(`You lower your blade. “Live — and be better.” ${e.name} flees into the ${e.kind === 'yokai' ? 'mists' : 'treeline'}. (+${k} karma)`);
    if (e.kind === 'yokai' && Math.random() < 0.5) { addItem(s, 'herb'); out.push('Grateful, the spirit leaves a healing herb behind.'); }
    c.over = true; c.result = 'victory'; c.spared = true;
    return { out, karma: kr };
  }
  // finish
  const k = e.kind === 'human' ? -6 : 0;
  const kr = k ? addKarma(s, k) : null;
  out.push(e.kind === 'human'
    ? `No mercy. Your blade finishes it. The road is quieter — and somehow colder. (${k} karma)`
    : `You complete the banishment. Spirit motes scatter like fireflies.`);
  c.over = true; c.result = 'victory'; c.finished = true;
  return { out, karma: kr };
}

export function victoryRewards(c, s) {
  const e = c.enemy, out = [];
  const lv = addExp(s, e.exp);
  addGold(s, e.gold);
  out.push(`Victory! +${e.exp} EXP, +${e.gold} gold.`);
  if (lv.leveled) out.push(`✨ LEVEL UP! You are now level ${s.player.level}. HP/REI restored, Aiko reformed.`);
  if (Math.random() < 0.3) { addItem(s, 'herb'); out.push('You find a healing herb on the fallen foe.'); }
  return { out, leveled: lv.leveled };
}

export function defeatPenalty(s) {
  const lost = Math.min(s.player.gold, Math.floor(s.player.gold * 0.2));
  addGold(s, -lost);
  s.player.hp = Math.floor(s.player.maxHp * 0.5);
  s.player.rei = s.player.maxRei;
  s.aiko.hp = s.aiko.maxHp;
  return lost;
}
