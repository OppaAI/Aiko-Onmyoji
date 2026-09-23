// sprites.js — procedural pixel-art sprite composer for Aiko-Onmyoji.
//
// Replaces all portrait/place PNGs. Everything is drawn with fillRect on a
// small pixel grid: cute chibi FF7-overworld style, readable job/gender,
// simple faces. No image loading, no dependencies.
//
// Grid: 12 wide x 18 tall pixels per character sprite, scaled by o.scale.
// Tiles: 16 x 16 pixels each.

'use strict';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32 from an xfnv1a string hash)

function xfnv1a(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seedStr) {
  let a = xfnv1a(seedStr);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Color helpers

function shade(hex, f) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex));
  if (!m) return '#888888';
  const n = parseInt(m[1], 16);
  const cl = (v) => Math.min(255, Math.max(0, Math.round(v * f)));
  const r = cl((n >> 16) & 255), g = cl((n >> 8) & 255), b = cl(n & 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function validColor(c, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(c)) ? String(c) : fallback;
}

const SKINS = ['#ffd9b3', '#f7c08a', '#e8a06a', '#c97e4e', '#a06844'];
const HAIR_COLORS = ['#26221f', '#4a3120', '#7a4f28', '#b3813c', '#c23b2e', '#d9d2c2', '#6a4a7a', '#2e4a6a'];
const CLOTH = ['#b03a2e', '#7a2e6a', '#2e5a8a', '#2e7a4a', '#c9a227', '#e8e0d0', '#4a4a5a', '#8a4a2e', '#d46a9a', '#3a8a8a'];

// ---------------------------------------------------------------------------
// Spec builders

function clampInt(v, lo, hi, dflt) {
  v = Number(v);
  if (!Number.isFinite(v)) return dflt;
  v = Math.floor(v);
  return v < lo ? lo : v > hi ? hi : v;
}

function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

/**
 * Human spec. hairStyle: 0 bob, 1 short, 2 long, 3 topknot, 4 bald, 5 hime.
 * top: 0 kimono, 1 robe, 2 armor, 3 dress, 4 peasant.
 * hat: 0 none, 1 eboshi, 2 straw, 3 conical, 4 crown.
 * weapon: 0 none, 1 katana, 2 spear, 3 staff, 4 fan.
 */
export function humanSpec(seedStr, opts = {}) {
  const r = rng('human:' + seedStr);
  const o = opts || {};
  const gender = o.gender === 'f' ? 'f' : o.gender === 'm' ? 'm' : (r() < 0.5 ? 'm' : 'f');
  return {
    kind: 'human',
    gender,
    skin: validColor(o.skin, pick(r, SKINS)),
    hairStyle: clampInt(o.hairStyle, 0, 5, gender === 'f' ? (r() < 0.5 ? 0 : 5) : (r() < 0.6 ? 1 : 3)),
    hairColor: validColor(o.hairColor, pick(r, HAIR_COLORS)),
    top: clampInt(o.top, 0, 4, gender === 'f' ? (r() < 0.5 ? 0 : 3) : (r() < 0.5 ? 1 : 4)),
    topColor: validColor(o.topColor, pick(r, CLOTH)),
    botColor: validColor(o.botColor, pick(r, CLOTH)),
    hat: clampInt(o.hat, 0, 4, 0),
    weapon: clampInt(o.weapon, 0, 4, 0),
    blush: o.blush === true || (o.blush !== false && gender === 'f' && r() < 0.6),
    seed: String(seedStr),
  };
}

function monoSpec(seedStr, base, kind, extra = {}) {
  const r = rng(kind + ':' + seedStr);
  return Object.assign({
    kind,
    gender: r() < 0.5 ? 'm' : 'f',
    skin: base,
    hairStyle: 4,
    hairColor: shade(base, 0.7),
    top: 1,
    topColor: base,
    botColor: shade(base, 0.9),
    hat: 0,
    weapon: 0,
    blush: false,
    seed: String(seedStr),
  }, extra);
}

/** Ghost: single pale blue-white hue, semi-transparent, wispy tail. */
export function ghostSpec(seedStr) {
  return monoSpec(seedStr, '#cfe4f5', 'ghost', { alpha: 0.75 });
}

/** Demon: single red/purple hue with horns. No clashing colors. */
export function demonSpec(seedStr) {
  const r = rng('demon:' + seedStr);
  const base = r() < 0.5 ? '#a03040' : '#6a3080';
  return monoSpec(seedStr, base, 'demon', { weapon: 0 });
}

const ANIMAL_KINDS = new Set(['deer', 'rabbit', 'bird', 'dog', 'monkey', 'boar', 'wolf']);
const ANIMAL_COLORS = {
  deer: '#a5764a', rabbit: '#d9d2c2', bird: '#5a7a9a', dog: '#8a6a42',
  monkey: '#7a5a3e', boar: '#5a4a3a', wolf: '#6a6a72',
};

/**
 * Small animal spec (kind:'animal'). Drawn in drawSprite as a side-view
 * quadruped (bird drawn small with wings). `animal` names the species.
 */
export function animalSpec(kind) {
  const k = ANIMAL_KINDS.has(kind) ? kind : 'dog';
  const body = ANIMAL_COLORS[k];
  return {
    kind: 'animal', animal: k, gender: 'm',
    skin: body, hairStyle: 4, hairColor: shade(body, 0.7),
    top: 4, topColor: body, botColor: shade(body, 0.85),
    hat: 0, weapon: 0, blush: false, seed: 'animal:' + k,
  };
}

/**
 * Floating wisp spec (kind:'wisp'). Drawn in drawSprite as a glowing
 * flame-like blob; `color` tints it.
 */
