// main.js — Aiko Onmyoji: Sengoku Spirits (historical sandbox edition).
// Screen router + all screens. No build step, no external libraries.
// Time moves slowly: audiences take hours, missions and travel take days,
// and real history (1570–1590) unfolds on its actual dates.

import * as St from './state.js';
import * as MapX from './map.js';
import * as Combat from './combat.js';
import * as DLG from './dialogue.js';
import * as Aiko from './aiko.js';
import * as Quests from './quests.js';
import * as History from './history.js';
import * as Factions from './factions.js';
import * as Link from './aiko_link.js';
import * as Explore from './explore.js';
import * as Scenes from './scenes.js';

// ---- wire cross-module hooks (factions <-> history) ----
History.setFactionName((fid) => Factions.factionDisplayName(S, fid));
History.setFactionHooks({
  changeStrength: (s, fid, d) => Factions.changeStrength(s, fid, d),
  destroyFaction: (s, fid) => Factions.destroyFaction(s, fid),
  discoverLoc: (s, loc) => St.discover(s, loc),
  odaRename: (s) => St.addNews(s, '📜 The Oda banners now fly for Hashiba Hideyoshi. Men begin to whisper "Toyotomi."'),
});
History.setImpactHooks({
  addFame: (s, n) => St.addFame(s, n),
  addExp: (s, n) => St.addExp(s, n),
});
Factions.setGiftHooks({ removeItem: (s, id, q) => St.removeItem(s, id, q) });
St.setStipendTable(Factions.STIPEND);

const app = document.getElementById('app');
let S = null;
let screen = 'title';
let combat = null;
let combatPhase = 'menu';
let combatReturn = 'location';
let combatNotes = [];
let dlg = null;
let hscene = null; // interactive H-scene state {sceneId, npcId, stageIdx, touches, seen, log}
let pendingMsg = '';
let pendingNews = [];
let officerLabel = null;
let missionList = [];

// ---------------------------------------------------------------- helpers
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function portrait(src, fallback, cls = 'portrait') {
  return `<span class="${cls}"><img src="assets/${esc(src)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="pfallback" style="display:none">${fallback}</span></span>`;
}
function bgStyle(file) { return `background-image:url('assets/${esc(file)}')`; }
function karmaLabel() {
  const t = St.karmaTier(S.player.karma);
  const icon = { benevolent: '🌸', kind: '🍃', neutral: '⚖️', harsh: '🌪️', ruthless: '💀' }[t];
  return `${icon} ${t} (${S.player.karma})`;
}
function serviceLabel() {
  const f = S.world.service.faction;
  if (!f) return '🌊 rōnin (free)';
  return `🏯 ${esc(Factions.factionDisplayName(S, f))} ${esc(Factions.rankName(S))}`;
}
function bar(cur, max, cls) {
  const pct = Math.max(0, Math.min(100, Math.round(cur / max * 100)));
  return `<div class="bar"><div class="fill ${cls}" style="width:${pct}%"></div><span>${cur}/${max}</span></div>`;
}
function speakerInfo(who) {
  if (who === 'n') return { name: '', port: '' };
  if (who === 'h') return { name: S.player.name, port: portrait('hero_onmyoji.png', '🧙') };
  if (who === 'a') return { name: 'Aiko', port: portrait('aiko_shikigami.png', '🦊') };
  if (who === 'daimyo' && dlg && dlg.npc) {
    const p = DLG.npcPortraitFor(dlg.npc);
    return { name: dlg.npc.name, port: portrait(p.portrait, p.fallback) };
  }
  const npc = DLG.NPCS[who];
  if (!npc) return { name: who, port: '' };
  const p = DLG.npcPortraitFor(npc);
  return { name: npc.name, port: portrait(p.portrait, p.fallback) };
}
function factionsHere() {
  return Object.keys(Factions.FACTIONS).filter((fid) =>
    Factions.factionActive(S, fid) && Factions.factionCapital(S, fid) === S.player.location);
}
function pushNews(news) { if (news && news.length) pendingNews.push(...news); }
function tidingsHtml(n = 4) {
  const news = St.recentNews(S, n);
  if (!news.length) return '';
  return `<div class="tidings"><h3>📯 Tidings of the realm</h3>${news.map((x) =>
    `<p><small>${esc(x.d)}</small><br>${esc(x.text)}</p>`).join('')}</div>`;
}

// ---------------------------------------------------------------- effects
function applyEffects(effects) {
  const notes = [];
  for (const ef of effects || []) {
    if (ef.karma) {
      const r = St.addKarma(S, ef.karma);
      const react = Aiko.reactToKarma(S, ef.karma);
      notes.push(`Karma ${ef.karma > 0 ? '+' : ''}${ef.karma} → ${r.tier} (${r.now})`);
      if (react) notes.push('🦊 Aiko: “' + react + '”');
    }
    if (ef.gold) { St.addGold(S, ef.gold); notes.push(`Gold ${ef.gold > 0 ? '+' : ''}${ef.gold} (now ${S.player.gold})`); }
    if (ef.exp) { const r = St.addExp(S, ef.exp); notes.push(`+${ef.exp} EXP${r.leveled ? ` — LEVEL UP! Now level ${S.player.level}` : ''}`); }
    if (ef.bond) {
      const r = St.bondChange(S, ef.bond, 'event');
      notes.push(`Aiko's bond ${ef.bond > 0 ? '+' : ''}${ef.bond} (now ${r.now})`);
    }
    if (ef.heal) { St.healPlayer(S, ef.heal); notes.push(`Restored ${ef.heal} HP.`); }
    if (ef.item) {
      const [id, qty] = ef.item;
      if (qty < 0) St.removeItem(S, id, -qty); else St.addItem(S, id, qty);
      notes.push(`${qty < 0 ? 'Used' : 'Gained'}: ${St.ITEMS[id] ? St.ITEMS[id].name : id}${Math.abs(qty) > 1 ? ' ×' + Math.abs(qty) : ''}`);
    }
    if (ef.flag) {
      let [k, v] = ef.flag;
      if (v === 'TODAY') v = St.dateKey(S);
      St.setFlag(S, k, v);
    }
    if (ef.quest) { Quests.setQuestStage(S, ef.quest[0], ef.quest[1]); notes.push(`📜 Quest updated: ${Quests.QUESTS[ef.quest[0]].title}`); }
    if (ef.qchoice) { Quests.setQuestChoice(S, ef.qchoice[0], ef.qchoice[1]); }
    if (ef.memory) { St.rememberNpc(S, ef.memory[0], ef.memory[1], ef.memory[2]); }
    if (ef.discover) { St.discover(S, ef.discover); notes.push(`🗺 New location discovered: ${MapX.locationName(ef.discover)}`); }
    if (ef.aiko) { const line = Aiko.onEvent(S, ef.aiko); if (line) notes.push('🦊 Aiko: “' + line + '”'); }
    if (ef.combat) { startCombat(ef.combat === 'officer' ? Combat.officerFor(S, officerLabel) : ef.combat, 'dialogue'); return { notes, combat: true }; }
    if (ef.scene) { startScene(ef.scene[0], ef.scene[1]); return { notes, scene: true }; }
  }
  return { notes };
}

