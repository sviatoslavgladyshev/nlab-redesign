// nForum data. The nForum runs on Zulip (nforum.ncatlab.org).
//  • Signed out: the snapshot in snapshot/forum/ (index + one file per topic).
//  • Signed in: live, through Zulip's REST API (/api/v1 allows cross-site requests with
//    credentials). Signing in exchanges email + password for an API key directly with
//    nforum.ncatlab.org; only that key is kept, in this browser.
import { FORUM } from './nlab.js';

const KEY = 'nforum-auth';
export const auth = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};
const authHeader = (a) => ({ Authorization: `Basic ${btoa(unescape(encodeURIComponent(`${a.email}:${a.key}`)))}` });

async function api(path, { method = 'GET', params, a = auth.get() } = {}) {
  const body = params && method !== 'GET' ? new URLSearchParams(params) : undefined;
  const qs = params && method === 'GET' ? `?${new URLSearchParams(params)}` : '';
  const res = await fetch(`${FORUM}/api/v1/${path}${qs}`, { method, body, headers: a ? authHeader(a) : {} });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.result !== 'success') throw new Error(json.msg || `HTTP ${res.status}`);
  return json;
}

export async function signIn(email, password) {
  const r = await api('fetch_api_key', { method: 'POST', params: { username: email, password }, a: null });
  const a = { email: r.email, key: r.api_key };
  const me = await api('users/me', { a });
  const full = { ...a, name: me.full_name, avatar: me.avatar_url, id: me.user_id };
  auth.set(full);
  return full;
}
export const signOut = () => auth.clear();

/* ---------- Grouping messages into topics (same shape as the snapshot index) ---------- */
const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); };
function groupTopics(messages) {
  const topics = new Map();
  for (const m of messages) {
    if (!topics.has(m.subject)) topics.set(m.subject, []);
    topics.get(m.subject).push(m);
  }
  return [...topics].map(([t, msgs]) => {
    msgs.sort((x, y) => x.id - y.id);
    const last = msgs[msgs.length - 1];
    const people = [...new Map(msgs.map((m) => [m.sender_id, { name: m.sender_full_name, avatar: m.avatar_url }])).values()];
    return { t, n: msgs.length, first: msgs[0].timestamp, last: last.timestamp, lastBy: last.sender_full_name,
      excerpt: plain(last.content).slice(0, 220), people: people.slice(0, 4), npeople: people.length, messages: msgs };
  }).sort((x, y) => y.last - x.last);
}

/* ---------- Public API ---------- */
let snap;
const snapshot = () => (snap ??= fetch('snapshot/forum/index.json').then((r) => (r.ok ? r.json() : { channels: [] })).catch(() => ({ channels: [] })));

export const isLive = () => !!auth.get();
export async function forumInfo() {
  const s = await snapshot();
  return { fetchedAt: s.fetchedAt, live: isLive() };
}

// Channels with their topics
export async function channels() {
  if (isLive()) {
    const { streams } = await api('streams', { params: { include_web_public: 'true' } });
    const s = await snapshot();
    const order = new Map(s.channels.map((c, i) => [c.id, i]));
    return streams.filter((c) => !c.invite_only)
      .sort((x, y) => (order.get(x.stream_id) ?? 99) - (order.get(y.stream_id) ?? 99))
      .map((c) => ({ id: c.stream_id, name: c.name, description: c.description, topics: null }));
  }
  return (await snapshot()).channels;
}

const liveCache = new Map();
export async function topics(channelId) {
  if (isLive()) {
    if (!liveCache.has(channelId)) {
      const r = await api('messages', { params: { anchor: 'newest', num_before: '1000', num_after: '0', apply_markdown: 'true',
        narrow: JSON.stringify([{ operator: 'channel', operand: channelId }]) } });
      liveCache.set(channelId, groupTopics(r.messages));
    }
    return liveCache.get(channelId);
  }
  return (await snapshot()).channels.find((c) => c.id === channelId)?.topics || [];
}

export async function thread(channelId, topic) {
  if (isLive()) {
    const r = await api('messages', { params: { anchor: 'newest', num_before: '1000', num_after: '0', apply_markdown: 'true',
      narrow: JSON.stringify([{ operator: 'channel', operand: channelId }, { operator: 'topic', operand: topic }]) } });
    return r.messages;
  }
  const t = (await topics(channelId)).find((x) => x.t === topic);
  if (!t) return [];
  const res = await fetch(`snapshot/forum/${t.file}`);
  return res.ok ? res.json() : [];
}

export async function post(channelId, topic, content) {
  const r = await api('messages', { method: 'POST', params: { type: 'stream', to: String(channelId), topic, content } });
  liveCache.delete(channelId);
  return r.id;
}

// All topics, newest first, for search / "Discuss this page"
export async function allTopics() {
  const s = await snapshot();
  return s.channels.flatMap((c) => c.topics.map((t) => ({ ...t, channel: c.name, channelId: c.id })));
}

// Latest page edits (from the "Latest Changes" channel of edit announcements)
export async function latestEdits(limit = 6) {
  const s = await snapshot();
  const ch = s.channels.find((c) => c.name === 'Latest Changes');
  return (ch?.topics || []).filter((t) => t.edit && !/^Sandbox/i.test(t.t)).slice(0, limit)
    .map((t) => ({ page: t.t, ...t.edit, when: t.last }));
}