export function wispSpec(color) {
  const c = validColor(color, '#7ad9e8');
  return {
    kind: 'wisp', color: c, gender: 'm',
    skin: c, hairStyle: 4, hairColor: c,
    top: 1, topColor: c, botColor: shade(c, 0.85),
    hat: 0, weapon: 0, blush: false, alpha: 0.85, seed: 'wisp',
  };
}

/** Aiko: fixed small fox-girl spec. */
export function aikoSpec() {
  return {
    kind: 'aiko', gender: 'f',
    skin: '#ffe8c8', hairStyle: 0, hairColor: '#e8963c',
    top: 0, topColor: '#d43a2e', botColor: '#f5f0e6',
    hat: 0, weapon: 0, blush: true, seed: 'aiko',
  };
}

/** Player: fixed young onmyoji man, black eboshi, white/blue kariginu. */
export function playerSpec() {
  return {
    kind: 'human', gender: 'm',
    skin: '#ffd9b3', hairStyle: 1, hairColor: '#26221f',
    top: 0, topColor: '#f2ede0', botColor: '#2e5a8a',
    hat: 1, weapon: 0, blush: false, seed: 'player',
  };
}

// ---------------------------------------------------------------------------
// NPC archetype -> spec

const FEMALE_ARCH = new Set(['princess', 'noble_lady', 'dancer', 'merchant_woman', 'villager_woman', 'onna_musha', 'innkeeper', 'miko', 'courtesan']);

export function npcSpec(npcId, npc = {}) {
  const id = String(npcId || 'npc');
  const arch = (npc && npc.archetype) || 'villager_woman';
  const seed = id;
  const isF = npc.gender ? npc.gender === 'f' : FEMALE_ARCH.has(arch);

  if (arch === 'kappa') {
    return { kind: 'kappa', gender: 'm', skin: '#5aa84a', hairStyle: 4, hairColor: '#3a7030',
      top: 4, topColor: '#4a8a3e', botColor: '#3a7030', hat: 0, weapon: 0, blush: false, seed };
  }
  if (arch === 'yurei') return ghostSpec(seed);

  const base = { gender: isF ? 'f' : 'm', seed };
  switch (arch) {
    case 'princess': // fancy kimono + crown
      return humanSpec(seed, Object.assign(base, { top: 0, topColor: '#b03a2e', botColor: '#c9a227', hat: 4, hairStyle: 5, hairColor: '#26221f', blush: true }));
    case 'noble_lady': // elegant kimono
      return humanSpec(seed, Object.assign(base, { top: 0, topColor: '#7a2e6a', botColor: '#d46a9a', hairStyle: 5, blush: true }));
    case 'dancer': // colorful dress
      return humanSpec(seed, Object.assign(base, { top: 3, hairStyle: 2, blush: true }));
    case 'merchant_woman': // nice robe
      return humanSpec(seed, Object.assign(base, { top: 1, topColor: '#2e7a8a', hairStyle: 0, blush: true }));
    case 'villager_woman': // peasant
      return humanSpec(seed, Object.assign(base, { top: 4, hairStyle: 0 }));
    case 'onna_musha': // armor + katana
      return humanSpec(seed, Object.assign(base, { top: 2, topColor: '#5a5a6a', weapon: 1, hairStyle: 3, hairColor: '#26221f' }));
    case 'innkeeper': // robe
      return humanSpec(seed, Object.assign(base, { top: 1, topColor: '#8a5a2e', hairStyle: 0, blush: true }));
    case 'miko': // red/white
      return humanSpec(seed, Object.assign(base, { top: 0, topColor: '#d43a2e', botColor: '#f5f0e6', hairStyle: 5, hairColor: '#26221f', blush: true }));
    case 'monk': // grey robe + conical hat
      return humanSpec(seed, Object.assign(base, { top: 1, topColor: '#6a6a72', botColor: '#4a4a52', hat: 3, hairStyle: 4 }));
    case 'merchant': // robe + straw hat
      return humanSpec(seed, Object.assign(base, { top: 1, hat: 2 }));
    case 'samurai': // armor + katana + topknot
      return humanSpec(seed, Object.assign(base, { top: 2, topColor: '#4a4a5a', weapon: 1, hairStyle: 3, hairColor: '#26221f' }));
    case 'noble': // dark robe + eboshi
      return humanSpec(seed, Object.assign(base, { top: 1, topColor: '#3a3a4a', hat: 1, hairStyle: 1 }));
    case 'elder': // plain robe + staff
      return humanSpec(seed, Object.assign(base, { top: 1, topColor: '#8a8a8a', weapon: 3, hairStyle: 4, hairColor: '#d9d2c2' }));
    case 'ninja': // dark hood + katana
      return humanSpec(seed, Object.assign(base, { top: 4, topColor: '#2a2a35', botColor: '#1f1f28', hairStyle: 1, hairColor: '#26221f', weapon: 1, blush: false }));
    case 'soldier': // armor + spear
      return humanSpec(seed, Object.assign(base, { top: 2, topColor: '#5a5a6a', botColor: '#3a3a48', weapon: 2, hairStyle: 1, hairColor: '#26221f' }));
    case 'bandit': // ragged + katana + straw hat
      return humanSpec(seed, Object.assign(base, { top: 4, topColor: '#6a5a48', botColor: '#4a3e30', weapon: 1, hat: 2, hairStyle: 1 }));
    case 'courtesan': // fancy dress, bright colors
      return humanSpec(seed, Object.assign(base, { top: 3, topColor: '#d46a9a', botColor: '#7a2e6a', hairStyle: 2, hairColor: '#26221f', blush: true }));
    case 'demon_brute': // hulking demon
      return demonSpec(seed);
    default:
      return humanSpec(seed, base);
  }
}

