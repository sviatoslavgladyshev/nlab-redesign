// Forum: a custom front end for the nForum (Zulip), in the site's own design.
import { icons } from '../../ui/app.js';
import './forum.css';
import 'katex/dist/katex.min.css';
import { FORUM, esc, clean, pageUrl } from '../../core/nlab.js';
import * as F from '../../core/forum-data.js';
import { createSourceEditor } from '../../ui/codemirror.js';
import { openAccount } from '../../ui/account.js';

const $ = (s, r = document) => r.querySelector(s);
const main = $('#f-main');
const params = () => new URLSearchParams(location.search);
const go = (q, push = true) => {
  const url = `forum/${q ? `?${new URLSearchParams(q)}` : ''}`;
  if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
  route();
};

const CH_ICON = { 'Latest Changes': 'history', nLab: 'book-open', 'Mathematics, Physics & Philosophy': 'sigma',
  'nLab General Discussions': 'messages-square', 'nLab Technical Matters': 'server', 'n-Forum': 'users', 'Preprints & Publications': 'file-text' };
const CH_NOTE = {
  'Latest Changes': 'Automatic announcements of every nLab edit, with the author’s summary.',
  nLab: 'Discussion of individual nLab pages.',
  'Mathematics, Physics & Philosophy': 'Questions and discussion beyond any single page.',
  'nLab General Discussions': 'The nLab as a project: policies, conventions, plans.',
  'nLab Technical Matters': 'Software, rendering, servers and bugs.',
  'n-Forum': 'About the forum itself.',
  'Preprints & Publications': 'New papers relevant to the nLab.',
};

