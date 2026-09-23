// aiko_link.js — live link between the browser game and the Aiko-chan
// Onmyoji game server (Jetson-local FastAPI, default port 8090).
//
// Two things ride on this link:
//  1. Private mind-to-mind chat with Aiko (POST /talk to="aiko"). The panel
//     is the "spirit bond": only the player hears her — NPCs never see it.
//  2. Aiko-proposed actions. When the player asks Aiko to make something
//     happen and she agrees, she appends [DO:label|verb] markers to her
//     reply; the client turns each marker into a real action button.
//
// Everything degrades gracefully: if the server is unreachable, chat falls
// back to local scripted lines and action buttons are hidden.

const URL_KEY = 'aiko_onmyoji_server_url';

export function defaultServerUrl() {
  try {
    const h = (typeof location !== 'undefined' && location.hostname) ? location.hostname : 'localhost';
    const p = (typeof location !== 'undefined' && location.protocol) ? location.protocol : 'http:';
    return `${p}//${h}:8090`;
  } catch {
    return 'http://localhost:8090';
  }
}

export function serverUrl() {
  try {
    return localStorage.getItem(URL_KEY) || defaultServerUrl();
  } catch {
    return defaultServerUrl();
  }
}

export function setServerUrl(u) {
  try {
    if (u) localStorage.setItem(URL_KEY, u.replace(/\/+$/, ''));
    else localStorage.removeItem(URL_KEY);
  } catch { /* private mode etc. */ }
}

async function post(path, body, timeoutMs = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(serverUrl() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error('server answered ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function linkOnline(timeoutMs = 2500) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(serverUrl() + '/api/onmyoji/health', { signal: ctl.signal });
    clearTimeout(t);
    return !!(r.ok && (await r.json()).ok);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ chat
// Marker protocol: Aiko appends [DO:label|verb] when she agrees to act.
const DO_RE = /\[DO:([^|\]\n]+)\|([a-z_]+)\]/g;

export function extractActions(text) {
  const actions = [];
  const clean = String(text || '').replace(DO_RE, (_m, label, verb) => {
    label = label.trim(); verb = verb.trim().toLowerCase();
    if (label && ACTION_DEFS[verb] && !actions.some(a => a.verb === verb)) {
      actions.push({ label, verb });
    }
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { clean, actions };
}

// Client-side action definitions. `server` verbs are executed through the
// Aiko-chan server's /act endpoint (its narrator describes the outcome);
// `local` verbs are resolved right here in the browser game by main.js.
export const ACTION_DEFS = {
  ward:   { kind: 'server', verb: 'ward',   args: {},                    hint: 'raise a protective ward' },
  divine: { kind: 'server', verb: 'ward',   args: { ritual: 'divine' },   hint: 'divine the near future' },
  purify: { kind: 'server', verb: 'ward',   args: { ritual: 'purify' },   hint: 'purify the area' },
  scout:  { kind: 'server', verb: 'search', args: { find: 'news of the road ahead' }, hint: 'scout the surroundings' },
  search: { kind: 'server', verb: 'search', args: {},                    hint: 'search the area' },
  rest:   { kind: 'server', verb: 'rest',   args: {},                    hint: 'rest and recover' },
  watch:  { kind: 'server', verb: 'command', args: { order: 'stand watch over the camp' }, hint: 'order Aiko to stand watch' },
  cheer:  { kind: 'local',  hint: 'Aiko cheers you up (bond +2)' },
};

const DO_VERBS_HINT = Object.keys(ACTION_DEFS).join(', ');

export async function talkToAiko(userText, ctx) {
  const context =
    `[Private spirit-bond: only your master hears you; no one else in the scene can hear this. ` +
    `Your master ${ctx.name} is at ${ctx.loc} on ${ctx.date}. Bond ${ctx.bond}/100, karma ${ctx.karma}.]`;
  const instruction =
    `If you promise to DO something concrete for your master, append at the very end up to two lines, ` +
    `each exactly like [DO:short label|verb] where verb is one of: ${DO_VERBS_HINT}. ` +
    `Example: [DO:Ward our camp|ward]. Use a marker only when you truly agree to act; never for mere chat.`;
  const data = await post('/talk', {
    to: 'aiko',
    text: `${context}\nMASTER SAYS: ${userText}\n${instruction}`,
  });
  if (!data || data.ok === false) throw new Error((data && data.error) || 'empty reply');
  return String(data.text || '…');
}

export async function performServerAction(verb, label) {
  const def = ACTION_DEFS[verb];
  if (!def || def.kind !== 'server') throw new Error('unknown action ' + verb);
  const r = await post('/act', { verb: def.verb, args: def.args || {} });
  const text = r.text || (r.effects || []).join(' ');
  return { ok: !!r.ok, text: text || `${label} — done.` };
}
