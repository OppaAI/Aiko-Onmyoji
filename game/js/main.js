// main.js — Aiko Onmyoji: tile-walk edition.
// Canvas overworld, click/arrow movement, sprite NPCs, Aiko chat sidebar,
// command bar, quick actions, topic browser, and action choreography.
import * as St from './state.js';
import * as TM from './tilemaps.js';
import * as Spr from './sprites.js';
import * as DLG from './dialogue.js';
import * as Chat from './chat.js';
import * as Act from './actions.js';
import * as Quests from './quests.js';
import { World, TILE_PX } from './engine.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let S = null, world = null, brain = new Chat.AikoBrain();
let selectedNpc = null; // npcId
let lastEvent = '';
let pendingAfterMove = null;
let aikoMood = 'happy';

// ---------------- boot ----------------
function boot() {
  const cv = $('stage');
  sizeCanvas(cv);
  window.addEventListener('resize', () => sizeCanvas(cv));
  const loaded = St.loadGame();
  if (loaded) { S = loaded; startGame(false); }
  else showTitle(cv);
}
function sizeCanvas(cv) {
  const r = cv.parentElement.getBoundingClientRect();
  const w = Math.min(768, r.width - 8), h = Math.min(576, r.height - 8);
  cv.width = Math.max(480, Math.floor(w / 4) * 4);
  cv.height = Math.max(360, Math.floor(h / 4) * 4);
}
function showTitle(cv) {
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0d0b1c'; ctx.fillRect(0, 0, cv.width, cv.height);
  openPanel(`<h3>🦊 Aiko Onmyoji: Sengoku Spirits</h3>
    <p>1570, the Sengoku era. You are an onmyoji walking the roads of Japan with Aiko, your fox-spirit shikigami.</p>
    <p>Move with <b>arrow keys / WASD</b> or <b>click a tile</b>. Talk to Aiko on the right. Type commands below.</p>
    <div class="btn-row"><button id="t-new">✨ New game</button>
    ${St.hasSave() ? '<button id="t-cont">📂 Continue</button>' : ''}</div>`);
  $('t-new').onclick = () => { S = St.newGame('Onmyoji'); St.saveGame(S); startGame(true); };
  const tc = $('t-cont'); if (tc) tc.onclick = () => { S = St.loadGame(); startGame(false); };
}
function startGame(fresh) {
  closePanel();
  world = new World($('stage'), S, {
    toast, onWarp: doWarp, onBumpDoor: doorBump,
    onChoreoBeat: choreoBeatPanel,
  });
  world.loadLocation(S.player.location || 'azuchi');
  drawAikoFace();
  say('sys', fresh ? 'A new journey begins. Aiko stretches her tails. "Let\'s go, master!"' : `Welcome back. You stand in ${world.map.name}.`);
  aikoSay(brain.respond('hello', brainCtx()).text, 'happy');
  loop(0);
  updateHud();
  buildQuickActions();
}
let lastT = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
  world.update(dt);
  world.render();
  if (pendingAfterMove && pendingAfterMove.check()) { const d = pendingAfterMove.done; pendingAfterMove = null; if (d) d(); }
  requestAnimationFrame(loop);
}

