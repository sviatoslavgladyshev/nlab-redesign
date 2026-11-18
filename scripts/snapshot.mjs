// Build-time snapshot of the nForum for the static (GitHub Pages) build.
// The nForum is a Zulip server with public channels: its /json API answers anonymous requests
// but sends no CORS headers, so the browser can't read it from another site. In dev the Vite
// proxy reads it live; for the static build this script saves recent messages of every public
// channel into public/snapshot/forum.json. (Page content comes from the nLab content mirror;
// see scripts/mirror-index.mjs.)
//
//   node scripts/snapshot.mjs
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const FORUM = 'https://nforum.ncatlab.org';
const OUT = new URL('../public/snapshot/', import.meta.url);
const UA = { 'User-Agent': 'nlab-redesign-prototype (static snapshot)' };

async function messages(narrow, num) {
  const q = new URLSearchParams({ anchor: 'newest', num_before: String(num), num_after: '0', apply_markdown: 'true', narrow: JSON.stringify(narrow) });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${FORUM}/json/messages?${q}`, { headers: UA });
      if (res.ok) return (await res.json()).messages;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return [];
}
const slim = (m) => ({
  id: m.id, sender_id: m.sender_id, sender_full_name: m.sender_full_name, avatar_url: m.avatar_url,
  content: m.content, timestamp: m.timestamp, subject: m.subject, stream_id: m.stream_id, display_recipient: m.display_recipient,
  reactions: (m.reactions || []).map((r) => ({ emoji_name: r.emoji_name, emoji_code: r.emoji_code, user_id: r.user_id })),
});

// 1. Discover the public channels from recent traffic
const recent = await messages([{ operator: 'channels', operand: 'web-public' }], 1000);
const channels = new Map();
for (const m of recent) channels.set(m.stream_id, m.display_recipient);
// 2. Recent history of each channel
const out = [];
for (const [id, name] of channels) {
  const msgs = await messages([{ operator: 'channels', operand: 'web-public' }, { operator: 'channel', operand: id }], name === 'Latest Changes' ? 400 : 1200);
  out.push({ id, name, messages: msgs.map(slim) });
  console.log(`  ${name}: ${msgs.length} messages`);
  await new Promise((r) => setTimeout(r, 400));
}
// 3. Write a small index (channels → topics) plus one file per topic, loaded on demand
const DIR = new URL('forum/', OUT);
await rm(DIR, { recursive: true, force: true });
await mkdir(DIR, { recursive: true });
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&quot;/g, "'").replace(/\s+/g, ' ').trim();
const index = { fetchedAt: new Date().toISOString(), channels: [] };
let files = 0;
for (const ch of out) {
  const topics = new Map();
  for (const m of ch.messages) {
    if (!topics.has(m.subject)) topics.set(m.subject, []);
    topics.get(m.subject).push(m);
  }
  const list = [];
  for (const [t, msgs] of topics) {
    msgs.sort((a, b) => a.id - b.id);
    const file = `t-${createHash('sha1').update(`${ch.id}/${t}`).digest('hex').slice(0, 10)}.json`;
    await writeFile(new URL(file, DIR), JSON.stringify(msgs));
    files++;
    const last = msgs[msgs.length - 1];
    const people = [...new Map(msgs.map((m) => [m.sender_id, { name: m.sender_full_name, avatar: m.avatar_url }])).values()];
    // "Latest Changes" posts are edit announcements: <p>summary</p>… <p>author</p><p>diff, vN, current</p>
    let edit;
    if (ch.name === 'Latest Changes') {
      const ps = [...last.content.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
      const links = ps.pop() || '';
      edit = { author: text(ps.pop() || ''), summary: text(ps.join(' ')).slice(0, 200), rev: (links.match(/>v(\d+)</) || [])[1] || '' };
    }
    list.push({ t, file, n: msgs.length, ...(edit ? { edit } : {}), first: msgs[0].timestamp, last: last.timestamp, lastBy: last.sender_full_name,
      excerpt: text(last.content).slice(0, 220), people: people.slice(0, 4), npeople: people.length });
  }
  list.sort((a, b) => b.last - a.last);
  index.channels.push({ id: ch.id, name: ch.name, topics: list });
}
await writeFile(new URL('index.json', DIR), JSON.stringify(index));
await writeFile(new URL('index.json', OUT), JSON.stringify({ fetchedAt: index.fetchedAt }));
console.log(`Forum snapshot: ${out.length} channels, ${files} topics.`);
