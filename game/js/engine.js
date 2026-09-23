// engine.js — tile-walk game engine: canvas renderer, movement, collision,
// entities (player, Aiko spirit, NPCs), click-to-move, choreography player.
// Pure-ish: rendering + simulation. UI/panels live in main.js via callbacks.
import * as Spr from './sprites.js';
import * as TM from './tilemaps.js';
import * as DLG from './dialogue.js';

export const TILE_PX = 32;

export class World {
  constructor(canvas, S, hooks = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.S = S;
    this.hooks = hooks; // {toast(msg), onWarp(label), onBumpDoor(door), interact(npcId)}
    this.map = null; this.mapId = null;
    this.player = null; this.aiko = null; this.npcs = [];
    this.path = []; this.moveT = 0; this.keys = {};
    this.choreo = null; // {beats, i, timer, actors:{self:{...}, others:{id:{...}}}}
    this.time = 0; this.frame = 0;
    this.possessed = null; // npcId Aiko is inside, or null
    this.aikoMode = 'follow'; // follow|fly|hide
    this.pendingInteract = null;
  }

  loadLocation(locId) {
    const map = TM.getMap(locId);
    this.map = map; this.mapId = locId;
    this.S.player.location = locId;
    const [px, py] = map.spawns.player;
    this.player = { x: px, y: py, fx: px, fy: py, facing: 'down', moving: false, walkT: 0, spec: Spr.playerSpec() };
    this.aiko = { x: px, y: py + 1, fx: px, fy: py + 1, facing: 'down', spec: Spr.aikoSpec(), bob: Math.random() * 6 };
    this.npcs = [];
    for (const [id, [nx, ny]] of Object.entries(map.npcSpots || {})) {
      const rec = DLG.NPCS[id];
      if (!rec) continue;
      this.npcs.push({ id, rec, x: nx, y: ny, fx: nx, fy: ny, facing: 'down', spec: Spr.npcSpec(id, rec), wanderT: 2 + Math.random() * 4, pose: 'stand', poseT: 0, dx: 0, dy: 0 });
    }
    this.path = []; this.choreo = null; this.possessed = null;
  }

  npcById(id) { return this.npcs.find(n => n.id === id); }
  tileBlocked(x, y, spirit) { return TM.isBlocked(this.map, x, y, this.S, spirit); }

  // ---- movement ----
  tryStep(dx, dy) {
    const mover = this.possessed ? this.npcById(this.possessed) : this.player;
    if (!mover || this.choreo) return false;
    const nx = mover.x + dx, ny = mover.y + dy;
    mover.facing = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
    if (this.tileBlocked(nx, ny, false)) { this.bump(nx, ny); return false; }
    mover.x = nx; mover.y = ny; mover.moving = true; mover.walkT = 0;
    this.afterStep();
    return true;
  }
  bump(x, y) {
    const ch = TM.tileAt(this.map, x, y);
    if (ch === 'D') {
      const door = (this.map.lockedDoors || []).find(d => d.x === x && d.y === y);
      if (door && this.hooks.onBumpDoor) this.hooks.onBumpDoor(door);
      else if (this.hooks.toast) this.hooks.toast('A closed door. It won\'t budge.');
    }
    const warp = (this.map.warps || []).find(w => w.x === x && w.y === y);
    void warp;
  }
  afterStep() {
    const p = this.player;
    const warp = (this.map.warps || []).find(w => w.x === p.x && w.y === p.y);
    if (warp && !this._warpCool) {
      this._warpCool = true;
      setTimeout(() => { this._warpCool = false; }, 800);
      if (this.hooks.onWarp) this.hooks.onWarp(warp);
    }
  }
  queuePath(path) { this.path = path.slice(0, 60); }