// ---------------- input ----------------
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
document.addEventListener('keydown', (e) => {
  if (!world) return;
  if (document.activeElement && /INPUT/.test(document.activeElement.tagName)) return;
  const d = KEYMAP[e.key];
  if (d) { world.keys[d] = true; e.preventDefault(); }
  if (e.key === 'e' || e.key === 'E') openNpcPanel((selectedNpc && world.npcById(selectedNpc)) || world.nearestNpc(2));
  if (e.key === ' ') { if (world.choreo) world.choreoSkip(); e.preventDefault(); }
});
document.addEventListener('keyup', (e) => { const d = KEYMAP[e.key]; if (d && world) world.keys[d] = false; });
document.addEventListener('click', (e) => {
  if (!world) return;
  if (e.target.closest('#dpad')) { const d = e.target.dataset.dir; if (d) stepOnce(d); return; }
  if (e.target.id === 'stage') {
    const [tx, ty] = world.screenToTile(e.clientX, e.clientY);
    const npc = world.npcAt(tx, ty);
    if (npc) { selectNpc(npc.id); openNpcPanel(npc); return; }
    if (world.choreo) { world.choreoSkip(); return; }
    const mover = world.possessed ? world.npcById(world.possessed) : world.player;
    const path = TM.findPath(world.map, mover.x, mover.y, tx, ty, S, false);
    if (path.length) { world.queuePath(path); }
    else toast('Can\'t get there.');
  }
});
function stepOnce(d) {
  const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d];
  world.tryStep(v[0], v[1]);
}

// ---------------- HUD / toast / chat ----------------
function updateHud() {
  $('hud-loc').textContent = '📍 ' + (world ? world.map.name : '—');
  $('hud-date').textContent = '📅 ' + St.dateLabel(S);
  $('hud-gold').textContent = '🪙 ' + S.player.gold;
  $('hud-karma').textContent = '⚖️ ' + St.karmaTier(S.player.karma);
  $('hud-hp').textContent = `❤️ ${S.player.hp}/${S.player.maxHp}`;
}
let toastT = null;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600);
}
function say(cls, text, who) {
  const log = $('chatlog');
  const d = document.createElement('div');
  d.className = 'msg ' + cls;
  d.innerHTML = cls === 'aiko' ? `<b>🦊 Aiko:</b> ${esc(text)}` : cls === 'me' ? esc(text) : esc(text);
  log.appendChild(d); log.scrollTop = log.scrollHeight;
}
function aikoSay(text, mood) {
  aikoMood = mood || 'happy';
  say('aiko', text); drawAikoFace();
  $('aiko-mood').textContent = { happy: 'cheerful', sad: 'down', angry: 'huffy', surprised: 'startled', love: 'smitten', neutral: 'your shikigami' }[aikoMood] || 'your shikigami';
}
function drawAikoFace() {
  const c = $('aiko-face'), x = c.getContext('2d');
  x.imageSmoothingEnabled = false; x.clearRect(0, 0, 96, 96);
  Spr.drawAikoFace(x, 0, 0, 96, aikoMood);
}
function brainCtx() {
  const mem = S.world.aikoMem || (S.world.aikoMem = {});
  return {
    S, nearby: world.npcs.map(n => ({ id: n.id, name: n.rec.name })),
    locationName: world.map.name, lastEvent,
    npcInfo: (id) => { const n = DLG.NPCS[id]; return n ? `${n.name} — ${n.desc || ''}` : null; },
    saveMem: (k, v) => { mem[k] = v; St.saveGame(S); },
    getMem: (k) => mem[k],
  };
}
$('chatinput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !world) return;
  const t = e.target.value.trim(); e.target.value = '';
  if (!t) return;
  say('me', t);
  const r = brain.respond(t, brainCtx());
  setTimeout(() => aikoSay(r.text, r.mood), 350);
});