// ---------------------------------------------------------------------------
// Defensive spec sanitizer — bad spec falls back to a plain human.

const KINDS = new Set(['human', 'ghost', 'demon', 'aiko', 'kappa', 'animal', 'wisp']);

function sanitize(spec) {
  const dflt = humanSpec('fallback');
  if (!spec || typeof spec !== 'object') return dflt;
  const s = Object.assign({}, dflt, spec);
  if (!KINDS.has(s.kind)) s.kind = 'human';
  s.gender = s.gender === 'f' ? 'f' : 'm';
  s.skin = validColor(s.skin, dflt.skin);
  s.hairColor = validColor(s.hairColor, dflt.hairColor);
  s.topColor = validColor(s.topColor, dflt.topColor);
  s.botColor = validColor(s.botColor, dflt.botColor);
  s.hairStyle = clampInt(s.hairStyle, 0, 5, dflt.hairStyle);
  s.top = clampInt(s.top, 0, 4, dflt.top);
  s.hat = clampInt(s.hat, 0, 4, dflt.hat);
  s.weapon = clampInt(s.weapon, 0, 4, dflt.weapon);
  s.blush = !!s.blush;
  return s;
}

// ---------------------------------------------------------------------------
// Sprite drawing. Grid 12 x 18. All via fillRect.

const POSES = new Set(['stand', 'walk', 'talk', 'attack', 'hurt', 'kiss', 'embrace', 'lie', 'sit', 'kneel', 'fly']);