/* ---------- helpers ---------- */
const rel = (ts) => {
  const d = (Date.now() / 1000 - ts);
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 86400 * 7) return `${Math.round(d / 86400)} d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d > 86400 * 300 ? 'numeric' : undefined });
};
const initials = (n) => n.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const avatar = (name, size = 36) => `<span class="av" style="--h:${hue(name)};--s:${size}px" title="${esc(name)}">${esc(initials(name))}</span>`;
const icon = (name) => `<i data-lucide="${name}"></i>`;

function messageHTML(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  clean(d, FORUM);
  d.querySelectorAll('span.emoji').forEach((e) => {
    const code = [...e.classList].find((c) => /^emoji-[0-9a-f-]+$/.test(c));
    if (code) e.textContent = code.slice(6).split('-').map((h) => String.fromCodePoint(parseInt(h, 16))).join('');
  });
  d.querySelectorAll('.message_inline_image, .message_embed').forEach((e) => e.remove());
  return d.innerHTML;
}

/* ---------- account ---------- */
function renderAccount() {
  const a = F.auth.get();
  $('#f-account').innerHTML = a
    ? `<button class="acct" type="button" id="f-acct-btn" title="Signed in to nforum.ncatlab.org">${avatar(a.name, 30)}<span>${esc(a.name)}</span></button>`
    : `<button class="tbtn" type="button" data-act="signin">${icon('log-in')}<span>Sign in</span></button>`;
  $('#f-status').innerHTML = a
    ? `<span class="dot live"></span>Live · signed in as ${esc(a.name)} · <button type="button" class="linkish" data-act="signout">Sign out</button>`
    : '';
  F.forumInfo().then(({ fetchedAt, live }) => {
    if (!live && fetchedAt) $('#f-status').innerHTML = `<span class="dot"></span>Archive of ${new Date(fetchedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. <button type="button" class="linkish" data-act="signin">Sign in</button> for live updates and to post.`;
  });
  icons();
}

const openSignIn = () => openAccount('in');
addEventListener('account-change', () => { renderAccount(); route(); });

/* ---------- channels ---------- */
let CHANNELS = [];
async function renderChannels(activeId) {
  CHANNELS = await F.channels();
  const snapCh = F.isLive() ? [] : CHANNELS;
  const count = (c) => (c.topics ? c.topics.length : '');
  $('#f-channels').innerHTML = `
    <a href="forum/" class="${activeId == null ? 'on' : ''}" data-ch="">${icon('inbox')}<span>All discussions</span></a>
    ${CHANNELS.map((c) => `<a href="forum/?c=${c.id}" data-ch="${c.id}" class="${activeId === c.id ? 'on' : ''}">
      ${icon(CH_ICON[c.name] || 'hash')}<span>${esc(c.name)}</span><em>${count(c)}</em></a>`).join('')}`;
  icons();
  return snapCh;
}

/* ---------- views ---------- */
function topicRow(t, chId, chName) {
  const people = (t.people || []).map((p) => avatar(p.name, 26)).join('');
  const isEdit = chName === 'Latest Changes';
  return `<li><a class="topic" href="forum/?c=${chId}&t=${encodeURIComponent(t.t)}">
    <div class="t-main">
      <h3>${isEdit ? `<span class="t-tag">edit</span>` : ''}${esc(t.t)}</h3>
      <p>${esc(t.excerpt || '')}</p>
      <span class="t-meta">${chName ? `<span class="t-ch">${esc(chName)}</span>` : ''}${t.n} message${t.n === 1 ? '' : 's'} · last by ${esc(t.lastBy)} · ${rel(t.last)}</span>
    </div>
    <div class="t-people">${people}${t.npeople > 4 ? `<span class="av more">+${t.npeople - 4}</span>` : ''}</div>
  </a></li>`;
}

async function listView(chId, q) {
  let rows, title, note;
  if (q) {
    const all = await F.allTopics();
    const ql = q.toLowerCase();
    rows = all.filter((t) => t.t.toLowerCase().includes(ql) || (t.excerpt || '').toLowerCase().includes(ql)).slice(0, 80);
    title = `Topics matching “${q}”`;
    note = `${rows.length} found${rows.length === 80 ? ' (showing 80)' : ''}`;
    main.innerHTML = head(title, note) + (rows.length ? `<ul class="topics">${rows.map((t) => topicRow(t, t.channelId, t.channel)).join('')}</ul>`
      : `<div class="f-empty"><p>No topic matches “${esc(q)}”.</p><button class="tbtn primary" data-act="new" data-topic="${esc(q)}">${icon('plus')}<span>Start a topic “${esc(q)}”</span></button></div>`);
  } else if (chId == null) {
    const all = F.isLive() ? [] : (await F.allTopics()).filter((t) => t.channel !== 'Latest Changes');
    all.sort((a, b) => b.last - a.last);
    title = 'All discussions';
    note = 'The newest conversations across the forum. Edit announcements are under “Latest Changes”.';
    if (F.isLive()) {
      const lists = await Promise.all(CHANNELS.filter((c) => c.name !== 'Latest Changes').map(async (c) => (await F.topics(c.id)).map((t) => ({ ...t, channel: c.name, channelId: c.id }))));
      all.push(...lists.flat().sort((a, b) => b.last - a.last));
    }
    main.innerHTML = head(title, note) + `<ul class="topics">${all.slice(0, 60).map((t) => topicRow(t, t.channelId, t.channel)).join('')}</ul>`;
  } else {
    const c = CHANNELS.find((x) => x.id === chId);
    main.innerHTML = head(c?.name || 'Channel', CH_NOTE[c?.name] || c?.description || '') + '<div class="f-loading">Loading topics…</div>';
    const list = await F.topics(chId);
    main.innerHTML = head(c?.name || 'Channel', CH_NOTE[c?.name] || c?.description || '', chId)
      + `<ul class="topics">${list.slice(0, 150).map((t) => topicRow(t, chId)).join('')}</ul>`;
  }
  icons();
}
const head = (title, note, chId) => `<header class="f-list-head"><div><h2>${esc(title)}</h2>${note ? `<p>${esc(note)}</p>` : ''}</div>
  ${chId != null ? `<button class="tbtn" type="button" data-act="new" data-ch="${chId}">${icon('plus')}<span>New topic</span></button>` : ''}</header>`;

let composer;
function composerHTML(chId, topic, isNew) {
  if (!F.auth.get()) {
    return `<div class="compose signed-out">
      ${icon('message-square-plus')}
      <div><b>Join the discussion</b><p>Sign in with your nForum account to ${isNew ? 'start a topic' : 'reply'}. Messages are posted to nforum.ncatlab.org.</p></div>
      <button class="tbtn primary" type="button" data-act="signin">${icon('log-in')}<span>Sign in</span></button>
    </div>`;
  }
  const chOpts = CHANNELS.filter((c) => c.name !== 'Latest Changes').map((c) => `<option value="${c.id}" ${c.id === chId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `<form class="compose" id="compose">
    ${isNew ? `<div class="c-row"><select id="c-ch" aria-label="Channel">${chOpts}</select><input id="c-topic" placeholder="Topic title" value="${esc(topic || '')}" required></div>` : ''}
    <div class="c-editor" id="c-editor"></div>
    <div class="c-foot"><span class="c-hint">Markdown. Math: <code>$$x^2$$</code> inline, <code>\`\`\`math</code> blocks. Link pages with <code>[[name]]</code>.</span>
      <button class="tbtn primary" type="submit">${icon('send')}<span>${isNew ? 'Post topic' : 'Reply'}</span></button></div>
  </form>`;
}
function mountComposer(chId, topic, isNew) {
  const host = $('#c-editor');
  if (!host) return;
  composer = createSourceEditor({ parent: host, compact: true, placeholder: isNew ? 'What would you like to discuss?' : 'Write a reply…', onSave: () => $('#compose').requestSubmit() });
  $('#compose').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = composer.state.doc.toString().trim()
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, n, t) => `[${t || n}](https://ncatlab.org/nlab/show/${encodeURIComponent(n.trim()).replace(/%20/g, '+')})`);
    const ch = isNew ? +$('#c-ch').value : chId;
    const tp = isNew ? $('#c-topic').value.trim() : topic;
    if (!text || !tp) return;
    const btn = e.submitter;
    btn.disabled = true;
    try {
      await F.post(ch, tp, text);
      go({ c: ch, t: tp }, !isNew);
    } catch (err) {
      alert(`Could not post: ${err.message}`);
      btn.disabled = false;
    }
  });
}