// ---------------- command bar ----------------
$('btn-cmd').onclick = runCommand;
$('cmdinput').addEventListener('keydown', (e) => { if (e.key === 'Enter') runCommand(); });
function runCommand() {
  if (!world) return;
  const t = $('cmdinput').value.trim(); $('cmdinput').value = '';
  if (!t) return;
  say('me', '❯ ' + t);
  const ctx = { S, nearby: world.npcs.map(n => ({ id: n.id, name: n.rec.name })) };
  const it = Chat.parseCommand(t, ctx);
  execIntent(it, t);
}
function findNpcRef(target) {
  if (!target) return (selectedNpc && world.npcById(selectedNpc)) || world.nearestNpc(3);
  const low = target.toLowerCase();
  return world.npcs.find(n => n.id.toLowerCase().includes(low) || n.rec.name.toLowerCase().includes(low)) || null;
}
function execIntent(it, raw) {
  switch (it.type) {
    case 'chat': { const r = brain.respond(raw, brainCtx()); setTimeout(() => aikoSay(r.text, r.mood), 300); break; }
    case 'move': {
      const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[it.dir];
      const mover = world.possessed ? world.npcById(world.possessed) : world.player;
      const path = TM.findPath(world.map, mover.x, mover.y, mover.x + v[0] * it.steps, mover.y + v[1] * it.steps, S, false);
      if (path.length) world.queuePath(path); else toast('Blocked.');
      break;
    }
    case 'goto': {
      const npc = findNpcRef(it.target);
      if (npc) { walkAdjacent(npc, () => { selectNpc(npc.id); openNpcPanel(npc); }); break; }
      const w = (world.map.warps || []).find(x => x.label.toLowerCase().includes((it.target || '').toLowerCase()));
      if (w) { const p = world.player; const path = TM.findPath(world.map, p.x, p.y, w.x, w.y, S, false); if (path.length) world.queuePath(path); }
      else toast('No such person or road here.');
      break;
    }
    case 'warp': {
      const w = (world.map.warps || []).find(x => x.to === it.to || x.label.toLowerCase().includes((it.to || '').toLowerCase()));
      if (w) doWarp(w); else toast('No road there from here.');
      break;
    }
    case 'action': doQuickAction(it.action, findNpcRef(it.target)); break;
    case 'sex': doSexIntent(findNpcRef(it.target), it.template, it.force); break;
    case 'aiko': doAiko(it.sub, it.target); break;
    case 'door': {
      const d = (world.map.lockedDoors || []).find(x => Math.abs(x.x - world.player.x) + Math.abs(x.y - world.player.y) <= 3);
      if (!d) { toast('No locked door nearby.'); break; }
      St.setFlag(S, d.flag, true); St.saveGame(S); updateHud();
      toast(`🔓 ${d.name} unlocked.`); lastEvent = 'unlocked ' + d.name;
      break;
    }
    case 'status':
      say('sys', `${S.player.name} — Lv${S.player.level} ❤️${S.player.hp}/${S.player.maxHp} 🪙${S.player.gold} ⚖️${St.karmaTier(S.player.karma)} 📍${world.map.name} 📅${St.dateLabel(S)}`);
      break;
    case 'help':
      say('sys', 'Commands: go north/south/east/west · talk to <name> · kiss <name> · shake hands · attack <name> · sleep with <name> · aiko fly/land/hide · possess <name> · release · open door · go to <place> · where am i');
      break;
    default: say('sys', it.hint || "Hmm? Try 'help'.");
  }
}
let walkToken = 0;
function walkAdjacent(npc, fn) {
  const p = world.player;
  const token = ++walkToken;
  let tries = 0;
  const go = () => {
    if (token !== walkToken) return true; // superseded
    if (Math.abs(npc.x - p.x) + Math.abs(npc.y - p.y) <= 1) { fn(); return true; }
    if (++tries > 5) { toast("Can't reach them — they moved away."); return true; }
    let best = null;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const path = TM.findPath(world.map, p.x, p.y, npc.x + dx, npc.y + dy, S, false);
      if (path.length && (!best || path.length < best.length)) best = path;
    }
    if (!best) { toast("Can't reach them."); return true; }
    world.queuePath(best);
    return false;
  };
  if (go()) return;
  pendingAfterMove = { check: () => !world.path.length && go(), done: null };
  setTimeout(() => { if (pendingAfterMove && token === walkToken) { pendingAfterMove = null; walkToken++; } }, 20000);
}