  // ---- per-frame ----
  update(dt) {
    this.time += dt; this.frame++;
    const stepMs = 170;
    // keyboard movement
    if (!this.choreo) {
      const k = this.keys;
      let dx = 0, dy = 0;
      if (k.up) dy = -1; else if (k.down) dy = 1; else if (k.left) dx = -1; else if (k.right) dx = 1;
      this.moveT += dt * 1000;
      if ((dx || dy) && this.moveT >= stepMs) { this.moveT = 0; this.tryStep(dx, dy); }
      else if (this.path.length && this.moveT >= stepMs * 0.8) {
        this.moveT = 0;
        const [tx, ty] = this.path[0];
        const mover = this.possessed ? this.npcById(this.possessed) : this.player;
        if (mover && Math.abs(tx - mover.x) + Math.abs(ty - mover.y) === 1) {
          this.path.shift();
          this.tryStep(tx - mover.x, ty - mover.y);
        } else this.path = [];
      }
    }
    // smooth pixel positions
    for (const e of [this.player, this.aiko, ...this.npcs]) {
      if (!e) continue;
      e.fx += (e.x - e.fx) * Math.min(1, dt * 10);
      e.fy += (e.y - e.fy) * Math.min(1, dt * 10);
    }
    // Aiko follow (spirit: ignores collision)
    if (this.aikoMode !== 'hide' && !this.possessed) {
      const a = this.aiko, p = this.player;
      const dist = Math.abs(a.x - p.x) + Math.abs(a.y - p.y);
      if (dist > 2) {
        const path = TM.findPath(this.map, a.x, a.y, p.x, p.y, this.S, true);
        if (path.length) { const [nx, ny] = path[0]; a.x = nx; a.y = ny; a.facing = ny < a.fy ? 'up' : ny > a.fy ? 'down' : nx < a.fx ? 'left' : 'right'; }
      }
      a.bob += dt * 3;
    }
    // NPC wander
    if (!this.choreo) for (const n of this.npcs) {
      if (this.possessed === n.id) continue;
      n.wanderT -= dt;
      if (n.wanderT <= 0) {
        n.wanderT = 3 + Math.random() * 5;
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const [dx, dy] = dirs[(Math.random() * 4) | 0];
        const nx = n.x + dx, ny = n.y + dy;
        const occupied = this.npcs.some(o => o !== n && o.x === nx && o.y === ny) || (this.player.x === nx && this.player.y === ny);
        if (!this.tileBlocked(nx, ny, false) && !occupied) { n.x = nx; n.y = ny; n.facing = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right'; }
      }
    }
    // face player when adjacent
    for (const n of this.npcs) {
      if (Math.abs(n.x - this.player.x) + Math.abs(n.y - this.player.y) === 1) {
        n.facing = n.x < this.player.x ? 'right' : n.x > this.player.x ? 'left' : n.y < this.player.y ? 'down' : 'up';
      }
    }
    // choreography advance
    if (this.choreo) {
      this.choreo.timer -= dt;
      if (this.choreo.timer <= 0) this.choreoNext();
    }
  }

  // ---- choreography ----
  playChoreo(beats, actors, onDone) {
    // actors: {self:{pose,dx,dy}, [npcId]:{pose,dx,dy}}
    this.choreo = { beats, i: -1, timer: 0, actors: actors || {}, onDone };
    this.path = [];
    this.choreoNext();
  }
  choreoNext() {
    const c = this.choreo;
    c.i++;
    if (c.i >= c.beats.length) {
      const done = c.onDone;
      this.choreo = null;
      for (const n of this.npcs) { n.pose = 'stand'; n.dx = 0; n.dy = 0; }
      if (done) done();
      return;
    }
    const b = c.beats[c.i];
    this.applyActorPose('self', b, c.actors.self);
    for (const n of this.npcs) this.applyActorPose(n.id, b, c.actors[n.id]);
    if (this.hooks.onChoreoBeat) this.hooks.onChoreoBeat(b, c.i, c.beats.length);
    c.timer = b.hold || 2.2;
  }
  applyActorPose(id, beat, actorCfg) {
    const isSelf = id === 'self';
    const ent = isSelf ? this.player : this.npcById(id);
    if (!ent) return;
    const pose = beat[isSelf ? 'poseSelf' : 'poseNpc'] || (actorCfg && actorCfg.pose) || 'stand';
    const dx = beat[isSelf ? 'dxSelf' : 'dxNpc'] || 0;
    const dy = beat[isSelf ? 'dySelf' : 'dyNpc'] || 0;
    if (isSelf) { this._selfPose = pose; this._selfDx = dx; this._selfDy = dy; }
    else { ent.pose = pose; ent.dx = dx; ent.dy = dy; }
    // arrangement: pull actors together
    if (beat.arrangement === 'close' && !isSelf && ent) {
      const p = this.player;
      const sx = Math.sign(ent.x - p.x), sy = Math.sign(ent.y - p.y);
      ent.dx += -sx * 6; ent.dy += -sy * 4;
    }
  }
  choreoSkip() { if (this.choreo) { this.choreo.timer = 0; } }

  // ---- render ----
  render() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    ctx.fillStyle = '#05060c'; ctx.fillRect(0, 0, W, H);
    if (!this.map) return;
    const cam = this.camera(W, H);
    const t0x = Math.max(0, Math.floor(cam.x / TILE_PX)), t1x = Math.min(23, Math.ceil((cam.x + W) / TILE_PX));
    const t0y = Math.max(0, Math.floor(cam.y / TILE_PX)), t1y = Math.min(17, Math.ceil((cam.y + H) / TILE_PX));
    const v = (x, y) => (x * 7 + y * 13 + this.mapId.length) % 3;
    for (let y = t0y; y <= t1y; y++) for (let x = t0x; x <= t1x; x++) {
      const ch = TM.tileAt(this.map, x, y);
      Spr.drawTile(ctx, Spr.T[this.tileName(ch)] ?? Spr.T.VOID, x * TILE_PX - cam.x, y * TILE_PX - cam.y, TILE_PX, v(x, y));
    }
    // warp sparkles
    for (const w of this.map.warps || []) {
      const sx = w.x * TILE_PX - cam.x, sy = w.y * TILE_PX - cam.y;
      if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) continue;
      ctx.fillStyle = `rgba(255,220,120,${0.4 + 0.3 * Math.sin(this.time * 4)})`;
      ctx.fillRect(sx + 4, sy + 4, TILE_PX - 8, TILE_PX - 8);
    }
    // entities sorted by y
    const ents = [];
    ents.push({ e: this.player, kind: 'player' });
    if (this.aikoMode !== 'hide' && !this.possessed) ents.push({ e: this.aiko, kind: 'aiko' });
    for (const n of this.npcs) ents.push({ e: n, kind: 'npc', id: n.id });
    ents.sort((a, b) => a.e.fy - b.e.fy);
    for (const { e, kind, id } of ents) {
      const px = e.fx * TILE_PX - cam.x, py = e.fy * TILE_PX - cam.y;
      if (px < -50 || py < -60 || px > W + 50 || py > H + 60) continue;
      const cx = px + TILE_PX / 2, baseY = py + TILE_PX;
      if (kind === 'aiko') {
        const hover = this.aikoMode === 'fly' ? -14 + Math.sin(e.bob) * 4 : Math.sin(e.bob) * 2;
        ctx.globalAlpha = 0.92;
        Spr.drawSprite(ctx, e.spec, cx, baseY + hover, { scale: 2, frame: this.frame % 40 < 20 ? 0 : 1, facing: e.facing, pose: this.aikoMode === 'fly' ? 'fly' : 'stand' });
        ctx.globalAlpha = 1;
        if (this.aikoMode === 'fly') { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(cx - 8, baseY - 2, 16, 3); }
        continue;
      }
      const isSelf = kind === 'player';
      const pose = isSelf ? (this._selfPose || (this.path.length || Object.values(this.keys).some(Boolean) ? 'walk' : 'stand')) : (e.pose || 'stand');
      const dx = (isSelf ? this._selfDx : e.dx) || 0, dy = (isSelf ? this._selfDy : e.dy) || 0;
      const walking = isSelf ? (this.path.length > 0 || Object.values(this.keys).some(Boolean)) : (Math.abs(e.x - e.fx) > 0.05);
      Spr.drawSprite(ctx, e.spec, cx + dx, baseY + dy, {
        scale: 2.4, frame: walking ? (this.frame % 30 < 15 ? 0 : 1) : 0,
        facing: e.facing, pose: walking && pose === 'stand' ? 'walk' : pose,
      });
      // nameplate for NPCs
      if (kind === 'npc') {
        ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        const nm = e.rec.name.length > 18 ? e.rec.name.slice(0, 17) + '…' : e.rec.name;
        const tw = ctx.measureText(nm).width;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx - tw / 2 - 3, baseY - 52 + dy, tw + 6, 13);
        ctx.fillStyle = this.possessed === id ? '#ffb3ff' : '#ffe9a8';
        ctx.fillText(nm, cx, baseY - 42 + dy);
        if (this.possessed === id) { // foxfire aura
          ctx.fillStyle = `rgba(255,150,255,${0.25 + 0.15 * Math.sin(this.time * 5)})`;
          ctx.fillRect(cx - 14, baseY - 46 + dy, 28, 44);
        }
      }
    }
    // click-target marker
    if (this.path.length) {
      const [tx, ty] = this.path[this.path.length - 1];
      const sx = tx * TILE_PX - cam.x + TILE_PX / 2, sy = ty * TILE_PX - cam.y + TILE_PX / 2;
      ctx.strokeStyle = '#ffd97a'; ctx.lineWidth = 2;
      ctx.strokeRect(sx - 8, sy - 8, 16, 16);
    }
  }
  camera(W, H) {
    const px = this.player.fx * TILE_PX + TILE_PX / 2, py = this.player.fy * TILE_PX + TILE_PX / 2;
    return {
      x: Math.max(0, Math.min(24 * TILE_PX - W, px - W / 2)),
      y: Math.max(0, Math.min(18 * TILE_PX - H, py - H / 2)),
    };
  }
  tileName(ch) {
    return { '.': 'GRASS', ',': 'SAND', '~': 'WATER', 'T': 'TREE', 'o': 'ROCK', '#': 'WALL', '=': 'FLOOR', 'D': 'DOOR', '+': 'ROAD', '*': 'FLOWER', 'B': 'BRIDGE', 'S': 'STAIR' }[ch] || 'VOID';
  }
  screenToTile(sx, sy) {
    const r = this.cv.getBoundingClientRect();
    const W = this.cv.width, H = this.cv.height;
    const cam = this.camera(W, H);
    const gx = (sx - r.left) * (W / r.width), gy = (sy - r.top) * (H / r.height);
    return [Math.floor((cam.x + gx) / TILE_PX), Math.floor((cam.y + gy) / TILE_PX)];
  }
  npcAt(x, y) { return this.npcs.find(n => n.x === x && n.y === y); }
  nearestNpc(maxD = 2) {
    const p = this.player;
    let best = null, bd = 1e9;
    for (const n of this.npcs) {
      const d = Math.abs(n.x - p.x) + Math.abs(n.y - p.y);
      if (d <= maxD && d < bd) { bd = d; best = n; }
    }
    return best;
  }
}