// ---------------------------------------------------------------- top bar
function topbar() {
  if (!S || screen === 'title' || screen === 'ending') return '';
  return `<div id="topbar">
    <span class="tb"><b>${esc(S.player.name)}</b> Lv${S.player.level}</span>
    <span class="tb">❤ ${S.player.hp}/${S.player.maxHp}</span>
    <span class="tb">🔮 ${S.player.rei}/${S.player.maxRei}</span>
    <span class="tb">💰 ${S.player.gold}</span>
    <span class="tb">⭐ ${S.player.fame}</span>
    <span class="tb">${serviceLabel()}</span>
    <span class="tb">${karmaLabel()}</span>
    <span class="tb">🦊 ${S.aiko.bond}</span>
    <span class="tb">📅 ${esc(St.dateLabel(S))}</span>
    <span class="tb">📍 ${esc(MapX.getLocation(S.player.location).name)}</span>
    <button class="btn small" data-act="save">Save</button>
    <button class="btn small" data-act="status">Status</button>
    <button class="btn small" data-act="whisper">🦊 Whisper <span id="wh-dot" class="dot">●</span></button>
  </div>`;
}

// ---------------------------------------------------------------- TITLE
function renderTitle() {
  const has = St.hasSave();
  return `
  <div class="screen title-screen" style="${bgStyle('bg_kyoto.png')}">
    <div class="title-card">
      <div class="jp-title">アイコ陰陽師</div>
      <h1>Aiko Onmyoji:<br>Sengoku Spirits</h1>
      <p class="tagline">Japan, 1570. Nobunaga rises, the Takeda ride, and history marches on its real dates —<br>
      whether you shape it or merely survive it. <b>No script. No chosen one.</b> Your story is yours.</p>
      <div class="title-form">
        <input id="pname" maxlength="16" placeholder="Your name, onmyoji…" value="">
        <button class="btn big" data-act="new">⚔ Begin in the 6th month, 1570</button>
        ${has ? `<button class="btn big ghost" data-act="continue">📜 Continue</button>` : ''}
      </div>
      <button class="btn small ghost" data-act="howto">How to play</button>
      <div id="howto" class="howto hidden">
        <p>📅 <b>Time flows slowly</b> — audiences take hours, travel and missions take days. History fires on its real dates (1570–1590).</p>
        <p>👑 <b>Meet the daimyo</b> — Nobunaga, Shingen, Kenshin, Ieyasu and more. Request audiences, pledge service, take missions, earn ranks.</p>
        <p>⚔ <b>Join real battles</b> — Anegawa, Mikatagahara, Nagashino, Tedorigawa. Fight well enough and you can <b>change history</b>.</p>
        <p>💬 <b>Talk</b> to samurai, nobles, merchants, kappa, and ghosts — each speaks in their own style.</p>
        <p>⚔ <b>Fight</b> turn-based battles. Weaken foes, then <b>SPARE</b> or <b>FINISH</b> them — karma remembers.</p>
        <p>🦊 <b>Aiko</b> fights beside you and comments on the flow of history. Her bond shapes her banter.</p>
        <p>🖱 <b>Explore</b> each place point-and-click style — click the buildings, people and gates to act.</p>
        <p>🦊 <b>Whisper</b> to Aiko mind-to-mind from the top bar — no one else can hear. When the Aiko-chan link is live, the real Aiko answers, and you can ask her to make things happen.</p>
        <p>🌊 <b>Do anything</b> — serve a lord faithfully, betray him, get rich, or wander free. The realm keeps score.</p>
      </div>
      <p class="fine">An original historical sandbox — all content strictly non-explicit.</p>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- MAP
function renderMap() {
  const here = MapX.getLocation(S.player.location);
  const dests = MapX.availableDestinations(S);
  return `
  <div class="screen">
    <h2>🗺 Travel — ${esc(here.name)} <span class="jp">${esc(here.jp)}</span></h2>
    <p class="flavor">${esc(here.desc)}</p>
    <p class="flavor">🦊 <i>“${esc(Aiko.aikoLine(S, { situation: 'lore' }))}”</i></p>
    <h3>Roads from here (days on the road)</h3>
    <div class="btn-grid">
      ${dests.map(d => `<button class="btn" data-act="travel" data-id="${d.id}">→ ${esc(d.name)} <span class="jp">${esc(d.jp)}</span> <small>(${d.days}d)</small>${d.danger ? ' ' + '☠'.repeat(d.danger) : ''}</button>`).join('')}
    </div>
    <h3>Known lands</h3>
    <p class="flavor">${S.world.discovered.map(id => esc(MapX.getLocation(id).name)).join(' · ')}</p>
    <div class="btn-row">
      <button class="btn ghost" data-act="location">← Back to ${esc(here.name)}</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- LOCATION
// ---------------------------------------------------------------- LOCATION (explore view)
// Point-and-click district navigation, Dragon Knight 4 style: the location is
// a scene with positioned hotspots (audience hall, people, market, inn,
// shrine, gates) generated from live game data by explore.js.
function renderLocation() {
  const loc = MapX.getLocation(S.player.location);
  const spots = Explore.hotspotsFor(S, S.player.location);
  const hb = Quests.questState(S, 'hollow_bell');
  const canFinale = S.player.location === 'honnoji' && hb.stage === 5 && !S.world.flags.game_complete;
  const servingHere = Object.keys(Factions.FACTIONS).some((fid) =>
    Factions.factionActive(S, fid) && Factions.factionCapital(S, fid) === S.player.location &&
    S.world.service.faction === fid);

  // pending battle banner
  let battleBanner = '';
  if (S.world.pendingBattle) {
    const b = History.BATTLES[S.world.pendingBattle];
    const sides = History.battleSidesText(b);
    battleBanner = `<div class="battle-banner">
      <h3>📯 ${esc(b.name)} (${esc(b.jp)}) is raging nearby!</h3>
      <p class="flavor">${esc(b.desc)}</p>
      <p><b>${esc(sides.a)}</b> ⚔ <b>${esc(sides.b)}</b></p>
      <p class="flavor">Join the fray — or leave before the armies march (traveling on resolves it without you).</p>
      <div class="btn-row">
        <button class="btn big" data-act="join-battle" data-id="a">⚔ Fight for ${esc(sides.a)}</button>
        <button class="btn big" data-act="join-battle" data-id="b">⚔ Fight for ${esc(sides.b)}</button>
        <button class="btn ghost" data-act="skip-battle">Stay out of it</button>
      </div></div>`;
  }

  return `
  <div class="screen explore-screen" style="${bgStyle(loc.bg)}">
    <div class="explore-head">
      <h2>${esc(loc.name)} <span class="jp">${esc(loc.jp)}</span></h2>
      <p class="flavor">${esc(loc.desc)}</p>
      <p class="flavor">🦊 <i>“${esc(Aiko.aikoLine(S, { situation: 'idle' }))}”</i></p>
    </div>
    ${battleBanner}
    <div class="explore-scene" aria-label="Explore ${esc(loc.name)}">
      ${spots.map(p => `<button class="hotspot" style="left:${p.x}%;top:${p.y}%"
          data-act="${p.act}" data-id="${esc(p.id || '')}" title="${esc(p.label)}">
        <span class="hs-icon">${p.icon}</span><span class="hs-label">${esc(p.label)}</span>${p.sub ? `<span class="hs-sub">${esc(p.sub)}</span>` : ''}
      </button>`).join('')}
    </div>
    <div class="loc-card">
      ${servingHere ? `<div class="btn-row"><button class="btn big" data-act="missions">📜 Missions for ${esc(Factions.factionDisplayName(S, S.world.service.faction))}</button></div>` : ''}
      ${canFinale ? `<div class="finale"><button class="btn big danger" data-act="finale">🔔 Enter Honnō-ji — face the Hollow Bell</button></div>` : ''}
      ${tidingsHtml(4)}
      <div class="btn-row">
        <button class="btn big" data-act="map">🗺 Travel</button>
        <button class="btn ghost" data-act="wait">⏳ Wait a day</button>
        <button class="btn ghost" data-act="factions">👑 The Great Clans</button>
        <button class="btn ghost" data-act="quests">📜 Quests</button>
      </div>
      <div id="loc-msg"></div>
    </div>
  </div>`;
}
// ---------------------------------------------------------------- DIALOGUE
function startDialogue(npcId) {
  const npc = DLG.resolveNpc(S, npcId);
  if (!npc) return;
  if (DLG.isDaimyoNpc(npcId)) St.rememberNpc(S, npcId, 'met', true);
  else St.rememberNpc(S, npcId, 'met', true);
  dlg = { npcId, npc, beats: npc.greet(S), idx: 0, topic: null, choices: null, afterBeats: null, notes: [] };
  screen = 'dialogue';
  render();
}

function renderDialogue() {
  const { npc, beats, idx } = dlg;
  const arch = DLG.npcPortraitFor(npc);
  const label = npc.archetype === 'daimyo' ? `${Factions.factionDisplayName(S, npc.faction)} — Daimyo` : (DLG.ARCHETYPES[npc.archetype] || {}).label || '';
  if (idx < beats.length) {
    const beat = beats[idx];
    const sp = speakerInfo(beat.who);
    const text = DLG.beatText(S, beat);
    return `
    <div class="screen dlg-screen">
      <div class="dlg-box">
        <div class="dlg-head">${sp.port}<div><b>${esc(sp.name || '—')}</b><br><small>${esc(label)}</small></div></div>
        <div class="dlg-text">${esc(text).replace(/\n/g, '<br>')}</div>
        <div class="btn-row"><button class="btn big" data-act="dlg-next">▼ Continue</button></div>
      </div>
    </div>`;
  }
  if (dlg.choices) {
    return `
    <div class="screen dlg-screen"><div class="dlg-box">
      <div class="dlg-head">${portrait(arch.portrait, arch.fallback)}<div><b>${esc(npc.name)}</b><br><small>Choose — the world will remember.</small></div></div>
      <div class="btn-grid">${dlg.choices.map((c, i) => {
        const ok = !c.need || c.need(S);
        return `<button class="btn choice" data-act="dlg-choice" data-id="${i}" ${ok ? '' : 'disabled'}>${esc(c.label)}</button>`;
      }).join('')}</div>
      <div class="btn-row"><button class="btn ghost" data-act="dlg-topics">← Back</button></div>
    </div></div>`;
  }
  const topics = npc.topics.filter(t => !t.need || t.need(S));
  return `
  <div class="screen dlg-screen"><div class="dlg-box">
    <div class="dlg-head">${portrait(arch.portrait, arch.fallback)}<div><b>${esc(npc.name)}</b><br><small>${esc(label)} — what will you discuss?</small></div></div>
    <div class="btn-grid">
      ${topics.map(t => `<button class="btn" data-act="dlg-topic" data-id="${t.id}">💬 ${esc(t.label)}</button>`).join('')}
    </div>
    <div class="btn-row"><button class="btn ghost" data-act="location">Leave</button></div>
    ${dlg.notes.length ? `<div class="notes">${dlg.notes.map(n => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
  </div></div>`;
}

function dialogueNext() {
  dlg.idx += 1;
  if (dlg.idx >= dlg.beats.length && dlg.afterBeats === 'topics') dlg.afterBeats = null;
  render();
}

// ---------------------------------------------------------------- interactive H-scenes (Dragon Knight 4 flavor)
// Clickable hotspots over tasteful CG art; explicit content lives in the text.
// Only reachable via the hscene topic, which exists solely on adult NPCs.
function startScene(sceneId, npcId) {
  const sc = Scenes.SCENES[sceneId];
  const npc = DLG.resolveNpc(S, npcId);
  hscene = { sceneId, npcId, stageIdx: 0, touches: 0, seen: {}, log: [sc.stages[0].intro(npc.name)] };
  screen = 'hscene';
  render();
}

function renderScene() {
  const sc = Scenes.SCENES[hscene.sceneId];
  const npc = DLG.resolveNpc(S, hscene.npcId);
  const stage = sc.stages[hscene.stageIdx];
  const cg = npc.sceneCg || sc.cg;
  const done = hscene.touches >= stage.need;
  const hearts = '❤'.repeat(Math.min(hscene.touches, stage.need)) + '🤍'.repeat(Math.max(0, stage.need - hscene.touches));
  const last = hscene.stageIdx === sc.stages.length - 1;
  return `
  <div class="screen hscene-screen" style="background-image:url('assets/${esc(cg)}')">
    <div class="hscene-top"><span>🌙 <b>${esc(npc.name)}</b> — ${esc(stage.title)}</span><span class="hearts">${hearts}</span></div>
    <div class="hscene-spots">
      ${done ? '' : stage.spots.map(sp =>
        `<button class="hotspot" style="left:${sp.x}%;top:${sp.y}%" data-act="scene-touch" data-id="${sp.id}" title="${esc(sp.label)}">${sp.icon}</button>`
      ).join('')}
    </div>
    <div class="hscene-log">${hscene.log.slice(-6).map(t => `<p>${esc(t)}</p>`).join('')}</div>
    ${done
      ? `<div class="hscene-next"><p>${esc(stage.advance(npc.name))}</p><div class="btn-row">
           ${last
             ? `<button class="btn big" data-act="scene-end">🌅 Rest until morning</button>`
             : `<button class="btn big" data-act="scene-next">❤ Continue</button>`}
         </div></div>`
      : `<div class="hscene-hint">Touch the glowing spots… ${stage.need - hscene.touches} more</div>`}
  </div>`;
}

// ---------------------------------------------------------------- COMBAT
function startCombat(enemyIdOrObj, returnTo = 'location', battle = null) {
  combat = Combat.createCombat(S, enemyIdOrObj);
  combat.battle = battle; // {id, side} when joining a historical battle
  combatReturn = returnTo;
  combatPhase = 'menu';
  combatNotes = [];
  screen = 'combat';
  render();
}

function renderCombat() {
  const c = combat, e = c.enemy;
  const log = c.log.slice(-9).map(l => `<p>${esc(l)}</p>`).join('');
  const telegraph = c.enemyTelegraph ? `<p class="tele">🔮 Aiko: “It's going to ${esc(c.enemyTelegraph.label.toLowerCase())}!”</p>` : '';
  let actions = '';
  if (combatPhase === 'menu') {
    actions = `<div class="btn-grid">
      <button class="btn big" data-act="c-attack">⚔ Attack</button>
      <button class="btn big" data-act="c-spell">🔮 Onmyōdō</button>
      <button class="btn big" data-act="c-item">🎒 Item</button>
      <button class="btn big" data-act="c-aiko">🦊 Aiko: ${esc(Combat.AIKO_ORDERS[c.aikoOrder].name)}</button>
      <button class="btn ghost" data-act="c-flee">🏃 Flee</button>
    </div>`;
  } else if (combatPhase === 'spell') {
    actions = `<div class="btn-grid">${Object.entries(Combat.SPELLS).map(([id, sp]) =>
      `<button class="btn" data-act="c-cast" data-id="${id}" ${S.player.rei < sp.cost ? 'disabled' : ''}>${esc(sp.name)} (${sp.cost}🔮)<br><small>${esc(sp.desc)}</small></button>`
    ).join('')}</div><div class="btn-row"><button class="btn ghost" data-act="c-back">← Back</button></div>`;
  } else if (combatPhase === 'item') {
    const usable = S.player.inventory.filter(i => ['herb', 'spirit_pill', 'bride_charm'].includes(i.id));
    actions = `<div class="btn-grid">${usable.length ? usable.map(i =>
      `<button class="btn" data-act="c-use" data-id="${i.id}">${esc(St.ITEMS[i.id].name)} ×${i.qty}</button>`
    ).join('') : '<p class="flavor">No usable items.</p>'}</div><div class="btn-row"><button class="btn ghost" data-act="c-back">← Back</button></div>`;
  } else if (combatPhase === 'aiko') {
    actions = `<div class="btn-grid">${Object.entries(Combat.AIKO_ORDERS).map(([id, o]) =>
      `<button class="btn" data-act="c-order" data-id="${id}">🦊 ${esc(o.name)}<br><small>${esc(o.desc)}</small></button>`
    ).join('')}</div><div class="btn-row"><button class="btn ghost" data-act="c-back">← Back</button></div>`;
  } else if (combatPhase === 'spare') {
    actions = `<div class="spare-box"><h3>${esc(e.name)} is faltering!</h3>
      <p class="flavor">🦊 <i>“${esc(Aiko.battleBanter(S, c))}”</i></p>
      <div class="btn-row">
        <button class="btn big" data-act="c-spare">🕊 SPARE it</button>
        <button class="btn big danger" data-act="c-finish">⚔ FINISH it</button>
      </div></div>`;
  } else if (combatPhase === 'over') {
    const won = c.result === 'victory';
    actions = `<div class="spare-box"><h3>${c.result === 'fled' ? 'You fled the battle.' : won ? '🏆 Victory!' : '💀 Defeat…'}</h3>
      ${combatNotes.map(n => `<p class="flavor">${esc(n)}</p>`).join('')}
      <div class="btn-row"><button class="btn big" data-act="c-continue">Continue →</button></div></div>`;
  }
  return `
  <div class="screen combat-screen" style="${bgStyle('bg_battlefield.png')}">
    <div class="combat-card">
      <div class="foe">
        ${portrait(e.sprite, e.kind === 'yokai' ? '👹' : '⚔️', 'portrait foe-port')}
        <div class="foe-info"><h2>${esc(e.name)} <span class="jp">${esc(e.jp)}</span></h2>
        <p class="flavor">${esc(e.desc)}</p>${bar(e.hp, e.maxHp, 'ehp')}</div>
      </div>
      <div class="ally-row">
        <div class="ally">${bar(S.player.hp, S.player.maxHp, 'hp')}${bar(S.player.rei, S.player.maxRei, 'rei')}<small>${esc(S.player.name)} — ATK ${Combat.playerAttack(S)} / DEF ${Combat.playerDefense(S) + (c.playerBuffs.ward > 0 ? 6 : 0)}</small></div>
        <div class="ally">${bar(S.aiko.hp, S.aiko.maxHp, 'ahp')}<small>🦊 Aiko (bond ${S.aiko.bond})</small></div>
      </div>
      <p class="round">Round ${c.round}${c.battle ? ` — fighting for ${esc(History.battleSidesText(c.battle.id)[c.battle.side])}` : ''}</p>
      ${telegraph}
      <div class="combat-log">${log}</div>
      ${actions}
    </div>
  </div>`;
}

function combatAction(action) {
  const { events, end } = Combat.doRound(combat, S, action);
  combat.log.push(...events);
  if (!combat.warned && S.player.hp > 0 && S.player.hp / S.player.maxHp < 0.3 && !combat.over) {
    combat.warned = true;
    combat.log.push('🦊 Aiko: “' + Aiko.aikoLine(S, { situation: 'lowhp' }) + '”');
  }
  handleCombatEnd(end);
  render();
}

function battleAftermath(wonSkirmish) {
  // resolving a historical battle the player joined
  const b = combat.battle;
  const news = [];
  const side = wonSkirmish ? b.side : null;
  const r = History.resolveBattle(S, b.id, side, wonSkirmish, news);
  combatNotes.push(...news.map((n) => '📯 ' + n));
  if (r.upset) {
    St.bondChange(S, 8, 'changed history together');
    combatNotes.push(`🦊 Aiko: “${Aiko.aikoLine(S, { situation: 'victory' })}”`);
  }
  const promo = Factions.promoteCheck(S);
  if (promo) combatNotes.push(`📜 Promoted to ${promo}!`);
}

function handleCombatEnd(end) {
  if (!end) return;
  if (end === 'spare_offer') { combatPhase = 'spare'; return; }
  if (end === 'fled') {
    if (combat.battle) { battleAftermath(false); }
    else if (combat.mission) { finishMissionBattle(false); }
    combatPhase = 'over'; return;
  }
  if (end === 'victory') {
    const r = Combat.victoryRewards(combat, S);
    combat.log.push(...r.out);
    if (combat.battle) battleAftermath(true);
    else if (combat.mission) finishMissionBattle(true);
    const qn = Quests.onCombatVictoryQuest(S, combat.enemyId, !!combat.spared);
    combatNotes.push(...qn);
    if (!combat.warned2) { combat.warned2 = true; combatNotes.push(Aiko.aikoLine(S, { situation: 'victory' })); }
    const promo = Factions.promoteCheck(S);
    if (promo) combatNotes.push(`📜 Promoted to ${promo}!`);
    combatPhase = 'over';
    St.saveGame(S);
    return;
  }
  if (end === 'defeat') {
    const lost = Combat.defeatPenalty(S);
    combat.log.push(`Darkness takes you… You wake on the roadside, ${lost} gold lighter.`);
    if (combat.battle) battleAftermath(false);
    else if (combat.mission) finishMissionBattle(false);
    combatNotes.push(Aiko.aikoLine(S, { situation: 'defeat' }));
    combatPhase = 'over';
    St.saveGame(S);
  }
}

// ---------------------------------------------------------------- MISSIONS
function renderMissions() {
  const fid = S.world.service.faction;
  if (!fid) return `<div class="screen"><p>No lord, no missions. Pledge service to a daimyo first.</p><div class="btn-row"><button class="btn ghost" data-act="location">← Back</button></div></div>`;
  const fname = Factions.factionDisplayName(S, fid);
  const active = S.world.activeMission;
  return `
  <div class="screen"><h2>📜 Missions — ${esc(fname)} <span class="flavor">(${esc(Factions.rankName(S))})</span></h2>
  <p class="flavor">Missions take days. The realm does not wait — history advances while you work.</p>
  ${active ? `<div class="mission active"><h3>🗡 Active: ${esc(active.title)}</h3><p class="flavor">${esc(active.desc)}</p>
    <p class="flavor">Takes ${active.days} days. Reward: ${active.gold}g, +${active.rep} rep, +${active.fame} fame.</p>
    <button class="btn big" data-act="mission-go">Undertake it →</button></div>`
  : `<div class="btn-grid">${missionList.map((m, i) => `
    <button class="btn" data-act="mission-take" data-id="${i}"><b>${esc(m.title)}</b> <small>(${m.days}d)</small><br>
    <small>${esc(m.desc)}</small><br><small>Reward: ${m.gold}g · +${m.rep} rep · +${m.fame} fame</small></button>`).join('')}</div>
    <div class="btn-row"><button class="btn ghost" data-act="mission-refresh">🔄 Ask for different work</button></div>`}
  <div class="btn-row"><button class="btn ghost" data-act="location">← Back</button></div></div>`;
}

function completeMission(s, m, wonBattle) {
  if (!m._daysAdvanced) St.advanceHours(s, m.days * 24);
  m._daysAdvanced = false;
  let ok = true;
  const notes = [];
  if (m.kind === 'intrigue') {
    const stat = m.stat === 'agi' ? s.player.agi : s.player.level * 2;
    ok = Math.random() * 100 < 40 + stat * 5;
    notes.push(ok ? 'Your scheming succeeds flawlessly. No one suspects the quiet onmyōji.' : 'You are noticed asking questions. The mission fails — and tongues wag.');
  } else if (m.kind === 'battle') {
    ok = wonBattle;
    notes.push(ok ? 'The task is done. Bloodied, but done.' : 'You were driven off. The task goes unfinished.');
  } else {
    notes.push('The letter is delivered, the convoy guarded. Quiet, honest work.');
  }
  const news = History.processDate(s);
  if (ok) {
    St.addGold(s, m.gold);
    Factions.changeRep(s, m.fid, m.rep);
    St.addFame(s, m.fame);
    const r = St.addExp(s, m.exp);
    notes.push(`Reward: +${m.gold} gold, +${m.rep} rep, +${m.fame} fame, +${m.exp} EXP${r.leveled ? ` — LEVEL UP (Lv${s.player.level})` : ''}.`);
    const promo = Factions.promoteCheck(s);
    if (promo) notes.push(`📜 PROMOTION! You are now ${promo} of ${Factions.factionDisplayName(s, m.fid)}.`);
    const bl = Aiko.aikoLine(s, { situation: 'victory' });
    notes.push(`🦊 Aiko: “${bl}”`);
  } else {
    Factions.changeRep(s, m.fid, -3);
    notes.push('(Reputation -3.)');
  }
  s.world.activeMission = null;
  return { notes, news };
}

function finishMissionBattle(won) {
  const m = combat.mission;
  const { notes, news } = completeMission(S, m, won);
  combatNotes.push(...notes.map((n) => '📜 ' + n));
  combatNotes.push(...news.map((n) => '📯 ' + n));
  pushNews(news);
}

function scaledMissionEnemy(s, m) {
  const base = Combat.ENEMIES[m.enemy] || Combat.ENEMIES.ronin;
  const mult = 1 + (m.minRank || 0) * 0.25;
  return {
    ...base, maxHp: Math.round(base.hp * mult), hp: Math.round(base.hp * mult),
    atk: Math.round(base.atk * mult), def: Math.round(base.def * mult),
    exp: Math.round(base.exp * mult), gold: Math.round(base.gold * mult),
  };
}

// ---------------------------------------------------------------- STATUS
function renderStatus() {
  const p = S.player;
  const quests = [...Quests.activeQuests(S)];
  const inv = p.inventory.map(i => {
    const def = St.ITEMS[i.id];
    return `<div class="inv-row"><span><b>${esc(def.name)}</b> ×${i.qty}<br><small>${esc(def.desc)}</small></span>
      ${['herb', 'spirit_pill', 'sweet_buns'].includes(i.id) ? `<button class="btn small" data-act="use-item" data-id="${i.id}">Use</button>` : ''}</div>`;
  }).join('') || '<p class="flavor">Empty pockets, full heart.</p>';
  const reps = Object.keys(Factions.FACTIONS).map(fid => {
    const st = Factions.factionState(S, fid);
    if (!st.active && st.rep === 0) return '';
    return `<div>${st.active ? '🏯' : '💀'} ${esc(Factions.factionDisplayName(S, fid))} — rep <b>${st.rep}</b>${st.active ? ` · str ${st.strength}` : ' (destroyed)'}</div>`;
  }).join('');
  const svc = S.world.service.faction;
  return `
  <div class="screen"><h2>📊 Status — ${esc(p.name)}</h2>
    <div class="stat-grid">
      <div>Level <b>${p.level}</b> (${p.exp}/${St.expNext(p.level)} EXP)</div>
      <div>❤ HP <b>${p.hp}/${p.maxHp}</b></div>
      <div>🔮 Rei <b>${p.rei}/${p.maxRei}</b></div>
      <div>⚔ ATK <b>${Combat.playerAttack(S)}</b> 🛡 DEF <b>${Combat.playerDefense(S)}</b> 💨 AGI <b>${p.agi}</b></div>
      <div>💰 Gold <b>${p.gold}</b></div>
      <div>⭐ Fame <b>${p.fame}</b> · 🎖 Honor <b>${p.honor}</b></div>
      <div>Karma <b>${karmaLabel()}</b></div>
      <div>Service <b>${serviceLabel()}</b></div>
      ${S.world.courtRank ? `<div>👑 Court rank: <b>${esc(Factions.COURT_RANKS[S.world.courtRank])}</b></div>` : ''}
    </div>
    <h3>🦊 Aiko — bound shikigami</h3>
    <div class="stat-grid"><div>HP <b>${S.aiko.hp}/${S.aiko.maxHp}</b></div><div>Bond <b>${S.aiko.bond}/100</b></div><div>Mood <b>${esc(S.aiko.mood)}</b></div></div>
    <p class="flavor"><i>“${esc(Aiko.aikoLine(S, { situation: 'idle' }))}”</i></p>
    <h3>🎒 Inventory</h3>${inv}
    <h3>👑 Standing with the great clans</h3><div class="stat-grid">${reps}</div>
    <h3>📜 Quests</h3>
    ${quests.map(q => `<p><b>${esc(q.title)}</b> <small>(${q.kind})</small><br><small>${esc(Quests.questJournalText(S, q.id))}</small></p>`).join('') || '<p class="flavor">No active quests.</p>'}
    ${tidingsHtml(8)}
    <div class="btn-row"><button class="btn ghost" data-act="location">← Back</button>
    <button class="btn danger" data-act="abandon">Abandon journey (delete save)</button></div>
    <div id="status-msg"></div>
  </div>`;
}

// ---------------------------------------------------------------- FACTIONS overview
function renderFactions() {
  const rows = Object.keys(Factions.FACTIONS).map(fid => {
    const st = Factions.factionState(S, fid);
    const dm = Factions.currentDaimyo(S, fid);
    const cap = MapX.getLocation(Factions.factionCapital(S, fid));
    const serving = S.world.service.faction === fid;
    return `<div class="inv-row"><span><b>${st.active ? '🏯' : '💀'} ${esc(Factions.factionDisplayName(S, fid))}</b> <span class="jp">${esc(Factions.factionJp(S, fid))}</span>
      ${serving ? '<b>— your lord</b>' : ''}<br>
      <small>${st.active ? `Lord: ${esc(dm.name)} · Seat: ${esc(cap.name)} · Strength ${st.strength}` : 'Destroyed by history.'}</small><br>
      <small>${esc(Factions.factionDef(fid).desc)}</small></span>
      <span>rep <b>${st.rep}</b></span></div>`;
  }).join('');
  return `<div class="screen"><h2>👑 The Great Clans</h2>
    <p class="flavor">Eleven powers shape Japan. Travel to a clan's seat to request an audience with its lord —
    pledge your sword, take missions, rise in rank... or play them against each other.</p>
    ${rows}
    <div class="btn-row"><button class="btn ghost" data-act="location">← Back</button></div></div>`;
}

// ---------------------------------------------------------------- SHOP
function renderShop() {
  const stock = ['herb', 'spirit_pill', 'sweet_buns', 'iron_talisman', 'warding_cord', 'sacred_sake', 'fine_silk', 'tea_set', 'war_horse'];
  return `
  <div class="screen"><h2>🛒 Daijirō's Wares <span class="flavor">— “Everything must go! Especially to you!”</span></h2>
  <p class="flavor">Your gold: <b>${S.player.gold}</b> · <small>Silk, tea utensils and war horses open doors at court.</small></p>
  ${stock.map(id => { const it = St.ITEMS[id]; return `<div class="inv-row"><span><b>${esc(it.name)}</b> — ${it.price}g<br><small>${esc(it.desc)}</small></span>
    <button class="btn small" data-act="buy" data-id="${id}" ${S.player.gold < it.price ? 'disabled' : ''}>Buy</button></div>`; }).join('')}
  <div class="btn-row"><button class="btn ghost" data-act="location">← Back</button></div></div>`;
}

// ---------------------------------------------------------------- ENDING (optional epilogue)
function renderEnding() {
  const tier = St.karmaTier(S.player.karma);
  const bond = S.aiko.bond;
  const endings = {
    benevolent: 'The disturbances fade. Villagers from Kutsuki to Sakai light lanterns in your name. You walk the roads not as a conqueror, but as a guardian — and the spirits bow as you pass.',
    kind: 'The bell is silent. You leave Honnō-ji with clean hands and a lighter heart. The era rages on, but wherever you walk, a little peace follows.',
    neutral: 'The bell is silent. History may not remember your name — but the roads are safer, and that is enough. Probably.',
    harsh: 'The bell is silent, broken by your hand. None dare bar your road now. The spirits whisper your name — in warning.',
    ruthless: 'The bell is silent because you devoured its echo. Power answers to power, and all of it answers to you. Even Aiko watches you a little warily now.',
  };
  const bondLine = bond >= 70 ? 'Aiko walks beside you, her paper sleeve brushing yours. "Wherever next, master? Together."'
    : bond >= 40 ? 'Aiko follows at a respectful distance. The contract holds — for now.'
    : 'Aiko\'s form flickers at the edge of your shadow. The bond is thin. One more cruelty might snap it.';
  return `
  <div class="screen title-screen" style="${bgStyle('bg_shrine.png')}">
    <div class="title-card"><div class="jp-title">終幕</div><h1>The Bell is Silent</h1>
    <p class="tagline">${esc(endings[tier])}</p>
    <p class="tagline"><i>🦊 ${esc(bondLine)}</i></p>
    <p class="flavor">But history marches on — and so do you. The realm remains yours to wander.</p>
    <p class="flavor">Karma: ${S.player.karma} (${tier}) · Aiko's bond: ${bond} · Level ${S.player.level} · Fame ${S.player.fame}</p>
    <button class="btn big" data-act="location">Keep wandering the land →</button>
    <button class="btn ghost" data-act="title">Return to title</button>
    </div></div>`;
}

// ---------------------------------------------------------------- events
function msg(t) { pendingMsg = t; }

// ---------------------------------------------------------------- WHISPER — private spirit bond with Aiko
// A floating panel (outside #app so it survives re-renders). Only the player
// hears this conversation — NPCs never see it. When the Aiko-chan server link
// is live, the real Aiko (LLM + inner voice) answers; otherwise she answers
// from local scripted lines.
let whOpen = false, whOnline = null, whBusy = false;
let whLog = [], whActions = [];

function initWhisper() {
  if (document.getElementById('whisper')) return;
  const el = document.createElement('div');
  el.id = 'whisper';
  el.className = 'whisper hidden';
  el.innerHTML = `
    <div class="wh-head"><span>🦊 <b>Spirit Bond</b></span>
      <small>mind-to-mind · no one else can hear</small>
      <span id="wh-stat" class="wh-stat">…</span>
      <button class="btn small ghost" data-act="wh-close">✕</button></div>
    <div id="wh-log" class="wh-log"></div>
    <div id="wh-actions" class="wh-actions"></div>
    <div class="wh-input">
      <input id="wh-text" maxlength="300" placeholder="Whisper to Aiko…" autocomplete="off">
      <button class="btn" data-act="wh-send">➤</button>
    </div>
    <div class="wh-foot"><button class="btn small ghost" data-act="wh-server">⚙ link: <span id="wh-url"></span></button></div>`;
  document.body.appendChild(el);
  el.querySelector('#wh-text').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); whisperSend(); }
  });
}