// ---------------- NPC panel ----------------
function selectNpc(id) { selectedNpc = id; }
function npcShape(n) { return { id: n.id, ...n.rec }; }
function openNpcPanel(n) {
  if (!n) return;
  selectNpc(n.id);
  const rec = n.rec;
  const near = world.npcs.filter(x => x.id !== n.id && Math.abs(x.x - n.x) + Math.abs(x.y - n.y) <= 4).map(x => x.rec.name);
  openPanel(`<button class="close-x" id="p-x">✕</button>
    <h3>${esc(rec.name)}</h3><p>${esc(rec.desc || '')}</p>
    ${near.length ? `<p><small>Nearby: ${esc(near.join(', '))}</small></p>` : ''}
    <div class="btn-row" id="p-actions"></div>
    <div class="btn-row"><button id="p-talk">💬 Talk (topics)</button></div>
    <div class="beats" id="p-beats"></div>`);
  $('p-x').onclick = closePanel;
  const row = $('p-actions');
  for (const a of Act.QUICK_ACTIONS) {
    if (a.id === 'talk') continue;
    const b = document.createElement('button');
    b.className = 'qbtn'; b.textContent = a.label;
    b.onclick = () => doQuickAction(a.id, n);
    row.appendChild(b);
  }
  $('p-talk').onclick = () => openTopics(n);
}
function doQuickAction(actionId, n) {
  if (!n) { toast('No one selected — click a person first.'); return; }
  if (actionId === 'talk') { walkAdjacent(n, () => openTopics(n)); return; }
  const qa = Act.quickActionById(actionId);
  const shape = npcShape(n);
  const ok = qa.allowed(shape, S);
  if (ok !== true) { toast(typeof ok === 'string' ? ok : 'Can\'t do that now.'); return; }
  if (actionId === 'sex') { doSexIntent(n, null, false); return; }
  walkAdjacent(n, () => {
    n.facing = n.x < world.player.x ? 'right' : n.x > world.player.x ? 'left' : n.y < world.player.y ? 'down' : 'up';
    const beats = Act.actSequence(actionId, shape, S);
    if (actionId === 'fight') {
      const last = beats[beats.length - 1];
      if (last.outcome === 'win') { St.addExp(S, 30); St.addGold(S, St.rand(5, 20)); }
      else { St.damagePlayer(S, 15); }
      updateHud();
    }
    playBeats(beats, { self: {}, [n.id]: {} }, n.rec.name, () => {
      lastEvent = `${actionId} with ${n.rec.name}`;
      if (actionId === 'kiss') aikoSay(brain.respond(`i kissed ${n.rec.name}`, brainCtx()).text, 'love');
    });
  });
}
function playBeats(beats, actors, title, onDone) {
  openPanel(`<button class="close-x" id="p-x">✕</button><h3>${esc(title)}</h3>
    <div class="beats" id="p-beats"></div>
    <div class="btn-row"><button id="p-skip">⏩ Skip</button></div>`);
  $('p-x').onclick = () => { world.choreo = null; closePanel(); };
  $('p-skip').onclick = () => world.choreoSkip();
  const box = $('p-beats');
  world.playChoreo(beats, actors, () => { if (onDone) onDone(); });
  world.hooks.onChoreoBeat = (b, i, len) => {
    box.innerHTML = `<p>${esc(b.text || '')}</p><small>${i + 1}/${len} — click the scene or press Space to hurry</small>`;
  };
}
function choreoBeatPanel(b, i, len) {
  const box = $('p-beats');
  if (box && !$('panel').classList.contains('hidden')) box.innerHTML = `<p>${esc(b.text || '')}</p><small>${i + 1}/${len}</small>`;
}

