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
import * as MG from './mapgen.js';
import * as Places from './places.js';
import * as Missions from './missions.js';
import * as Hostiles from './hostiles.js';
import * as Party from './party.js';
import * as Combat from './combat.js';
import * as History from './history.js';
import * as Factions from './factions.js';
import { AikoServer, collectPresent, collectParty } from './aiko.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let S = null, world = null, brain = new Chat.AikoBrain();
let selectedNpc = null; // npcId
let lastEvent = '';
let pendingAfterMove = null;
let aikoMood = 'happy';
let pendingQuestCombat = null; // enemyId from a topic/choice ef.combat effect
let questCombat = null; // { c, enemyId } while a quest duel panel is open
let commandGeneration = 0;

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
    <p class="fine">🔞 An original historical sandbox. Adult romance text appears only in 🔞 topics with explicitly adult NPCs — never Aiko, never minors. Imagery stays non-explicit.</p>
    <div class="btn-row"><button id="t-new">✨ New game</button>
    ${St.hasSave() ? '<button id="t-cont">📂 Continue</button>' : ''}</div>`);
  $('t-new').onclick = () => { S = St.newGame('Onmyoji'); St.saveGame(S); startGame(true); };
  const tc = $('t-cont'); if (tc) tc.onclick = () => { S = St.loadGame(); startGame(false); };
}
function startGame(fresh) {
  closePanel();
  Places.ensureState(S); Missions.ensureState(S); Hostiles.ensureState(S); Party.ensureState(S);
  S.world.genLinks = S.world.genLinks || {};
  // Reconnect the historical lifecycle: dated events, faction effects, battle hooks.
  History.setFactionHooks({ changeStrength: Factions.changeStrength, destroyFaction: Factions.destroyFaction });
  History.setImpactHooks({ addFame: (s, d) => St.addFame(s, d), addExp: (s, n) => St.addExp(s, n) });
  History.setFactionName((fid) => Factions.factionDisplayName(S, fid));
  world = new World($('stage'), S, {
    toast, onWarp: doWarp, onBumpDoor: doorBump,
    onChoreoBeat: choreoBeatPanel, onPlayerDeath: (info) => playerDeath(info),
  });
  loadLocationEx(S.player.location || 'kyoto');
  drawAikoFace();
  say('sys', fresh ? 'A new journey begins. Aiko stretches her tails. "Let\'s go, master!"' : `Welcome back. You stand in ${world.map.name}.`);
  aikoSay(brain.respond('hello', brainCtx()).text, 'happy');
  loop(0);
  updateHud();
  buildQuickActions();
}
// ---- procedural-map + population plumbing -------------------------------
// Loads a location, recording bidirectional links for generated maps so the
// way back stays stable, then populates party/shikigami/animals/hostiles.
function loadLocationEx(locId, fromId, fromDir) {
  if (fromId && fromDir && MG.isGenId(locId)) {
    const opp = { north: 'south', south: 'north', east: 'west', west: 'east' }[fromDir];
    const L = S.world.genLinks[locId] || (S.world.genLinks[locId] = {});
    if (opp && !L[opp]) L[opp] = fromId;
  }
  if (MG.isGenId(locId)) TM.registerMap(locId, MG.genMap(locId, S.world.genLinks[locId] || {}));
  world.loadLocation(locId);
  Party.loadFollowers(world, S);
  Party.spawnAnimals(world, S);
  Hostiles.spawnForMap(world, S);
}
// ---- historical lifecycle ------------------------------------------------
// Runs dated history whenever game time advances: fires events, applies their
// effects, and flags battles the player is close enough to join.
function processHistory() {
  const fired = History.processDate(S);
  for (const line of fired) say('sys', line);
  if (S.world.pendingBattle) {
    const b = History.BATTLES[S.world.pendingBattle];
    if (b) {
      const sides = History.battleSidesText(b);
      say('sys', `📯 ${b.name} rages near ${world.map.name} — ${sides.a} face ${sides.b}. Type "join battle" to take the field, or let history unfold without you.`);
      aikoSay(brain.respond(`a battle is happening nearby: ${b.name}`, brainCtx()).text, 'surprised');
    }
  }
  if (fired.length) { updateHud(); St.saveGame(S); }
}
function dirFromWarp(w) {
  if (w.x === 0) return 'west';
  if (w.x === 23) return 'east';
  if (w.y === 0) return 'north';
  if (w.y === 17) return 'south';
  return null;
}
let _dead = false;
function playerDeath(info) {
  if (_dead) return; _dead = true;
  const lost = Combat.defeatPenalty(S);
  say('sys', `💀 You fall${info && info.src ? ' — ' + info.src : ''}! Aiko gathers your spirit and flees to the Forest Shrine… (−${lost} gold)`);
  aikoSay('No no no! Stay with me! …There. Breathe. The shrine will mend you. Don\'t ever scare me like that again!', 'sad');
  setTimeout(() => {
    loadLocationEx('shrine');
    _dead = false; updateHud(); St.saveGame(S);
  }, 1800);
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
async function runCommand() {
  if (!world) return;
  const t = $('cmdinput').value.trim(); $('cmdinput').value = '';
  if (!t) return;
  say('me', '❯ ' + t);
  // Live freeform path: ask the Aiko-chan server first. act() returns true
  // when the server handled the command (success or refusal) and false on
  // ANY failure (unreachable, timeout, bad JSON) — then we fall through to
  // the offline parser below. The command box never hard-fails.
  const generation = ++commandGeneration;
  const mapId = world.mapId;
  try {
    const handled = await AikoServer.act({
      text: t,
      gameState: S,
      timeoutMs: 2500,
      hooks: {
        present: collectPresent(world),
        party: collectParty(S),
        route: (intent) => {
          if (generation === commandGeneration && world && world.mapId === mapId) execIntent(intent, t);
        },
        sys: (msg) => say('sys', msg),
        afterEffects: () => { updateHud(); St.saveGame(S); },
      },
    });
    if (handled) return;
  } catch (e) { /* fall through to the offline path */ }
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
    case 'action': {
      if (it.action === 'fight') {
        const h = findHostileRef(it.target);
        if (h) { doMelee(h.id); break; }
      }
      doQuickAction(it.action, findNpcRef(it.target)); break;
    }
    case 'sex': doSexIntent(findNpcRef(it.target), it.template, it.force); break;
    case 'steal': doSteal(it.target); break;
    case 'flee': {
      if (questCombat) { doCombatAction({ type: 'flee' }); break; }
      say('sys', 'There is nothing to flee from right now.');
      break;
    }
    case 'shikigamiAttack': {
      // "(tell|order) <who> to attack <target>" and the server's
      // aiko_command strike: same handler as the shikigami attack order.
      const actor = Party.findShikigami(S, it.who || 'aiko');
      if (!actor) {
        say('sys', `No bound shikigami called "${it.who}" can take that order.`);
        break;
      }
      const r = Party.setShikigamiOrder(S, 'attack', actor.id);
      if (!r.ok) { say('sys', r.msg); break; }
      const h = it.target ? findHostileRef(it.target) : null;
      if (h) { say('sys', `🦊 ${actor.name} darts at ${h.name}!`); doMelee(h.id); break; }
      const n = it.target ? findNpcRef(it.target) : null;
      say('sys', n ? `🦊 ${actor.name} lunges at ${n.rec.name}, claws flashing!` : r.msg);
      St.saveGame(S);
      break;
    }
    case 'recruit': doRecruit(it.target); break;
    case 'dismiss': doDismiss(it); break;
    case 'party': say('sys', Party.partyList(S)); break;
    case 'bind': doBind(it.target); break;
    case 'release': {
      const r = Party.releaseShikigami(S, it.target);
      say('sys', r.msg);
      if (r.ok) { Party.loadFollowers(world, S); St.saveGame(S); }
      break;
    }
    case 'shikigami':
      if (it.sub === 'list') say('sys', Party.shikigamiList(S));
      else { const r = Party.setShikigamiOrder(S, it.order); Party.loadFollowers(world, S); toast(r.msg); St.saveGame(S); }
      break;
    case 'summon': {
      const r = Party.summonShikigami(S, it.target);
      say('sys', r.msg);
      if (r.ok) { Party.loadFollowers(world, S); St.saveGame(S); }
      break;
    }
    case 'enter': doEnter(it.target); break;
    case 'exit': doExit(); break;
    case 'missions': say('sys', Missions.missionLog(S).join(' · ') || 'No commissions. Visit a bar\'s mission board.'); break;
    case 'mission':
      if (it.sub === 'accept') doAcceptMission(it.n);
      else doAbandonMission(it.target);
      break;
    case 'capture': doCapture(it.target); break;
    case 'shop': doShop(it.sub, it.item); break;
    case 'travel': doTravel(it.dir); break;
    case 'battle': doJoinBattle(); break;
    case 'request': doRequest(it.target); break;
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
      say('sys', 'Commands: go north/south/east/west · travel north (new lands) · talk to <name> · kiss <name> · attack <name> · recruit <name> · bind <name> (shikigami, max 7) · shikigami / summon <name> / shikigami attack · enter the bar/shop/inn · missions · accept mission <n> · buy/sell <item> · join battle (when one rages nearby) · aiko fly/land/hide · possess <name> · release · where am i');
      break;
    default: say('sys', it.hint || "Hmm? Try 'help'.");
  }
}
// ---------------- new systems: party / shikigami / hostiles / places ----
function findHostileRef(target) {
  if (!target) return world.nearestHostile ? world.nearestHostile(3) : null;
  const low = String(target).toLowerCase();
  return (world.hostiles || []).find(h => h.id.toLowerCase().includes(low) || h.name.toLowerCase().includes(low)) || null;
}
function doMelee(hostileId) {
  const r = Hostiles.meleeAttack(S, world, hostileId, {
    onKill: (h, lines) => {
      if (h.missionId) {
        const m = Missions.onTargetDown(S, h, 'killed');
        lines.push(...m.lines);
        if (m.done) toast('🎯 Objective complete! Return to collect your reward.');
      }
    },
    onPlayerDown: () => playerDeath({ src: 'your wounds' }),
  });
  for (const l of r.lines || []) say('sys', l);
  updateHud(); St.saveGame(S);
}
function doRecruit(target) {
  const n = findNpcRef(target);
  if (!n) {
    const h = findHostileRef(target);
    say('sys', h ? `${h.name} is wild with battle-rage — bind them as a shikigami ("bind ${target}") instead of recruiting.` : `Recruit whom? Nobody called "${target}" is here.`);
    return;
  }
  walkAdjacent(n, () => {
    const r = Party.recruit(S, world, n);
    say('sys', r.msg);
    if (r.ok) { Party.loadFollowers(world, S); updateHud(); St.saveGame(S); lastEvent = 'recruited ' + n.rec.name; }
  });
}
function doDismiss(it) {
  if (it.all) {
    const n = (S.world.party || []).length;
    S.world.party = []; Party.loadFollowers(world, S);
    say('sys', n ? 'You disband your party. They go their separate ways.' : 'No party to disband.');
    St.saveGame(S); return;
  }
  const t = it.target || '';
  const pr = Party.dismissParty(S, world, t);
  if (pr.ok) { Party.loadFollowers(world, S); say('sys', pr.msg); St.saveGame(S); return; }
  const ur = Party.unsummonShikigami(S, t);
  say('sys', ur.ok ? ur.msg : pr.msg);
  if (ur.ok) { Party.loadFollowers(world, S); St.saveGame(S); }
}
function findBindTarget(target) {
  const low = String(target || '').toLowerCase();
  const n = findNpcRef(target);
  if (n) return { id: n.id, name: n.rec.name, rec: n.rec, kind: 'npc' };
  const h = (world.hostiles || []).find(x => x.id.toLowerCase().includes(low) || x.name.toLowerCase().includes(low));
  if (h) return { id: h.id, name: h.name, kind: 'hostile', hostile: h };
  const a = (world.animals || []).find(x => x.id.toLowerCase().includes(low) || x.name.toLowerCase().includes(low));
  if (a) return { id: a.id, name: a.name, kind: 'animal', animal: a.animal };
  const p = (world.party || []).find(x => x.id.toLowerCase().includes(low) || x.name.toLowerCase().includes(low));
  if (p) return { id: p.mid || p.id, name: p.name, rec: { archetype: 'villager' }, kind: 'npc' };
  return null;
}
function doBind(target) {
  const t = findBindTarget(target);
  if (!t) { say('sys', `Bind whom? Nothing called "${target}" is near.`); return; }
  const r = Party.bindShikigami(S, world, t);
  say('sys', r.msg);
  if (r.ok) { Party.loadFollowers(world, S); updateHud(); St.saveGame(S); lastEvent = 'bound ' + t.name; }
}
const KIND_WORDS = { bar: 'bar', tavern: 'bar', pub: 'bar', brothel: 'brothel', shop: 'shop', store: 'shop', smith: 'weaponsmith', weaponsmith: 'weaponsmith', inn: 'inn', shrine: 'shrine', house: 'house' };
function doEnter(target) {
  const w = String(target || '').toLowerCase().split(/\s+/).find(x => KIND_WORDS[x]);
  const kind = w ? KIND_WORDS[w] : null;
  const f = Places.findNearestBuilding(world, world.player.x, world.player.y, kind, 5);
  if (!f) { toast(kind ? `No ${kind} nearby — walk closer.` : 'Enter what? Try "enter the bar".'); return; }
  const iid = Places.enterBuilding(S, world, f.bldg);
  St.saveGame(S);
  loadLocationEx(iid);
  updateHud();
  openBuildingMenu(f.bldg);
  lastEvent = 'entered ' + f.bldg.name;
}
function doExit() {
  if (/__in__/.test(world.mapId)) {
    const w = (world.map.warps || [])[0];
    if (w) { doWarp(w); return; }
  }
  toast('You are already outside.');
}
function doTravel(dir) {
  const dn = { up: 'north', down: 'south', left: 'west', right: 'east' }[dir] || dir;
  // Honor previously recorded return links (typed travel matches edge warps).
  const links = S.world.genLinks[world.mapId] || (S.world.genLinks[world.mapId] = {});
  const nid = links[dn] || MG.neighborFor(world.mapId, dn);
  links[dn] = nid;
  say('sys', `🧭 You travel ${dn}, beyond the known roads… (6 hours pass)`);
  loadLocationEx(nid, world.mapId, dn);
  St.discover(S, nid);
  St.advanceHours(S, 6); // the road takes time: history marches on
  processHistory();
  updateHud(); St.saveGame(S);
  lastEvent = 'traveled to ' + world.map.name;
  aikoSay(brain.respond(`we arrived at ${world.map.name}`, brainCtx()).text, 'happy');
}
function doAcceptMission(n) {
  const f = Places.findNearestBuilding(world, world.player.x, world.player.y, 'bar', 6);
  if (!f) { toast('You need to stand in a bar to take commissions.'); return; }
  const r = Missions.acceptMission(S, f.bldg.id, (n || 1) - 1);
  say('sys', r.msg);
  if (r.ok && r.target) say('sys', `🎯 Target: ${r.target.name} — seek them in ${r.target.mapId}.`);
  St.saveGame(S); updateHud();
}
function doAbandonMission(target) {
  const act = Missions.activeMissions(S);
  const t = String(target || '').trim().toLowerCase();
  const m = /^\d+$/.test(t) ? act[+t - 1] : act.find(x => x.id.toLowerCase().includes(t) || x.title.toLowerCase().includes(t));
  if (!m) { say('sys', 'Abandon which commission? See "missions".'); return; }
  const r = Missions.abandonMission(S, m.id);
  say('sys', r.msg || 'Commission abandoned.');
  St.saveGame(S);
}
function doCapture(target) {
  const h = findHostileRef(target);
  if (!h) { say('sys', `Capture whom? Nobody called "${target}" is here.`); return; }
  const r = Hostiles.captureTarget(S, world, h.id, {
    onCapture: (hh, lines) => {
      if (hh.missionId) {
        const m = Missions.onTargetDown(S, hh, 'captured');
        lines.push(...m.lines);
        if (m.done) toast('🎯 Objective complete! Return to collect your reward.');
      }
    },
  });
  for (const l of r.lines || []) say('sys', l);
  if (!r.ok && r.msg) say('sys', r.msg);
  St.saveGame(S); updateHud();
}
function itemIdFromName(frag) {
  const f = String(frag || '').toLowerCase().trim();
  const ids = Object.keys(St.ITEMS);
  return ids.find(id => id === f)
    || ids.find(id => St.ITEMS[id].name.toLowerCase() === f)
    || ids.find(id => St.ITEMS[id].name.toLowerCase().includes(f))
    || null;
}
function doShop(sub, item) {
  const f = Places.findNearestBuilding(world, world.player.x, world.player.y, null, 6);
  const kind = f && (f.bldg.kind === 'weaponsmith' || f.bldg.kind === 'shop') ? f.bldg.kind : null;
  if (!kind) { toast('No shop nearby — find a shop or weaponsmith.'); return; }
  if (sub === 'list' || !sub) {
    const lines = Places.shopList(S, kind, f.bldg.id).map(o => `${o.name} — ${o.price}g${o.owned ? ` (own ${o.owned})` : ''}`);
    say('sys', '🏪 ' + (lines.join(' · ') || 'Sold out.'));
    return;
  }
  const id = itemIdFromName(item);
  if (!id) { say('sys', `The shopkeep squints. "Never heard of ${item}."`); return; }
  const r = sub === 'buy' ? Places.buyItem(S, id) : Places.sellItem(S, id);
  say('sys', r.msg);
  updateHud(); St.saveGame(S);
}
function doRequest(target) {
  const n = findNpcRef(target) || world.nearestNpc(3);
  if (!n) { say('sys', 'Ask whom for work? No one nearby.'); return; }
  const offer = Missions.npcOffer(n.id, S);
  if (!offer) { say('sys', `${n.rec.name} has no work for you right now.`); return; }
  openPanel(`<button class="close-x" id="p-x">✕</button><h3>❗ ${esc(n.rec.name)}'s request</h3>
    <p><b>${esc(offer.title)}</b></p><p>${esc(offer.desc)}</p>
    <p><small>Reward: ${offer.reward.gold} gold${offer.reward.karma ? ` · karma ${offer.reward.karma > 0 ? '+' : ''}${offer.reward.karma}` : ''}</small></p>
    <div class="btn-row"><button id="rq-ok">Accept</button><button id="rq-no">Decline</button></div>`);
  $('p-x').onclick = closePanel;
  $('rq-no').onclick = closePanel;
  $('rq-ok').onclick = () => { const r = Missions.acceptNpcOffer(S, n.id); say('sys', r.msg); if (r.ok && r.target) say('sys', `🎯 Target: ${r.target.name} — seek them in ${r.target.mapId}.`); closePanel(); St.saveGame(S); };
}
// ---------------- building menus ----------------
function openBuildingMenu(bldg) {
  const menu = Places.buildingMenu(S, world, bldg);
  openPanel(`<button class="close-x" id="p-x">✕</button><h3>${esc(menu.title)}</h3><p>${esc(menu.desc)}</p>
    <div class="btn-row">${menu.options.map(o => `<button data-b="${o.id}">${esc(o.label)}</button>`).join('')}</div>
    <div class="beats" id="p-beats"></div>`);
  $('p-x').onclick = closePanel;
  $('panel').querySelectorAll('[data-b]').forEach(b => b.onclick = () => buildingOption(bldg, b.dataset.b));
}
function buildingSay(t) {
  const box = $('p-beats');
  if (box) box.innerHTML = `<p>${esc(t)}</p>`;
}
function buildingOption(bldg, opt) {
  switch (opt) {
    case 'drink': { const r = Places.drinkAtBar(S); buildingSay(r.msg); updateHud(); St.saveGame(S); break; }
    case 'board': showBoard(bldg); break;
    case 'buy': case 'sell': showTrade(bldg, opt); break;
    case 'rest': { const r = Places.restAtInn(S); buildingSay(r.msg); processHistory(); updateHud(); St.saveGame(S); break; }
    case 'pray': { const r = Places.prayAtShrine(S); buildingSay(r.msg); updateHud(); St.saveGame(S); break; }
    case 'knock': { const r = Places.knockHouse(S, bldg.id); buildingSay(r.msg); break; }
    case 'meet': showStaff(); break;
    case 'talk': {
      const n = world.nearestNpc(4);
      if (n) openTopics(n); else buildingSay('No one to talk to.');
      break;
    }
    default: buildingSay('Nothing happens.');
  }
}
function showBoard(bldg) {
  const box = $('p-beats');
  const board = Missions.boardMissions(S, bldg.id);
  const done = Missions.activeMissions(S).filter(m => m.state === 'done' && m.giver && m.giver.kind === 'bar' && m.giver.barId === bldg.id);
  box.innerHTML = `<h4>📌 Mission board — ${esc(bldg.name)}</h4>` +
    (board.map((m, i) => `<p><b>${i + 1}.</b> ${esc(m.title)} <small>${esc(m.desc)}</small><br><small>Reward: ${m.reward.gold}g</small> <button data-acc="${i}">Accept</button></p>`).join('') || '<p><small>No postings right now.</small></p>') +
    (done.length ? `<h4>📜 Ready to turn in</h4>` + done.map(m => `<p>${esc(m.title)} <button data-tin="${esc(m.id)}">Turn in</button></p>`).join('') : '');
  box.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => {
    const r = Missions.acceptMission(S, bldg.id, +b.dataset.acc);
    buildingSay(r.msg + (r.ok && r.target ? ` 🎯 Target: ${r.target.name} — seek them in ${r.target.mapId}.` : ''));
    updateHud(); St.saveGame(S);
  });
  box.querySelectorAll('[data-tin]').forEach(b => b.onclick = () => {
    const r = Missions.turnIn(S, b.dataset.tin);
    buildingSay(r.msg); updateHud(); St.saveGame(S); showBoard(bldg);
  });
}
function showTrade(bldg, mode) {
  const box = $('p-beats');
  if (mode === 'buy') {
    const list = Places.shopList(S, bldg.kind, bldg.id);
    box.innerHTML = `<h4>🛒 ${esc(bldg.name)}</h4>` + list.map(o =>
      `<p>${esc(o.name)} — ${o.price}g <small>${esc(o.desc)}</small>${o.owned ? ` <small>(own ${o.owned})</small>` : ''} <button data-buy="${esc(o.id)}">Buy</button></p>`).join('');
    box.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const r = Places.buyItem(S, b.dataset.buy);
      buildingSay(r.msg); updateHud(); St.saveGame(S);
    });
  } else {
    const inv = S.player.inventory.filter(i => (St.ITEMS[i.id] || {}).price > 0);
    box.innerHTML = `<h4>💰 Sell</h4>` + (inv.map(i => {
      const it = St.ITEMS[i.id]; const price = Math.max(1, Math.floor(it.price / 2));
      return `<p>${esc(it.name)} ×${i.qty} — ${price}g <button data-sell="${esc(i.id)}">Sell</button></p>`;
    }).join('') || '<p><small>Nothing worth selling.</small></p>');
    box.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
      const r = Places.sellItem(S, b.dataset.sell);
      buildingSay(r.msg); updateHud(); St.saveGame(S); showTrade(bldg, 'sell');
    });
  }
}
function showStaff() {
  const box = $('p-beats');
  const staff = world.npcs.filter(n => n.rec && n.rec.adult === true);
  box.innerHTML = `<h4>🌸 Staff</h4>` + (staff.map(n =>
    `<p>${esc(n.rec.name)} <small>${esc(n.rec.desc || '')}</small> <button data-staff="${esc(n.id)}">Talk</button></p>`).join('') || '<p><small>No one is receiving guests right now.</small></p>');
  box.querySelectorAll('[data-staff]').forEach(b => b.onclick = () => {
    const n = world.npcById(b.dataset.staff);
    if (n) openTopics(n);
  });
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
  // ❗ personal request / turn-in (missions.js)
  const offer = Missions.npcOffer(n.id, S);
  const turnin = Missions.activeMissions(S).find(m => m.state === 'done' && m.giver && m.giver.kind === 'npc' && m.giver.npcId === n.id);
  if (offer || turnin) {
    const row2 = document.createElement('div');
    row2.className = 'btn-row';
    if (offer) {
      const b = document.createElement('button');
      b.textContent = '❗ Request';
      b.onclick = () => doRequest(n.id);
      row2.appendChild(b);
    }
    if (turnin) {
      const b = document.createElement('button');
      b.textContent = '📜 Turn in: ' + turnin.title;
      b.onclick = () => { const r = Missions.turnIn(S, turnin.id); say('sys', r.msg); updateHud(); St.saveGame(S); openNpcPanel(n); };
      row2.appendChild(b);
    }
    $('panel').appendChild(row2);
  }
}
function doQuickAction(actionId, n) {
  // Rest needs no target. Kiss/sex are typed-only paths now (their preset
  // buttons were removed); they keep their gating via kissAllowed/sexAllowed.
  if (actionId === 'rest') { doRest(); return; }
  if (!n) { toast('No one selected — click a person first.'); return; }
  if (actionId === 'talk') { walkAdjacent(n, () => openTopics(n)); return; }
  if (actionId === 'sex') { doSexIntent(n, null, false); return; }
  if (actionId === 'kiss') { doKissAction(n); return; }
  const qa = Act.quickActionById(actionId);
  if (!qa) { toast("Can't do that now."); return; }
  const shape = npcShape(n);
  const ok = qa.allowed(shape, S);
  if (ok !== true) { toast(typeof ok === 'string' ? ok : 'Can\'t do that now.'); return; }
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
    });
  });
}
// Typed-only kiss path (the 💋 preset button was removed): same gating and
// the same kiss scene beats the button used to reach.
function doKissAction(n) {
  const ok = Act.kissAllowed(npcShape(n), S);
  if (ok !== true) { toast(typeof ok === 'string' ? ok : "Can't do that now."); return; }
  walkAdjacent(n, () => {
    n.facing = n.x < world.player.x ? 'right' : n.x > world.player.x ? 'left' : n.y < world.player.y ? 'down' : 'up';
    const beats = Act.actSequence('kiss', npcShape(n), S);
    playBeats(beats, { self: {}, [n.id]: {} }, n.rec.name, () => {
      lastEvent = `kiss with ${n.rec.name}`;
      aikoSay(brain.respond(`i kissed ${n.rec.name}`, brainCtx()).text, 'love');
    });
  });
}
// Rest until morning, wherever you stand (the typed "rest" command and the
// server's rest verb). Inns (places.js restAtInn) remain the paid luxury.
function doRest() {
  St.restUntilMorning(S);
  St.healPlayer(S, S.player.maxHp);
  S.player.rei = S.player.maxRei;
  processHistory();
  St.addNews(S, '🛏️ Rested under the open sky until morning.');
  say('sys', '🛏️ You rest until morning, fully restored.');
  updateHud(); St.saveGame(S);
  lastEvent = 'rested';
}
// Deterministic offline steal fallback: karma hit + narration. No invented
// items, no gold — the server path computes real effects when it's online.
function doSteal(target) {
  const n = target ? findNpcRef(target) : null;
  if (!n) { say('sys', `Steal from whom? Nobody called "${target}" is here.`); return; }
  if (Act.isAiko(npcShape(n))) { say('sys', 'You would never steal from Aiko.'); return; }
  const r = St.addKarma(S, -5);
  say('sys', `You palm a few coins from ${n.rec.name} when they glance away. (Karma −5 → ${r.tier})`);
  aikoSay(`Tch. Thievery, ${S.player.name}? …I saw nothing. I saw everything.`, 'angry');
  updateHud(); St.saveGame(S);
  lastEvent = 'stole from ' + n.rec.name;
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
          if (pendingQuestCombat) {
            box.innerHTML += `<div class="btn-row"><button id="b-fight">⚔️ Begin battle</button></div>`;
            $('b-fight').onclick = () => startQuestCombat(pendingQuestCombat);
          }
        });
      } else if (pendingQuestCombat) {
        box.innerHTML += `<div class="btn-row"><button id="b-fight">⚔️ Begin battle</button></div>`;
        $('b-fight').onclick = () => startQuestCombat(pendingQuestCombat);
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
    if (ef.qchoice) { Quests.setQuestChoice(S, ef.qchoice[0], ef.qchoice[1]); }
    if (ef.qcomplete) { Quests.completeQuest(S, ef.qcomplete); notes.push('📜 Quest complete'); }
    // Side-quest combat: launch the full combat.js duel flow (victory feeds
    // back into the quest via Quests.onCombatVictoryQuest).
    if (ef.combat) { pendingQuestCombat = ef.combat; notes.push('⚔️ Battle is joined!'); }
  }
  return notes;
}

// ---------------- sex flow ----------------
function doSexIntent(n, templateId, force) {
  if (!n) { toast('Who with? Click someone first.'); return; }
  const shape = npcShape(n);
  const ok = Act.sexAllowed(shape, S);
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
  const fromId = world.mapId, fromDir = dirFromWarp(w);
  say('sys', `🚶 ${w.label}…`);
  loadLocationEx(w.to, fromId, fromDir);
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

// ---- join a raging historical battle ----------------------------------------
function doJoinBattle() {
  const bid = S.world.pendingBattle;
  const b = bid && History.BATTLES[bid];
  if (!b) { toast('No battle rages within your reach.'); return; }
  const sides = History.battleSidesText(b);
  openPanel(`<h2>📯 ${esc(b.name)}</h2>
    <div class="dim">${esc(sides.a)} face ${esc(sides.b)} — ${esc(b.d || '')}</div>
    <p>Which side takes your blade?</p>
    <div class="btn-row">
      <button data-side="a">${esc(sides.a)}</button>
      <button data-side="b">${esc(sides.b)}</button>
      <button data-side="watch">👁 Watch from afar</button>
    </div>`);
  $('panel').querySelectorAll('[data-side]').forEach(btn => btn.onclick = () => {
    const side = btn.dataset.side;
    closePanel();
    const fired = [];
    if (side === 'watch') {
      History.resolveBattle(S, bid, null, false, fired);
    } else {
      // personal skirmish against the enemy line, then the army's result
      const won = S.player.atk + S.player.level * 3 + St.rand(0, 20) >= 22 + St.rand(0, 18);
      say('sys', won
        ? '⚔️ You cut through the enemy line — your side takes heart!'
        : '⚔️ You are driven back, bloodied but standing.');
      History.resolveBattle(S, bid, side, won, fired);
    }
    for (const l of fired) say('sys', l);
    updateHud(); St.saveGame(S);
  });
}

// ---------------- quest combat (full combat.js duel flow) ----------------
// Side-quest choices with ef.combat land here: a real duel where victory (or
// a spare) feeds back into the quest via Quests.onCombatVictoryQuest.
function startQuestCombat(enemyId) {
  closePanel(); pendingQuestCombat = null;
  let c;
  try { c = Combat.createCombat(S, enemyId); }
  catch (e) { toast('No such foe stirs here.'); return; }
  questCombat = { c, enemyId };
  renderCombatPanel([`⚔️ ${c.enemy.name} blocks your path! ${c.enemy.taunt || ''}`]);
}
function hpRow(label, cur, max, color) {
  const pct = Math.max(0, Math.min(100, Math.round(100 * cur / Math.max(1, max))));
  return `<div class="dim">${esc(label)} ${cur}/${max}</div>
    <div style="background:#300;border-radius:4px;height:10px;margin:2px 0 6px">
      <div style="width:${pct}%;height:100%;border-radius:4px;background:${color}"></div></div>`;
}
function renderCombatPanel(roundLog) {
  const { c } = questCombat, e = c.enemy;
  const orderOpts = Object.entries(Combat.AIKO_ORDERS).map(([id, o]) =>
    `<option value="${id}"${(c.aikoOrder || 'auto') === id ? ' selected' : ''} title="${esc(o.desc)}">${esc(o.name)}</option>`).join('');
  openPanel(`
    <h2>⚔️ ${esc(e.name)}</h2>
    <div class="dim">${e.kind === 'yokai' ? '👹 yokai' : '🗡 ' + esc(e.faction || 'foe')} — ${esc(e.desc || '')}</div>
    ${hpRow(e.name + ' HP', e.hp, e.maxHp, '#e33')}
    ${hpRow('You', S.player.hp, S.player.maxHp, '#5b5')}
    ${hpRow('Aiko', S.aiko.hp, S.aiko.maxHp, '#5af')}
    <div id="combat-log">${roundLog.map(l => `<p>${esc(l)}</p>`).join('')}</div>
    <div class="btn-row">
      <button data-ca="attack">⚔️ Attack</button>
      ${Object.entries(Combat.SPELLS).map(([id, sp]) => `<button data-ca="spell" data-id="${id}" title="${esc(sp.desc)}">${esc(sp.name)} (${sp.cost} rei)</button>`).join('')}
      <button data-ca="flee">🏃 Flee</button>
    </div>
    <div class="btn-row"><label class="dim">Aiko: <select id="aiko-order">${orderOpts}</select></label></div>`);
  $('panel').querySelectorAll('[data-ca]').forEach(b =>
    b.onclick = () => doCombatAction({ type: b.dataset.ca, id: b.dataset.id }));
}
function doCombatAction(action) {
  if (!questCombat) return;
  const { c } = questCombat;
  c.aikoOrder = $('aiko-order') ? $('aiko-order').value : (c.aikoOrder || 'auto');
  const { events, end } = Combat.doRound(c, S, action);
  updateHud();
  if (end === 'spare_offer') { renderSpareOffer(events); return; }
  if (end) { finishCombat(end, events); return; }
  renderCombatPanel(events);
}
function renderSpareOffer(events) {
  const { c } = questCombat;
  openPanel(`<h2>🙏 ${esc(c.enemy.name)} yields!</h2>
    <div id="combat-log">${events.map(l => `<p>${esc(l)}</p>`).join('')}<p>The foe is beaten and begs for mercy.</p></div>
    <div class="btn-row"><button id="sp-spare">Spare them</button><button id="sp-finish">Finish it</button></div>`);
  $('sp-spare').onclick = () => finishCombat('victory', Combat.resolveSpare(c, S, 'spare').out, true);
  $('sp-finish').onclick = () => finishCombat('victory', Combat.resolveSpare(c, S, 'finish').out, false);
}
function finishCombat(end, events, spared = false) {
  const { c, enemyId } = questCombat || {};
  questCombat = null;
  closePanel();
  for (const l of events) say('sys', l);
  if (end === 'victory') {
    const r = Combat.victoryRewards(c, S);
    for (const l of r.out) say('sys', l);
    const qn = Quests.onCombatVictoryQuest(S, enemyId, spared);
    for (const l of qn) say('sys', l);
  } else if (end === 'fled') {
    say('sys', 'You live to fight another day.');
  } else if (end === 'defeat') {
    playerDeath({ src: 'struck down in single combat' });
  }
  updateHud(); St.saveGame(S);
}

// ---------------- panel helpers ----------------
function openPanel(html) { const p = $('panel'); p.innerHTML = html; p.classList.remove('hidden'); }
function closePanel() { $('panel').classList.add('hidden'); }

boot();