function whisperRender() {
  const log = document.getElementById('wh-log');
  if (!log) return;
  log.innerHTML = whLog.map(m =>
    `<p class="wh-${m.who}"><b>${m.who === 'you' ? 'You' : '🦊 Aiko'}:</b> ${esc(m.text)}</p>`).join('');
  log.scrollTop = log.scrollHeight;
  const stat = document.getElementById('wh-stat');
  if (stat) stat.textContent = whOnline === null ? '…' : whOnline ? '🟢 live' : '⚪ memory';
  const dot = document.getElementById('wh-dot');
  if (dot) dot.className = 'dot' + (whOnline === true ? ' on' : whOnline === false ? ' off' : '');
  const urlEl = document.getElementById('wh-url');
  if (urlEl) urlEl.textContent = Link.serverUrl().replace(/^https?:\/\//, '');
  const acts = document.getElementById('wh-actions');
  if (acts) acts.innerHTML = whActions.map((a, i) =>
    `<button class="btn small" data-act="wh-do" data-id="${i}">✨ ${esc(a.label)}</button>`).join('');
}

function offlineWhisper() {
  return Aiko.aikoLine(S, { situation: 'idle' }) +
    ' (My other self is out of reach — the Aiko-chan link is asleep. I answer from memory.)';
}

async function whisperSend() {
  const input = document.getElementById('wh-text');
  if (!input) return;
  const text = (input.value || '').trim();
  if (!text || whBusy || !S) return;
  input.value = '';
  whLog.push({ who: 'you', text });
  whBusy = true; whisperRender();
  try {
    if (whOnline === null) whOnline = await Link.linkOnline();
    if (whOnline) {
      const reply = await Link.talkToAiko(text, {
        name: S.player.name,
        loc: MapX.getLocation(S.player.location).name,
        date: St.dateLabel(S), bond: S.aiko.bond, karma: S.player.karma,
      });
      const { clean, actions } = Link.extractActions(reply);
      whLog.push({ who: 'aiko', text: clean || '…' });
      whActions = actions;
    } else {
      whLog.push({ who: 'aiko', text: offlineWhisper() });
      whActions = [];
    }
  } catch (e) {
    whOnline = false;
    whLog.push({ who: 'aiko', text: 'The bond flickers… I cannot reach my other self right now. (link error — I answer from memory: ' + offlineWhisper() + ')' });
    whActions = [];
  }
  whBusy = false; whisperRender();
  St.saveGame(S);
}

function whisperToggle() {
  const el = document.getElementById('whisper');
  if (!el || !S) return;
  whOpen = !whOpen;
  el.classList.toggle('hidden', !whOpen);
  if (whOpen && !whLog.length) {
    whLog.push({ who: 'aiko', text: '“This is our private bond, master. Speak, and no one else will hear.”' });
  }
  if (whOpen && whOnline === null) {
    Link.linkOnline().then((ok) => {
      whOnline = ok;
      if (!ok) whLog.push({ who: 'aiko', text: '“Hmm — I cannot feel my other self. The link must be asleep; I will answer from memory.”' });
      whisperRender();
    });
  }
  whisperRender();
  const input = document.getElementById('wh-text');
  if (whOpen && input) input.focus();
}

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const act = btn.dataset.act, id = btn.dataset.id;

  if (act === 'new') {
    const name = (document.getElementById('pname') || {}).value || 'Onmyoji';
    S = St.newGame(name.trim() || 'Onmyoji');
    Factions.initFactions(S);
    St.addNews(S, '📜 6th month, 1570. You arrive in Kyoto — a wandering onmyōji with a bound shikigami and no master. The realm is yours.');
    St.saveGame(S);
    screen = 'location'; render(); return;
  }
  if (act === 'continue') { S = St.loadGame(); if (S) { Factions.initFactions(S); screen = 'location'; render(); } return; }
  if (act === 'title') {
    whOpen = false;
    const wp = document.getElementById('whisper');
    if (wp) wp.classList.add('hidden');
    screen = 'title'; render(); return;
  }
  if (act === 'howto') { document.getElementById('howto').classList.toggle('hidden'); return; }
  if (!S) return;

  if ((screen === 'combat' || screen === 'dialogue') && (act === 'status')) return;

  switch (act) {
    case 'save': St.saveGame(S); msg('Progress saved. The kami approve of backups.'); break;
    case 'map': screen = 'map'; break;
    case 'location': screen = 'location'; break;
    case 'status': screen = 'status'; break;
    case 'factions': screen = 'factions'; break;
    case 'quests': screen = 'status'; break;
    case 'travel': {
      // leaving resolves a pending battle without you
      if (S.world.pendingBattle) {
        const news = [];
        History.resolveBattle(S, S.world.pendingBattle, null, false, news);
        pushNews(news);
      }
      const r = MapX.travel(S, id);
      if (!r.ok) { msg(r.reason); screen = 'map'; }
      else {
        pushNews(r.news);
        if (r.encounter) { St.saveGame(S); startCombat(r.encounter, 'location'); return; }
        msg(`You travel ${r.days} day${r.days > 1 ? 's' : ''} on the road.`);
        screen = 'location';
      }
      St.saveGame(S);
      break;
    }
    case 'talk': startDialogue(id); return;
    case 'audience': {
      const req = Factions.audienceReq(S, id);
      if (!req.ok) { msg('👑 ' + req.reason); break; }
      St.advanceHours(S, 3);
      S.world.metDaimyo[id] = true;
      Factions.changeRep(S, id, 1);
      pushNews(History.processDate(S));
      startDialogue('daimyo_' + id); return;
    }
    case 'missions':
      missionList = Factions.generateMissions(S, S.world.service.faction);
      screen = 'missions'; break;
    case 'mission-refresh':
      missionList = Factions.generateMissions(S, S.world.service.faction);
      screen = 'missions'; break;
    case 'mission-take': {
      const m = missionList[+id];
      if (!m) break;
      S.world.activeMission = m;
      msg(`Accepted: ${m.title}.`);
      St.saveGame(S); screen = 'missions'; break;
    }
    case 'mission-go': {
      const m = S.world.activeMission;
      if (!m) break;
      if (m.kind === 'battle') {
        St.advanceHours(S, m.days * 24);
        m._daysAdvanced = true;
        pushNews(History.processDate(S));
        const enemy = scaledMissionEnemy(S, m);
        combatReturn = 'missions';
        startCombat(enemy, 'missions');
        combat.mission = m;
        return;
      }
      const { notes, news } = completeMission(S, m, true);
      pushNews(news);
      msg(notes.join(' '));
      St.saveGame(S); screen = 'missions'; break;
    }
    case 'join-battle': {
      const b = History.BATTLES[S.world.pendingBattle];
      if (!b) break;
      const sides = History.battleSidesText(b);
      const foeName = id === 'a' ? sides.b : sides.a;
      const enemy = Combat.officerFor(S, `Officer of ${foeName}`);
      startCombat(enemy, 'location', { id: b.id, side: id });
      return;
    }
    case 'skip-battle': {
      const news = [];
      History.resolveBattle(S, S.world.pendingBattle, null, false, news);
      pushNews(news);
      msg('You watch the distant smoke and march on. History will not remember your absence.');
      St.saveGame(S); break;
    }
    case 'dlg-next': dialogueNext(); return;
    case 'scene-touch': {
      if (!hscene) break;
      const sc = Scenes.SCENES[hscene.sceneId];
      const stage = sc.stages[hscene.stageIdx];
      if (hscene.touches >= stage.need) break;
      const sp = stage.spots.find(x => x.id === id);
      if (!sp) break;
      const npc = DLG.resolveNpc(S, hscene.npcId);
      const n = (hscene.seen[sp.id] = (hscene.seen[sp.id] || 0) + 1);
      hscene.log.push(sp.texts[(n - 1) % sp.texts.length](npc.name));
      hscene.touches += 1;
      St.saveGame(S); render(); return;
    }
    case 'scene-next': {
      if (!hscene) break;
      const sc = Scenes.SCENES[hscene.sceneId];
      hscene.stageIdx += 1; hscene.touches = 0;
      const npc = DLG.resolveNpc(S, hscene.npcId);
      hscene.log.push(sc.stages[hscene.stageIdx].intro(npc.name));
      St.saveGame(S); render(); return;
    }
    case 'scene-end': {
      if (!hscene) break;
      const npcId = hscene.npcId;
      hscene = null; screen = 'location';
      applyEffects([{ heal: 40 }, { exp: 30 }, { flag: ['lovday_' + npcId, 'TODAY'] }, { bond: 2 }]);
      St.addNews(S, `🌙 A night of passion with ${esc(DLG.resolveNpc(S, npcId).name)} — the realm need never know.`);
      St.saveGame(S); render(); return;
    }
    case 'dlg-topics': dlg.choices = null; dlg.idx = dlg.beats.length; render(); return;
    case 'dlg-topic': {
      const t = dlg.npc.topics.find(t => t.id === id);
      if (!t) break;
      if (t.need && !t.need(S)) break;
      if (t.id === 'duel') {
        const dm = Factions.currentDaimyo(S, dlg.npc.faction);
        officerLabel = `${dm.name}'s Champion`;
      }
      dlg.topic = t;
      dlg.beats = t.beats(S);
      dlg.idx = 0; dlg.choices = null; dlg.afterBeats = t.choices ? 'choices' : 'topics';
      const fx = applyEffects(t.effects);
      dlg.notes.push(...fx.notes);
      if (fx.combat || fx.scene) { St.saveGame(S); return; }
      St.saveGame(S);
      render(); return;
    }
    case 'dlg-choice': {
      const c = dlg.choices[+id];
      if (!c || (c.need && !c.need(S))) break;
      dlg.beats = c.beats(S);
      dlg.idx = 0; dlg.choices = null;
      const { notes, combat: started } = applyEffects(c.effects);
      dlg.notes.push(...notes);
      if (started) { St.saveGame(S); return; }
      dlg.afterBeats = 'topics';
      St.saveGame(S);
      render(); return;
    }
    case 'inn': {
      const r = MapX.innRest(S, 20);
      if (!r.ok) { msg(r.reason); break; }
      pushNews(r.news);
      msg(`You rest till morning, wounds bound and spirit settled. 🦊 “You snore like a tanuki.”`);
      St.saveGame(S); break;
    }
    case 'wait': {
      const r = MapX.waitDay(S);
      pushNews(r.news);
      msg('You wait out a full day — watching the clouds, listening to the realm breathe.');
      St.saveGame(S); break;
    }
    case 'shrine': {
      MapX.shrinePray(S);
      const r = St.addKarma(S, 1);
      pushNews(r.news);
      msg(`You pray for two hours. Rei restored. (+1 karma → ${r.tier})`);
      St.saveGame(S); break;
    }
    case 'shop': screen = 'shop'; break;
    case 'buy': {
      const it = St.ITEMS[id];
      if (S.player.gold >= it.price) { St.addGold(S, -it.price); St.addItem(S, id, 1); msg(`Bought ${it.name}.`); }
      screen = 'shop'; break;
    }
    case 'use-item': {
      if (id === 'herb' && St.removeItem(S, id)) { St.healPlayer(S, 40); msg('Herb used. +40 HP.'); }
      else if (id === 'spirit_pill' && St.removeItem(S, id)) { S.player.rei = Math.min(S.player.maxRei, S.player.rei + 20); msg('Spirit pill used. +20 Rei.'); }
      else if (id === 'sweet_buns' && St.removeItem(S, id)) {
        const r = St.bondChange(S, 5, 'gift');
        msg(`You share sweet bean buns with Aiko. Bond +5 (now ${r.now}). “MY FAVORITE! …I mean. Thank you, master.”`);
      }
      screen = 'status'; St.saveGame(S); break;
    }
    case 'abandon':
      if (confirm('Abandon this journey? Your save will be deleted.')) { St.clearSave(); S = null; screen = 'title'; }
      break;
    // ---- whisper: private spirit bond ----
    case 'whisper': whisperToggle(); break;
    case 'wh-close': whOpen = false; document.getElementById('whisper').classList.add('hidden'); break;
    case 'wh-send': whisperSend(); return;
    case 'wh-server': {
      const cur = Link.serverUrl();
      const next = prompt('Aiko-chan server URL (empty = reset to default):', cur);
      if (next !== null) { Link.setServerUrl(next.trim()); whOnline = null; whisperRender(); }
      break;
    }
    case 'wh-do': {
      const a = whActions[+id];
      const def = a && Link.ACTION_DEFS[a.verb];
      if (!a || !def || whBusy) break;
      whBusy = true; whisperRender();
      (async () => {
        try {
          if (def.kind === 'server') {
            const r = await Link.performServerAction(a.verb, a.label);
            whLog.push({ who: 'aiko', text: `✨ ${a.label} — ${r.text}` });
          } else if (a.verb === 'cheer') {
            const r = St.bondChange(S, 2, 'cheered up by Aiko');
            whLog.push({ who: 'aiko', text: `“There — smile, master. The realm is less dreary already.” (Bond +2 → ${r.now})` });
          }
          St.saveGame(S);
        } catch (e) {
          whLog.push({ who: 'aiko', text: 'It did not work… the spirits are being difficult today.' });
        }
        whActions = []; whBusy = false; whisperRender();
      })();
      break;
    }
    // ---- explore flavor hotspots ----
    case 'x-rumor': {
      St.advanceHours(S, 1);
      pushNews(History.processDate(S));
      msg('👂 ' + Explore.RUMORS[Math.floor(Math.random() * Explore.RUMORS.length)]);
      St.saveGame(S); break;
    }
    case 'x-drills': {
      St.advanceHours(S, 2);
      const r = St.addExp(S, 3);
      pushNews(History.processDate(S));
      msg(`⚔ You watch the ashigaru drill until your own shoulders ache. (+3 EXP${r.leveled ? ` — LEVEL UP! Now level ${S.player.level}` : ''}) 🦊 “Sloppy footwork. Even I could do better, and I have no feet.”`);
      St.saveGame(S); break;
    }
    case 'x-restspot': {
      St.advanceHours(S, 2);
      St.healPlayer(S, 15);
      pushNews(History.processDate(S));
      msg('🌳 You rest in the shade, listening to the wind move through the land. (+15 HP)');
      St.saveGame(S); break;
    }
    case 'x-aiko': {
      msg('🦊 “' + Aiko.aikoLine(S, { situation: 'idle' }) + '”');
      break;
    }
    // ---- combat ----
    case 'c-attack': combatAction({ type: 'attack' }); return;
    case 'c-spell': combatPhase = 'spell'; break;
    case 'c-cast': combatPhase = 'menu'; combatAction({ type: 'spell', id }); return;
    case 'c-item': combatPhase = 'item'; break;
    case 'c-use': combatPhase = 'menu'; combatAction({ type: 'item', id }); return;
    case 'c-aiko': combatPhase = 'aiko'; break;
    case 'c-order': {
      combat.aikoOrder = id;
      if (id === 'strike' && S.aiko.hp / S.aiko.maxHp < 0.3) {
        combat.log.push('🦊 Aiko: “' + Aiko.onEvent(S, 'danger') + '”');
        St.bondChange(S, -2, 'ordered into danger while hurt');
      } else if (id !== 'auto') {
        St.bondChange(S, 1, 'heeded orders');
      }
      combatPhase = 'menu'; break;
    }
    case 'c-flee': combatAction({ type: 'flee' }); return;
    case 'c-back': combatPhase = 'menu'; break;
    case 'c-spare': {
      const r = Combat.resolveSpare(combat, S, 'spare');
      combat.log.push(...r.out);
      if (r.karma) combat.log.push('🦊 Aiko: “' + (Aiko.reactToKarma(S, r.karma.delta) || '…') + '”');
      St.bondChange(S, 2, 'showed mercy');
      if (combat.battle) battleAftermath(true);
      else if (combat.mission) finishMissionBattle(true);
      const vr = Combat.victoryRewards(combat, S);
      combat.log.push(...vr.out);
      combatNotes.push(...Quests.onCombatVictoryQuest(S, combat.enemyId, true));
      combatNotes.push(Aiko.aikoLine(S, { situation: 'victory' }));
      combatPhase = 'over'; St.saveGame(S); break;
    }
    case 'c-finish': {
      const r = Combat.resolveSpare(combat, S, 'finish');
      combat.log.push(...r.out);
      if (r.karma && r.karma.delta < 0) {
        combat.log.push('🦊 Aiko: “' + (Aiko.reactToKarma(S, r.karma.delta) || '…') + '”');
        St.bondChange(S, -2, 'finished a helpless foe');
      }
      if (combat.battle) battleAftermath(true);
      else if (combat.mission) finishMissionBattle(true);
      const vr = Combat.victoryRewards(combat, S);
      combat.log.push(...vr.out);
      combatNotes.push(...Quests.onCombatVictoryQuest(S, combat.enemyId, false));
      combatNotes.push(Aiko.aikoLine(S, { situation: 'victory' }));
      combatPhase = 'over'; St.saveGame(S); break;
    }
    case 'c-continue': {
      if (combat.battle || combat.mission) screen = 'location';
      else if (S.world.flags.game_complete && combat.enemyId === 'hollow_bell') screen = 'ending';
      else screen = combatReturn;
      combat = null; officerLabel = null; break;
    }
    case 'finale': startCombat('hollow_bell', 'location'); return;
  }
  render();
  const msgEl = document.getElementById('loc-msg') || document.getElementById('status-msg');
  let html = '';
  if (pendingMsg) html += `<p class="sysmsg">${esc(pendingMsg)}</p>`;
  if (pendingNews.length) html += `<div class="tidings flash">${pendingNews.map(n => `<p>${esc(n)}</p>`).join('')}</div>`;
  if (msgEl && html) msgEl.innerHTML = html;
  pendingMsg = ''; pendingNews = [];
});

// topic choices: after a topic's beats finish, show its moral choices (if any)
const _renderDialogue = renderDialogue;
renderDialogue = function () {
  if (dlg && dlg.idx >= dlg.beats.length && !dlg.choices && dlg.topic && dlg.topic.choices && dlg.afterBeats === 'choices') {
    dlg.choices = dlg.topic.choices;
    dlg.topic = null;
  }
  return _renderDialogue();
};

const RENDERERS = {
  title: renderTitle, map: renderMap, location: renderLocation,
  dialogue: renderDialogue, combat: renderCombat, status: renderStatus,
  shop: renderShop, ending: renderEnding, factions: renderFactions,
  missions: renderMissions, hscene: renderScene,
};

function render() {
  app.innerHTML = topbar() + RENDERERS[screen]();
}

initWhisper();
render();