// ---------------- topic browser (reuses dialogue.js content) ----------------
function openTopics(n) {
  const topics = n.rec.topics.filter(t => !t.need || t.need(S));
  openPanel(`<button class="close-x" id="p-x">✕</button><h3>💬 ${esc(n.rec.name)}</h3>
    <div class="btn-row">${topics.map(t => `<button data-t="${esc(t.id)}">${esc(t.label)}</button>`).join('')}</div>
    <div class="beats" id="p-beats"></div>`);
  $('p-x').onclick = () => openNpcPanel(n);
  $('panel').querySelectorAll('[data-t]').forEach(b => b.onclick = () => runTopic(n, b.dataset.t));
}
function runTopic(n, tid) {
  const t = n.rec.topics.find(x => x.id === tid);
  if (!t || (t.need && !t.need(S))) return;
  if (tid === 'hscene') { doSexIntent(n, null, false); return; }
  const box = $('p-beats');
  const notes = applyEffects(t.effects);
  const beats = typeof t.beats === 'function' ? t.beats(S) : t.beats;
  let i = 0;
  const show = () => {
    if (i >= beats.length) {
      if (t.choices) {
        box.innerHTML += `<div class="btn-row">${t.choices.filter(c => !c.need || c.need(S)).map((c, ci) => `<button data-c="${ci}">${esc(c.label)}</button>`).join('')}</div>`;
        box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
          const c = t.choices[+b.dataset.c];
          const n2 = applyEffects(c.effects);
          const cb = typeof c.beats === 'function' ? c.beats(S) : c.beats;
          box.innerHTML = cb.map(x => `<p>${esc(beatText(x))}</p>`).join('') + (n2.length ? `<p><small>${esc(n2.join(' · '))}</small></p>` : '');
        });
      }
      updateHud(); St.saveGame(S);
      return;
    }
    box.innerHTML = `<p>${esc(beatText(beats[i]))}</p>` + (notes.length && i === 0 ? `<p><small>${esc(notes.join(' · '))}</small></p>` : '') + `<div class="btn-row"><button id="b-next">▼ Continue</button></div>`;
    $('b-next').onclick = () => { i++; show(); };
  };
  show();
}
function beatText(b) { return typeof b === 'string' ? b : (b.text || ''); }
function applyEffects(effects) {
  const notes = [];
  for (const ef of effects || []) {
    if (ef.karma) { const r = St.addKarma(S, ef.karma); notes.push(`Karma ${ef.karma > 0 ? '+' : ''}${ef.karma} → ${r.tier}`); }
    if (ef.gold) { St.addGold(S, ef.gold); notes.push(`Gold ${ef.gold > 0 ? '+' : ''}${ef.gold}`); }
    if (ef.exp) { const r = St.addExp(S, ef.exp); notes.push(`+${ef.exp} EXP${r.leveled ? ' — LEVEL UP!' : ''}`); }
    if (ef.bond) { const r = St.bondChange(S, ef.bond, 'event'); notes.push(`Aiko's bond ${ef.bond > 0 ? '+' : ''}${ef.bond} (${r.now})`); }
    if (ef.heal) { St.healPlayer(S, ef.heal); notes.push(`+${ef.heal} HP`); }
    if (ef.item) { const [id, q] = ef.item; if (q < 0) St.removeItem(S, id, -q); else St.addItem(S, id, q); notes.push(`${q < 0 ? 'Used' : 'Got'} ${(St.ITEMS[id] || {}).name || id}`); }
    if (ef.flag) { let [k, v] = ef.flag; if (v === 'TODAY') v = St.dateKey(S); St.setFlag(S, k, v); }
    if (ef.memory) { const [a, b2, c] = ef.memory; St.rememberNpc(S, a, b2, c); }
    if (ef.quest) { try { Quests.setQuestStage(S, ef.quest[0], ef.quest[1]); notes.push('📜 Quest updated'); } catch {} }
  }
  return notes;
}