async function threadView(chId, topic) {
  const c = CHANNELS.find((x) => x.id === chId);
  main.innerHTML = `<div class="f-loading">Loading…</div>`;
  const msgs = await F.thread(chId, topic);
  let prev = null;
  const body = msgs.map((m) => {
    const grouped = prev && prev.sender_id === m.sender_id && m.timestamp - prev.timestamp < 600;
    prev = m;
    const reacts = Object.values((m.reactions || []).reduce((acc, r) => {
      (acc[r.emoji_code] ??= { code: r.emoji_code, n: 0 }).n++;
      return acc;
    }, {})).map((r) => `<span class="react">${r.code.split('-').map((h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } }).join('')} ${r.n}</span>`).join('');
    return `<article class="msg${grouped ? ' grouped' : ''}" id="m${m.id}">
      ${grouped ? '<span class="av-gap"></span>' : avatar(m.sender_full_name, 38)}
      <div class="msg-body">
        ${grouped ? '' : `<header><b>${esc(m.sender_full_name)}</b><time datetime="${new Date(m.timestamp * 1000).toISOString()}" title="${new Date(m.timestamp * 1000).toLocaleString()}">${rel(m.timestamp)}</time></header>`}
        <div class="msg-content">${messageHTML(m.content)}</div>
        ${reacts ? `<div class="reacts">${reacts}</div>` : ''}
      </div>
    </article>`;
  }).join('');
  const isEdits = c?.name === 'Latest Changes';
  main.innerHTML = `
    <nav class="f-back"><a href="forum/?c=${chId}">${icon('arrow-left')}<span>${esc(c?.name || 'Back')}</span></a></nav>
    <header class="thread-head">
      <h2>${esc(topic)}</h2>
      <p>${msgs.length} message${msgs.length === 1 ? '' : 's'}${msgs.length ? ` · started ${rel(msgs[0].timestamp)}` : ''}</p>
      ${isEdits || c?.name === 'nLab' ? `<a class="tbtn" href="${pageUrl(topic)}">${icon('book-open')}<span>Open the page “${esc(topic)}”</span></a>` : ''}
    </header>
    <div class="msgs">${body || '<p class="f-empty">No messages in this snapshot.</p>'}</div>
    ${isEdits ? '' : composerHTML(chId, topic, false)}`;
  icons();
  mountComposer(chId, topic, false);
  const h = location.hash && document.getElementById(location.hash.slice(1));
  if (h) h.scrollIntoView({ block: 'center' });
}

function newTopicView(chId, topic) {
  main.innerHTML = `<header class="f-list-head"><div><h2>New topic</h2><p>Start a discussion. Mention the nLab pages it concerns with <code>[[page name]]</code>.</p></div></header>
    ${composerHTML(chId ?? CHANNELS.find((c) => c.name === 'nLab')?.id, topic, true)}`;
  icons();
  mountComposer(chId, topic, true);
}

/* ---------- router ---------- */
async function route() {
  const p = params();
  const c = p.has('c') ? +p.get('c') : null;
  const t = p.get('t');
  const q = p.get('q');
  $('#f-q').value = q || '';
  await renderChannels(c);
  document.title = t ? `${t} — nLab Forum` : 'Forum — nLab';
  try {
    if (p.has('new')) newTopicView(c, p.get('new'));
    else if (t && c != null) await threadView(c, t);
    else await listView(c, q);
  } catch (err) {
    main.innerHTML = `<div class="f-empty"><p>Could not load the forum (${esc(err.message)}).</p></div>`;
  }
  scrollTo({ top: 0 });
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="forum/"]');
  if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); history.pushState(null, '', a.getAttribute('href')); route(); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'signin') openSignIn();
  else if (b.dataset.act === 'signout') { F.signOut(); dispatchEvent(new CustomEvent('account-change')); }
  else if (b.dataset.act === 'new') {
    const q = { new: b.dataset.topic || '' };
    if (b.dataset.ch) q.c = b.dataset.ch;
    go(q);
  }
});
$('#f-new').addEventListener('click', () => go({ new: '' }));
$('#f-account').addEventListener('click', (e) => { if (e.target.closest('#f-acct-btn') && confirm('Sign out of the nForum in this browser?')) { F.signOut(); dispatchEvent(new CustomEvent('account-change')); } });
let qt;
$('#f-q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => go(e.target.value.trim() ? { q: e.target.value.trim() } : null, false), 250); });
addEventListener('popstate', route);

renderAccount();
route();