export function drawSprite(ctx, spec, px, py, o = {}) {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  spec = sanitize(spec);
  const opts = o || {};
  const scale = Math.max(1, Number(opts.scale) > 0 ? Number(opts.scale) : 3);
  const pose = POSES.has(opts.pose) ? opts.pose : 'stand';
  let facing = opts.facing || 'down';
  const frame = opts.frame ? 1 : 0;
  let flip = !!opts.flip;
  if (facing === 'left') { facing = 'right'; flip = !flip; }
  if (facing !== 'up' && facing !== 'down' && facing !== 'right') facing = 'down';

  ctx.save();
  try {
    ctx.imageSmoothingEnabled = false;
    if (opts.alpha !== undefined && opts.alpha !== 1) ctx.globalAlpha = opts.alpha;
    else if (spec.alpha !== undefined) ctx.globalAlpha = spec.alpha;

    const lying = pose === 'lie';
    // plot a grid pixel; lie pose rotates the body horizontal (18x12)
    const plot = (x, y, c) => {
      let gx = Math.round(x), gy = Math.round(y);
      if (flip) gx = 11 - gx;
      if (lying) { const t = gx; gx = gy; gy = 11 - t; }
      if (gx < -4 || gx > 21 || gy < -4 || gy > 21) return;
      ctx.fillStyle = c;
      ctx.fillRect(px + gx * scale, py + gy * scale, scale, scale);
    };
    const rect = (x0, y0, w, h, c) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plot(x0 + x, y0 + y, c);
    };

    // ---- animal / wisp kinds: simple side-view critter or glowing blob ----
    if (spec.kind === 'animal' || spec.kind === 'wisp') {
      const bobY = pose === 'walk' ? (frame ? 0 : -1) : 0;
      if (spec.kind === 'wisp') {
        const col = validColor(spec.color, '#7ad9e8');
        rect(3, 7 + bobY, 6, 8, shade(col, 0.7));
        rect(4, 5 + bobY, 4, 9, col);
        rect(5, 4 + bobY, 2, 4, '#ffffff');
        plot(5, 8 + bobY, '#ffffff'); plot(6, 10 + bobY, shade(col, 1.3));
        plot(2, 6 + bobY, col); plot(9, 12 + bobY, col); // stray sparks
        return;
      }
      const a = spec.animal || 'dog';
      const body = validColor(spec.skin, '#8a6a42');
      const dark = shade(body, 0.78), light = shade(body, 1.18);
      const eye = '#26221f';
      if (a === 'bird') {
        rect(4, 11 + bobY, 5, 3, body);            // body
        rect(3, 10 + bobY, 6, 2, dark);            // wing
        rect(8, 8 + bobY, 3, 4, body);            // head
        plot(11, 9 + bobY, '#e8a23a');            // beak
        plot(9, 9 + bobY, eye);
        rect(5, 14 + bobY, 1, 3, dark); rect(7, 14 + bobY, 1, 3, dark); // thin legs
        plot(2, 11 + bobY, dark); plot(1, 10 + bobY, dark); // tail
      } else {
        const tall = a === 'deer' || a === 'wolf';
        const by = (tall ? 9 : 10) + bobY;
        rect(3, 14 + bobY, 2, 4, dark); rect(7, 14 + bobY, 2, 4, dark); // legs
        rect(2, by, 8, 5, body); rect(2, by, 8, 1, light); // body + back highlight
        rect(9, by - 2, 4, 4, body);              // head
        rect(10, by - 1, 2, 2, light);           // muzzle
        plot(10, by - 1, eye);
        if (a === 'deer') {
          plot(9, by - 4, dark); plot(8, by - 5, dark); plot(10, by - 5, dark);
          plot(11, by - 4, dark); plot(12, by - 5, dark); // antlers
          plot(1, by + 2, light);                  // tail
        } else if (a === 'rabbit') {
          rect(9, by - 5, 2, 3, body);            // long ears
          plot(9, by - 5, '#f2a0a8');
          rect(10, by - 4, 1, 2, light);
          plot(1, by + 3, '#ffffff');             // puff tail
        } else if (a === 'dog') {
          rect(9, by - 3, 2, 2, dark);            // floppy ear
          plot(1, by + 1, dark); plot(0, by, dark); // tail
        } else if (a === 'wolf') {
          rect(9, by - 4, 2, 2, dark); rect(11, by - 4, 2, 2, dark); // pricked ears
          rect(0, by + 1, 2, 3, dark);            // bushy tail
          plot(10, by, '#c9a227');                // amber eye
        } else if (a === 'boar') {
          rect(2, by - 1, 8, 1, dark);            // bristles
          plot(12, by, '#f5f0e6');                // tusk
          rect(9, by - 3, 2, 1, dark);            // ears
        } else if (a === 'monkey') {
          rect(10, by - 1, 2, 2, light);          // face patch
          plot(10, by, eye);
          plot(1, by + 4, dark); plot(0, by + 3, dark); plot(0, by + 2, dark); // curled tail
          rect(9, by - 3, 1, 1, dark);            // ear
        }
      }
      return;
    }

    const skin = spec.skin, skinD = shade(skin, 0.85);
    const hairC = spec.hairColor, hairD = shade(hairC, 0.75);
    const topC = spec.topColor, topD = shade(topC, 0.8);
    const botC = spec.botColor, botD = shade(botC, 0.8);

    // ---- pose offsets ----
    let bobY = 0, leanX = 0, lungeX = 0, lungeY = 0, tilt = 0;
    let legOffL = 0, legOffR = 0, armPose = 'down', mouthOpen = false, eyesClosed = false, hurtTilt = 0;
    if (pose === 'walk') { bobY = frame ? 0 : -1; legOffL = frame ? 1 : -1; legOffR = frame ? -1 : 1; }
    else if (pose === 'talk') { bobY = frame ? 0 : -1; mouthOpen = true; }
    else if (pose === 'attack') {
      lungeX = facing === 'right' ? 1 : facing === 'left' ? -1 : 0;
      lungeY = facing === 'down' ? 1 : facing === 'up' ? -1 : 0;
      armPose = 'raised';
    }
    else if (pose === 'hurt') { hurtTilt = 1; eyesClosed = true; mouthOpen = true; }
    else if (pose === 'kiss') { leanX = 1; eyesClosed = true; armPose = 'out'; }
    else if (pose === 'embrace') { armPose = 'out'; }
    else if (pose === 'sit' || pose === 'kneel') { bobY = 2; }
    else if (pose === 'fly') { tilt = 1; bobY = -1; }

    const ox = leanX + lungeX + hurtTilt; // global x shift
    const oy = bobY + lungeY;

    const isGhost = spec.kind === 'ghost';
    const isDemon = spec.kind === 'demon';
    const isAiko = spec.kind === 'aiko';
    const isKappa = spec.kind === 'kappa';

    // ---- tail / wings behind body ----
    if (isAiko) {
      const fur = '#e8963c', furD = '#c97a28';
      for (let i = 0; i < 5; i++) { plot(11 + (i >> 1), 10 + i, fur); plot(10 + (i >> 1), 10 + i, furD); }
      plot(13, 14, '#f5f0e6'); plot(12, 14, '#f5f0e6');
    }
    if (isKappa) { // shell on back
      rect(1, 8, 10, 6, '#3a7030'); rect(2, 9, 8, 4, '#4a8a3e');
    }

    // ---- legs (ghost: wispy tail instead) ----
    if (isGhost) {
      for (let i = 0; i < 4; i++) { plot(4 + (i % 2), 14 + i, spec.topColor); plot(7 - (i % 2), 14 + i, spec.topColor); }
      plot(5, 17, shade(spec.topColor, 0.8));
    } else if (pose === 'sit') {
      rect(2 + ox, 14 + oy, 8, 3, botC); rect(2 + ox, 14 + oy, 8, 1, botD);
    } else if (pose === 'kneel') {
      rect(3 + ox, 14 + oy, 2, 4, botC); rect(7 + ox, 15 + oy, 3, 2, botD);
    } else {
      rect(3 + ox, 14 + oy + legOffL, 2, 4 - Math.max(0, legOffL), botC);
      rect(7 + ox, 14 + oy + legOffR, 2, 4 - Math.max(0, legOffR), botC);
      rect(3 + ox, 14 + oy + legOffL, 2, 1, botD); // shading
    }

    // ---- torso ----
    const torsoY = 8 + oy, torsoX = 2 + ox + (tilt ? 1 : 0);
    if (spec.top === 2) { // armor
      rect(torsoX, torsoY, 8, 6, topC);
      for (let i = 0; i < 3; i++) rect(torsoX, torsoY + 1 + i * 2, 8, 1, topD);
      rect(torsoX - 1, torsoY, 2, 2, topD); rect(torsoX + 7, torsoY, 2, 2, topD); // pauldrons
      rect(torsoX + 3, torsoY + 2, 2, 2, shade(topC, 1.2)); // chest emblem
    } else if (spec.top === 3) { // dress (flared)
      rect(torsoX + 1, torsoY, 6, 3, topC);
      rect(torsoX, torsoY + 3, 8, 3, topC); rect(torsoX, torsoY + 3, 8, 1, topD);
      plot(torsoX + 3, torsoY + 1, shade(topC, 1.25)); plot(torsoX + 4, torsoY + 1, shade(topC, 1.25));
    } else if (spec.top === 4) { // peasant
      rect(torsoX, torsoY, 8, 6, topC);
      plot(torsoX + 5, torsoY + 3, topD); plot(torsoX + 6, torsoY + 4, topD); // patches
    } else { // kimono / robe
      rect(torsoX, torsoY, 8, 6, topC);
      // V collar
      plot(torsoX + 3, torsoY, skinD); plot(torsoX + 4, torsoY, skinD);
      plot(torsoX + 3, torsoY + 1, topD); plot(torsoX + 4, torsoY + 1, topD);
      // obi belt
      const obi = spec.top === 0 ? shade('#c9a227', 1) : topD;
      rect(torsoX, torsoY + 3, 8, 2, obi);
      if (spec.top === 0) plot(torsoX + 3, torsoY + 3, shade(obi, 0.7)); // knot
    }

    // ---- arms ----
    const armY = 8 + oy;
    const sleeve = spec.top === 2 ? topD : topC;
    if (armPose === 'out' || pose === 'embrace' || pose === 'kiss') {
      rect(ox - 2, armY + 1, 4, 2, sleeve); rect(ox + 10, armY + 1, 4, 2, sleeve);
      plot(ox - 2, armY + 1, skin); plot(ox + 13, armY + 1, skin);
    } else if (armPose === 'raised') {
      const wx = facing === 'right' ? 11 : 0;
      rect(ox + (facing === 'right' ? 10 : 0), armY - 3, 2, 5, sleeve);
      plot(ox + wx, armY - 4, skin);
    } else {
      rect(0 + ox, armY, 2, 5, sleeve); rect(10 + ox, armY, 2, 5, sleeve);
      plot(0 + ox, armY + 5, skin); plot(11 + ox, armY + 5, skin);
    }

    // ---- head ----
    const headX = 2 + ox + (tilt ? 2 : 0), headY = 1 + oy + (tilt ? 0 : 0);
    const hw = isAiko ? 7 : 8, hx = isAiko ? 3 : 2;
    rect(headX + (hx - 2), headY, hw, 7, skin);
    rect(headX + (hx - 2), headY + 5, hw, 2, skinD); // chin shade

    // fox ears (aiko)
    if (isAiko) {
      const fur = '#e8963c';
      rect(headX + 1, headY - 3, 3, 3, fur); rect(headX + 6, headY - 3, 3, 3, fur);
      rect(headX + 2, headY - 2, 1, 2, '#f5f0e6'); rect(headX + 7, headY - 2, 1, 2, '#f5f0e6');
    }
    // demon horns
    if (isDemon) {
      const horn = shade(spec.skin, 1.4);
      plot(headX + 1, headY - 2, horn); plot(headX + 2, headY - 3, horn);
      plot(headX + 8, headY - 2, horn); plot(headX + 7, headY - 3, horn);
    }

    // ---- hair ----
    const hs = spec.hairStyle;
    const drawHairTop = () => { rect(headX + (hx - 2), headY - 1, hw, 3, hairC); };
    if (facing === 'up') {
      rect(headX + (hx - 2), headY - 1, hw, 8, hairC); // back of head
    } else if (hs === 0) { // bob
      drawHairTop(); rect(headX - 1, headY + 1, 2, 6, hairC); rect(headX + 8, headY + 1, 2, 6, hairC);
      if (!isAiko) { rect(headX + (hx - 2), headY + 7, hw, 1, hairC); }
    } else if (hs === 1) { // short
      drawHairTop(); plot(headX - 1, headY + 2, hairC); plot(headX + 8, headY + 2, hairC);
    } else if (hs === 2) { // long
      drawHairTop(); rect(headX - 1, headY + 1, 2, 11, hairC); rect(headX + 8, headY + 1, 2, 11, hairC);
    } else if (hs === 3) { // topknot
      drawHairTop(); rect(headX + 4, headY - 3, 3, 2, hairC); plot(headX + 5, headY - 4, hairD);
    } else if (hs === 5) { // hime
      drawHairTop(); rect(headX - 1, headY + 1, 2, 10, hairC); rect(headX + 8, headY + 1, 2, 10, hairC);
      rect(headX + 2, headY + 1, hw - 2, 1, hairD); // fringe
    }
    // hs 4 = bald: nothing

    // ---- face ----
    const eyeC = isDemon ? '#3a0a0a' : '#26221f';
    const ex1 = headX + 1, ex2 = headX + 6, ey = headY + 3;
    if (facing === 'right') {
      if (eyesClosed) rect(headX + 5, ey, 2, 1, eyeC);
      else { plot(headX + 5, ey, '#ffffff'); plot(headX + 6, ey, eyeC); }
      plot(headX + 7, ey + 1, skinD); // nose hint
    } else if (facing !== 'up') {
      if (eyesClosed || pose === 'kiss') { rect(ex1, ey, 2, 1, eyeC); rect(ex2, ey, 2, 1, eyeC); }
      else if (isAiko || spec.blush) {
        // big cute eyes
        rect(ex1, ey - 1, 2, 3, '#ffffff'); rect(ex2, ey - 1, 2, 3, '#ffffff');
        plot(ex1, ey, eyeC); plot(ex2, ey, eyeC);
        plot(ex1, ey - 1, '#ffffff');
      } else {
        plot(ex1, ey, eyeC); plot(ex1 + 1, ey, eyeC);
        plot(ex2, ey, eyeC); plot(ex2 + 1, ey, eyeC);
        if (isGhost) { plot(ex1, ey - 1, shade(eyeC, 2)); } // hollow look
      }
      if (spec.blush && !isDemon) { plot(ex1 - 1, ey + 2, '#f0a0a0'); plot(ex2 + 2, ey + 2, '#f0a0a0'); }
      // mouth
      const my = headY + 5;
      if (mouthOpen) rect(headX + 4, my, 2, 1, '#7a2e2e');
      else if (pose === 'kiss') plot(headX + 5, my, '#c96a6a');
      else if (isDemon) { plot(headX + 3, my, '#3a0a0a'); plot(headX + 6, my, '#3a0a0a'); plot(headX + 4, my + 1, '#3a0a0a'); plot(headX + 5, my + 1, '#3a0a0a'); }
      else plot(headX + 4, my, '#b06a5a');
    }

    // ---- hat ----
    const hy = headY - 1;
    if (spec.hat === 1) { // eboshi (tall black cap)
      rect(headX + 3, hy - 4, 4, 4, '#1f1c1a');
      plot(headX + 6, hy - 5, '#1f1c1a'); plot(headX + 7, hy - 4, '#1f1c1a');
      rect(headX + 2, hy, 8, 1, '#1f1c1a');
    } else if (spec.hat === 2) { // straw hat
      rect(headX - 1, hy, 12, 2, '#d9b96a'); rect(headX + 2, hy, 6, 1, '#b8964a');
    } else if (spec.hat === 3) { // conical
      rect(headX + 3, hy - 2, 4, 1, '#8a6a3e'); rect(headX + 2, hy - 1, 6, 1, '#8a6a3e'); rect(headX + 1, hy, 8, 1, '#6a4f2e');
    } else if (spec.hat === 4) { // crown
      rect(headX + 2, hy, 8, 2, '#c9a227');
      plot(headX + 2, hy - 1, '#c9a227'); plot(headX + 5, hy - 1, '#c9a227'); plot(headX + 8, hy - 1, '#c9a227');
      plot(headX + 5, hy, '#d43a5e');
    }

    // ---- weapon ----
    const wy = 8 + oy;
    if (spec.weapon === 1) { // katana at hip / swung
      if (armPose === 'raised') {
        const sx = facing === 'right' ? 13 : -2;
        for (let i = 0; i < 4; i++) plot(ox + sx + (facing === 'right' ? i : -i), wy - 5 + i, '#d9d9e2');
        plot(ox + sx, wy - 5, '#8a6a3e');
        // swing arc
        plot(ox + sx + 1, wy - 6, '#ffffff'); plot(ox + sx + 2, wy - 5, '#ffffff');
      } else {
        const wx = flip ? 0 : 10;
        for (let i = 0; i < 4; i++) plot(ox + wx + (flip ? -i : i), wy + 4 + i, '#d9d9e2');
        plot(ox + wx, wy + 4, '#5a3a1e');
      }
    } else if (spec.weapon === 2) { // spear
      const wx = flip ? 1 : 10;
      rect(ox + wx, wy - 6, 1, 16, '#6a4f2e');
      plot(ox + wx, wy - 8, '#d9d9e2'); plot(ox + wx, wy - 7, '#d9d9e2');
    } else if (spec.weapon === 3) { // staff
      const wx = flip ? 1 : 10;
      rect(ox + wx, wy - 4, 1, 14, '#7a5a3a');
      plot(ox + wx, wy - 5, '#c9a227');
    } else if (spec.weapon === 4) { // fan in hand
      const wx = flip ? 0 : 11;
      rect(ox + wx - 1, wy + 2, 3, 3, '#e8e0d0');
      plot(ox + wx, wy + 2, '#d43a5e'); plot(ox + wx, wy + 4, '#d43a5e');
    }

    // ---- pose extras ----
    if (pose === 'fly') { // motion lines behind
      const lc = 'rgba(255,255,255,0.6)';
      ctx.fillStyle = lc;
      for (let i = 0; i < 3; i++) ctx.fillRect(px + (flip ? 14 : -4) * scale, py + (6 + i * 4 + oy) * scale, 3 * scale, scale);
    }
    if (pose === 'attack') { // impact star at weapon tip
      const sx = facing === 'right' ? 16 : -4;
      ctx.fillStyle = '#ffe97a';
      ctx.fillRect(px + (ox + sx) * scale, py + (wy - 6) * scale, scale, scale);
      ctx.fillRect(px + (ox + sx + 1) * scale, py + (wy - 5) * scale, scale, scale);
    }
    if (pose === 'hurt') { // pain marks
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(px + (headX + 9) * scale, py + (headY - 2) * scale, scale, scale);
      ctx.fillRect(px + (headX + 10) * scale, py + (headY - 1) * scale, scale, scale);
    }
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Aiko's big chat face. size = pixel size of the face square.

const AIKO_MOODS = new Set(['happy', 'sad', 'angry', 'surprised', 'love']);

export function drawAikoFace(ctx, x, y, size, mood = 'happy') {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  const m = AIKO_MOODS.has(mood) ? mood : 'happy';
  const n = 16, c = Math.max(1, size / n);
  ctx.save();
  try {
    ctx.imageSmoothingEnabled = false;
    const R = (gx, gy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x + gx * c, y + gy * c, w * c, h * c); };
    const fur = '#e8963c', furD = '#c97a28', cream = '#ffe8c8', inner = '#f5d0d8';

    // ears
    R(1, 0, 4, 4, fur); R(11, 0, 4, 4, fur);
    R(2, 1, 2, 3, inner); R(12, 1, 2, 3, inner);
    R(1, 0, 4, 1, furD); R(11, 0, 4, 1, furD);
    // face base (rounded)
    R(3, 3, 10, 10, cream);
    R(2, 5, 12, 6, cream);
    R(4, 2, 8, 1, fur); R(3, 3, 1, 2, fur); R(12, 3, 1, 2, fur); // fur fringe
    // blush
    R(2, 9, 2, 2, '#f2a0a8'); R(12, 9, 2, 2, '#f2a0a8');

    const eyeW = '#ffffff', eyeB = '#4a2e1a';
    const ey = 7;
    if (m === 'love') {
      // heart eyes
      R(4, ey, 3, 1, '#e84a6a'); R(3, ey + 1, 5, 2, '#e84a6a'); R(4, ey + 3, 3, 1, '#e84a6a');
      R(9, ey, 3, 1, '#e84a6a'); R(8, ey + 1, 5, 2, '#e84a6a'); R(9, ey + 3, 3, 1, '#e84a6a');
    } else {
      // big eyes with shine
      R(3, ey - 1, 4, 5, eyeW); R(9, ey - 1, 4, 5, eyeW);
      R(4, ey, 2, 4, eyeB); R(10, ey, 2, 4, eyeB);
      R(4, ey, 1, 1, eyeW); R(10, ey, 1, 1, eyeW);
      if (m === 'happy') { R(3, ey + 4, 4, 1, eyeB); R(9, ey + 4, 4, 1, eyeB); } // closed happy arcs (lower lash)
      if (m === 'sad' || m === 'angry') { R(3, ey - 1, 4, 1, eyeB); R(9, ey - 1, 4, 1, eyeB); }
    }
    if (m === 'angry') { // angled brows
      R(3, 5, 3, 1, furD); R(4, 6, 2, 1, furD);
      R(10, 5, 3, 1, furD); R(10, 6, 2, 1, furD);
    }
    if (m === 'surprised') { R(3, 5, 4, 1, furD); R(9, 5, 4, 1, furD); } // raised brows

    // mouth
    const my = 12;
    if (m === 'happy' || m === 'love') { R(6, my, 4, 1, '#a04a3a'); R(7, my + 1, 2, 1, '#a04a3a'); }
    else if (m === 'sad') { R(7, my + 1, 2, 1, '#a04a3a'); R(6, my, 1, 1, '#a04a3a'); R(9, my, 1, 1, '#a04a3a'); }
    else if (m === 'angry') { R(6, my + 1, 4, 1, '#a04a3a'); }
    else if (m === 'surprised') { R(7, my, 2, 2, '#a04a3a'); }

    // tiny fang for happy
    if (m === 'happy') R(6, my + 1, 1, 1, '#ffffff');
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Tiles. 16x16 grid each. variant = deterministic decoration / water phase.

export const T = {
  GRASS: 0, WATER: 1, TREE: 2, ROCK: 3, WALL: 4, FLOOR: 5, DOOR: 6,
  ROAD: 7, FLOWER: 8, SAND: 9, BRIDGE: 10, VOID: 11, STAIR: 12,
  HOUSE: 13, BAR: 14, BROTHEL: 15, SHOP: 16, INN: 17, SHRINEH: 18,
};

const TILE_IDS = new Set(Object.values(T));

export function drawTile(ctx, t, px, py, size, variant = 0) {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  if (!TILE_IDS.has(t)) t = T.VOID;
  const n = 16, c = size / n;
  const v = Math.abs(Math.floor(Number(variant))) || 0;
  ctx.save();
  try {
    ctx.imageSmoothingEnabled = false;
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(px + x * c, py + y * c, w * c, h * c); };
    const r = rng('tile:' + t + ':' + v);
    const tuft = (x, y) => { R(x, y, 1, 2, '#3e8a3c'); R(x + 1, y + 1, 1, 1, '#3e8a3c'); };

    const grassBase = () => {
      R(0, 0, 16, 16, '#5aa84a');
      R(0, 0, 16, 2, '#63b854'); R(0, 14, 16, 2, '#4f9a42');
      for (let i = 0; i < 3; i++) tuft(1 + Math.floor(r() * 13), 2 + Math.floor(r() * 11));
    };

    switch (t) {
      case T.GRASS: grassBase(); break;
      case T.WATER: {
        R(0, 0, 16, 16, '#3a7ac9');
        R(0, 0, 16, 3, '#4a8ad9'); R(0, 13, 16, 3, '#2e6ab5');
        const off = v % 4;
        for (let i = 0; i < 3; i++) {
          const wy = 4 + i * 4, wx = (off + i * 5) % 12;
          R(wx, wy, 4, 1, '#8abce8'); R(wx + 1, wy + 1, 2, 1, '#6aa8dc');
        }
        break;
      }
      case T.TREE:
        grassBase();
        R(7, 10, 2, 6, '#6a4f2e'); R(7, 10, 1, 6, '#7a5f3e');
        R(4, 3, 8, 7, '#2e7a3a'); R(5, 2, 6, 2, '#3e8a4a');
        R(5, 4, 2, 2, '#4f9a52'); R(9, 6, 2, 2, '#256a30');
        break;
      case T.ROCK:
        grassBase();
        R(4, 7, 8, 7, '#8a8a92'); R(5, 6, 6, 2, '#9a9aa2');
        R(4, 7, 8, 2, '#a5a5ad'); R(5, 11, 2, 2, '#6a6a72');
        break;
      case T.WALL:
        R(0, 0, 16, 16, '#8a6a42');
        for (let i = 0; i < 4; i++) R(i * 4, 0, 1, 16, '#6a4f2e');
        R(0, 3, 16, 2, '#5a4226'); R(0, 11, 16, 2, '#5a4226');
        R(0, 0, 16, 1, '#a5825a');
        break;
      case T.FLOOR: // tatami
        R(0, 0, 16, 16, '#c9b98a');
        R(0, 7, 16, 1, '#8a7a5a'); R(7, 0, 1, 16, '#8a7a5a');
        R(0, 0, 16, 1, '#a89a72'); R(0, 15, 16, 1, '#a89a72');
        R(2 + (v % 3), 3, 3, 2, '#b5a67e');
        break;
      case T.DOOR:
        R(0, 0, 16, 16, '#6a4f2e');
        R(2, 1, 12, 14, '#8a6a42');
        R(4, 3, 8, 10, '#5a4226');
        R(4, 3, 8, 2, '#6a5232'); R(4, 8, 8, 1, '#6a5232');
        R(11, 7, 2, 2, '#c9a227'); // handle
        break;
      case T.ROAD:
        R(0, 0, 16, 16, '#b59a6a');
        for (let i = 0; i < 5; i++) R(1 + Math.floor(r() * 14), 1 + Math.floor(r() * 14), 2, 1, '#9a8058');
        R(0, 0, 2, 16, '#5aa84a'); R(14, 0, 2, 16, '#5aa84a'); // grassy edges
        break;
      case T.FLOWER: {
        grassBase();
        const cols = ['#e87aa0', '#f5f0f5', '#e8c93a'];
        for (let i = 0; i < 3; i++) {
          const fx = 2 + Math.floor(r() * 11), fy = 3 + Math.floor(r() * 9);
          R(fx, fy - 2, 1, 2, '#3e8a3c');
          R(fx - 1, fy - 1, 3, 3, cols[(v + i) % 3]); R(fx, fy, 1, 1, '#e8c93a');
        }
        break;
      }
      case T.SAND:
        R(0, 0, 16, 16, '#e0c98f');
        for (let i = 0; i < 6; i++) R(1 + Math.floor(r() * 14), 1 + Math.floor(r() * 14), 1, 1, '#c9b078');
        break;
      case T.BRIDGE:
        R(0, 0, 16, 16, '#3a7ac9');
        R(0, 5, 16, 1, '#8abce8');
        for (let i = 0; i < 8; i++) R(0, i * 2, 16, 1, '#6a4f2e');
        for (let i = 0; i < 8; i++) R(0, i * 2, 16, 1, '#8a6a42');
        R(0, 1, 16, 1, '#a5825a');
        R(1, 0, 1, 16, '#5a4226'); R(14, 0, 1, 16, '#5a4226'); // rails
        break;
      case T.STAIR:
        R(0, 0, 16, 16, '#6a6a72');
        for (let i = 0; i < 4; i++) {
          R(0, i * 4, 16, 1, '#9a9aa2');
          R(0, i * 4 + 1, 16, 3, '#7a7a82');
        }
        break;
      case T.HOUSE: case T.BAR: case T.BROTHEL: case T.SHOP: case T.INN: case T.SHRINEH: {
        grassBase();
        // roof color varies by variant: 0 thatch, 1 dark tile, 2 plaster white
        const roofs = ['#a5825a', '#3a3a4a', '#e8e0d0'];
        let roof = roofs[v % 3], roofD = shade(roofs[v % 3], 0.72);
        if (t === T.SHRINEH) { roof = '#2e2e3a'; roofD = '#1e1e28'; }
        // roof
        R(4, 1, 8, 2, shade(roof, 1.15));
        R(2, 3, 12, 2, roof);
        R(0, 5, 16, 2, roofD);
        R(0, 5, 16, 1, shade(roof, 1.2)); // ridge highlight
        // walls
        const wallC = t === T.SHRINEH ? '#b03a2e' : '#d9cbb0';
        R(2, 7, 12, 7, wallC);
        R(2, 7, 12, 1, shade(wallC, 0.85));
        // timber frame
        R(2, 7, 1, 7, '#6a4f2e'); R(13, 7, 1, 7, '#6a4f2e'); R(7, 7, 2, 7, '#6a4f2e');
        R(2, 7, 12, 1, '#6a4f2e');
        // door
        R(4, 10, 3, 4, '#5a4226'); R(4, 10, 3, 1, '#6a5232');
        if (t === T.BAR) {
          R(13, 8, 2, 3, '#d43a2e'); R(13, 8, 2, 1, '#f0665a'); // red lantern
          R(8, 8, 6, 2, '#2e5a8a'); R(10, 8, 1, 2, '#d9cbb0'); R(12, 8, 1, 2, '#d9cbb0'); // noren
        } else if (t === T.BROTHEL) {
          R(1, 8, 2, 3, '#e87aa0'); R(13, 8, 2, 3, '#e87aa0'); // pink lanterns
          R(1, 8, 2, 1, '#f5a8c0'); R(13, 8, 2, 1, '#f5a8c0');
          R(8, 10, 3, 4, '#7a2e4a'); // lacquered door
        } else if (t === T.SHOP) {
          for (let i = 0; i < 6; i++) R(2 + i * 2, 7, 2, 2, i % 2 ? '#f5f0e6' : '#b03a2e'); // striped awning
          R(2, 9, 12, 1, '#6a4f2e');
        } else if (t === T.INN) {
          R(8, 8, 6, 2, '#2e5a8a'); R(10, 8, 2, 2, '#f5f0e6'); // blue noren with crest
        } else if (t === T.SHRINEH) {
          R(2, 7, 2, 7, '#8a2e22'); R(12, 7, 2, 7, '#8a2e22'); // red pillars
          R(5, 14, 6, 2, '#8a8a92'); // stone steps
          R(7, 9, 2, 2, '#c9a227'); // offering-box glint
        }
        break;
      }
      case T.VOID:
      default:
        R(0, 0, 16, 16, '#0e0e1e');
        for (let i = 0; i < 4; i++) {
          const sx = Math.floor(r() * 15), sy = Math.floor(r() * 15);
          R(sx, sy, 1, 1, '#8a8ab5');
        }
        break;
    }
  } finally {
    ctx.restore();
  }
}