// ---------------- sex flow ----------------
function doSexIntent(n, templateId, force) {
  if (!n) { toast('Who with? Click someone first.'); return; }
  const shape = npcShape(n);
  const ok = Act.quickActionById('sex').allowed(shape, S);
  if (ok !== true) { toast(typeof ok === 'string' ? ok : 'Not now.'); return; }
  const consent = Act.consentFor(S, n.id, !!force);
  if (!force && consent === 'unsure') {
    aikoSay(`Hmm, ${n.rec.name} doesn't seem ready for that. Spend time with her first — or are you saying you want to force it?`, 'surprised');
    say('sys', `Tip: type "force ${n.rec.name.split(' ')[0].toLowerCase()}" to take her by force (dark karma, guards may come).`);
    return;
  }
  walkAdjacent(n, () => openSexPicker(n, templateId, !!force, consent));
}
function openSexPicker(n, templateId, force, consent) {
  const others = world.npcs.filter(x => x.id !== n.id && x.rec.adult && Math.abs(x.x - n.x) + Math.abs(x.y - n.y) <= 4);
  const tpl = templateId ? Act.sexTemplateById(templateId) : null;
  if (tpl) { startSex(n, tpl, others.slice(0, 1), force, consent); return; }
  const list = Act.SEX_TEMPLATES.filter(t => t.participants === '1m1f' || (others.length && t.participants !== '1m1f'));
  openPanel(`<button class="close-x" id="p-x">✕</button><h3>🔞 ${esc(n.rec.name)} ${force ? '(forced)' : ''}</h3>
    <p><small>${consent === 'eager' ? 'She wants this.' : consent === 'willing' ? 'She seems willing.' : 'Taken by force.'}</small></p>
    ${others.length ? `<p><small>Others nearby: ${esc(others.map(x => x.rec.name).join(', '))} — threesome templates available.</small></p>` : ''}
    <div class="btn-row">${list.map(t => `<button data-s="${t.id}">${esc(t.name)}</button>`).join('')}</div>
    <div class="beats"><small>Choose how the night unfolds. ${force ? '⚠️ Forced — karma will suffer.' : ''}</small></div>`);
  $('p-x').onclick = closePanel;
  $('panel').querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    const t = Act.sexTemplateById(b.dataset.s);
    const extra = t.participants === '1m1f' ? [] : others.slice(0, t.participants === '2m1f' ? 0 : 1);
    startSex(n, t, extra, force, consent);
  });
}
function startSex(n, tpl, extraNpcs, force, consent) {
  const ids = [n.id, ...extraNpcs.map(x => x.id)];
  let seq;
  try { seq = Act.sexSequence(tpl.id, ids.map(id => ({ id, ...DLG.NPCS[id] })), S, force); }
  catch (err) { toast('Couldn\'t begin: ' + err.message); return; }
  const beats = seq.beats.map(b => ({
    poseSelf: b.poses.m, poseNpc: b.poses.f,
    arrangement: b.arrangement === 'behind' || b.arrangement === 'face' ? 'close' : undefined,
    text: b.text.replace('{m}', S.player.name).replace('{f}', n.rec.name).replace('{f2}', extraNpcs[0] ? extraNpcs[0].rec.name : ''),
    hold: 3.2,
  }));
  const actors = { self: { pose: 'embrace' }, [n.id]: { pose: 'lie' } };
  for (const x of extraNpcs) actors[x.id] = { pose: 'lie' };
  playBeats(beats, actors, `🔞 ${tpl.name} — ${n.rec.name}`, () => {
    const c = seq.consequences;
    if (c.karma) St.addKarma(S, c.karma);
    for (const [k, v] of Object.entries(c.flags || {})) St.setFlag(S, k, v === 'TODAY' ? St.dateKey(S) : v);
    if (c.news) St.addNews(S, c.news);
    St.saveGame(S); updateHud();
    lastEvent = `${force ? 'forced' : 'lovely'} night with ${n.rec.name}`;
    toast(force ? 'It is done. The night will not forget this.' : 'A night to remember. 🌙');
    aikoSay(brain.respond(`i spent the night with ${n.rec.name}`, brainCtx()).text, force ? 'sad' : 'love');
  });
}

