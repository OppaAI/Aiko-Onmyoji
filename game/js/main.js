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
  const arch = DLG.ARCHETYPES[npc.archetype];
  return { name: npc.name, port: portrait(arch.portrait, arch.fallback) };
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
        <p>🌊 <b>Do anything</b> — serve a lord faithfully, betray him, get rich, or wander free. The realm keeps score.</p>
      </div>
      <p class="fine">A Rance-inspired structure & humor — all content strictly non-explicit.</p>
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
function renderLocation() {
  const loc = MapX.getLocation(S.player.location);
  const npcs = DLG.npcsAt(S, S.player.location);
  const fids = factionsHere();
  const hb = Quests.questState(S, 'hollow_bell');
  const canFinale = S.player.location === 'honnoji' && hb.stage === 5 && !S.world.flags.game_complete;
  const servingHere = fids.includes(S.world.service.faction);

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

  const factionBlock = fids.length ? `<h3>👑 Powers seated here</h3><div class="btn-grid">` +
    fids.map(fid => {
      const dm = Factions.currentDaimyo(S, fid);
      const serving = S.world.service.faction === fid;
      return `<button class="btn npc-btn" data-act="audience" data-id="${fid}">
        ${portrait(Factions.factionDef(fid).portrait, '👑', 'portrait sm')}
        <span>👑 <b>${esc(dm.name)}</b><br><small>${esc(Factions.factionDisplayName(S, fid))} (${esc(Factions.factionJp(S, fid))})${serving ? ' — <b>your lord</b>' : ''}</small><br>
        <small>Rep ${Factions.repOf(S, fid)} · Str ${Factions.factionState(S, fid).strength}</small></span></button>`;
    }).join('') + `</div>` : '';

  return `
  <div class="screen loc-screen" style="${bgStyle(loc.bg)}">
    <div class="loc-card">
      <h2>${esc(loc.name)} <span class="jp">${esc(loc.jp)}</span></h2>
      <p class="flavor">${esc(loc.desc)}</p>
      <p class="flavor">🦊 <i>“${esc(Aiko.aikoLine(S, { situation: 'idle' }))}”</i></p>
      ${battleBanner}
      ${factionBlock}
      ${npcs.length ? `<h3>People & spirits here</h3><div class="btn-grid">` +
        npcs.map(n => {
          const arch = DLG.ARCHETYPES[n.archetype];
          return `<button class="btn npc-btn" data-act="talk" data-id="${n.id}">${portrait(arch.portrait, arch.fallback, 'portrait sm')}<span>💬 ${esc(n.name)}<br><small>${esc(arch.label)}</small></span></button>`;
        }).join('') + `</div>` : `<p class="flavor">No one to talk to here — only the wind.</p>`}
      ${loc.services.length ? `<h3>Services</h3><div class="btn-row">` +
        loc.services.map(sv =>
          sv === 'inn' ? `<button class="btn" data-act="inn">🍶 Inn — rest till morning (20 gold)</button>` :
          sv === 'shop' ? `<button class="btn" data-act="shop">🛒 Browse wares</button>` :
          `<button class="btn" data-act="shrine">⛩ Pray at the shrine (2h)</button>`
        ).join('') +
        `<button class="btn ghost" data-act="wait">⏳ Wait a day</button></div>` : ''}
      ${servingHere ? `<div class="btn-row"><button class="btn big" data-act="missions">📜 Missions for ${esc(Factions.factionDisplayName(S, S.world.service.faction))}</button></div>` : ''}
      ${canFinale ? `<div class="finale"><button class="btn big danger" data-act="finale">🔔 Enter Honnō-ji — face the Hollow Bell</button></div>` : ''}
      ${tidingsHtml(4)}
      <div class="btn-row">
        <button class="btn big" data-act="map">🗺 Travel</button>
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
  if (act === 'title') { screen = 'title'; render(); return; }
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
    case 'dlg-topics': dlg.choices = null; dlg.idx = dlg.beats.length; render(); return;
    case 'dlg-topic': {
      const t = dlg.npc.topics.find(t => t.id === id);
      if (!t) break;
      if (t.id === 'duel') {
        const dm = Factions.currentDaimyo(S, dlg.npc.faction);
        officerLabel = `${dm.name}'s Champion`;
      }
      dlg.topic = t;
      dlg.beats = t.beats(S);
      dlg.idx = 0; dlg.choices = null; dlg.afterBeats = t.choices ? 'choices' : 'topics';
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
  missions: renderMissions,
};

function render() {
  app.innerHTML = topbar() + RENDERERS[screen]();
}

render();