// ---------------- Aiko spirit ----------------
function doAiko(sub, target) {
  if (sub === 'fly') { world.aikoMode = 'fly'; toast('🦊 Aiko takes to the sky.'); }
  else if (sub === 'land' || sub === 'follow') { world.aikoMode = 'follow'; toast('🦊 Aiko floats back to your side.'); }
  else if (sub === 'hide') { world.aikoMode = 'hide'; toast('🦊 Aiko melts into the shadows.'); }
  else if (sub === 'possess') {
    const n = findNpcRef(target);
    if (!n) { toast('Possess whom?'); return; }
    if (n.rec.adult === false) { /* no age gate needed; possession is non-sexual */ }
    world.possessed = n.id; world.aikoMode = 'follow';
    toast(`🦊 Aiko slips inside ${n.rec.name}. Move with arrows — you guide her body. Type "release" to let go.`);
    say('sys', `You now move ${n.rec.name}. Aiko whispers: "Tell me what to make her do."`);
    lastEvent = 'possessed ' + n.rec.name;
  }
  else if (sub === 'release') {
    if (!world.possessed) { toast('Aiko isn\'t possessing anyone.'); return; }
    const n = world.npcById(world.possessed);
    world.possessed = null;
    world.aiko.x = n.x; world.aiko.y = n.y;
    toast(`🦊 Aiko slips out of ${n.rec.name}, giggling.`);
  }
}

// ---------------- warps / doors / menu ----------------
function doWarp(w) {
  say('sys', `🚶 ${w.label}…`);
  world.loadLocation(w.to);
  const [tx, ty] = w.ts || world.map.spawns.player;
  world.player.x = tx; world.player.y = ty; world.player.fx = tx; world.player.fy = ty;
  world.aiko.x = tx; world.aiko.y = ty;
  lastEvent = 'traveled to ' + world.map.name;
  updateHud(); St.saveGame(S);
  aikoSay(brain.respond(`we arrived at ${world.map.name}`, brainCtx()).text, 'happy');
}
function doorBump(door) {
  if (S.world.flags[door.flag]) return;
  toast(`🚪 ${door.name} is locked. Type "open door" nearby, or find another way.`);
}
function buildQuickActions() {
  const row = $('quick-actions'); row.innerHTML = '';
  for (const a of Act.QUICK_ACTIONS) {
    if (a.id === 'talk') continue;
    const b = document.createElement('button');
    b.className = 'qbtn'; b.textContent = a.label; b.title = a.label;
    b.onclick = () => {
      const n = (selectedNpc && world.npcById(selectedNpc)) || world.nearestNpc(3);
      doQuickAction(a.id, n);
    };
    row.appendChild(b);
  }
  const talk = document.createElement('button');
  talk.className = 'qbtn'; talk.textContent = '💬 Talk';
  talk.onclick = () => { const n = (selectedNpc && world.npcById(selectedNpc)) || world.nearestNpc(3); if (n) walkAdjacent(n, () => openTopics(n)); else toast('No one nearby.'); };
  row.prepend(talk);
}
$('btn-menu').onclick = () => {
  openPanel(`<h3>☰ Menu</h3><div class="btn-row">
    <button id="m-save">💾 Save</button><button id="m-title">🚪 Title</button><button id="m-x">✕ Close</button></div>
    <p><small>${esc(world ? world.map.name : '')} · ${esc(St.dateLabel(S))}</small></p>`);
  $('m-save').onclick = () => { St.saveGame(S); toast('Saved.'); closePanel(); };
  $('m-title').onclick = () => location.reload();
  $('m-x').onclick = closePanel;
};

// ---------------- panel helpers ----------------
function openPanel(html) { const p = $('panel'); p.innerHTML = html; p.classList.remove('hidden'); }
function closePanel() { $('panel').classList.add('hidden'); }

boot();
