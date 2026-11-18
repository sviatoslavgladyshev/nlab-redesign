// Content layer.
//  • Pages: the nLab content mirror on GitHub (github.com/ncatlab/nlab-content) holds the source
//    of every page and is served with CORS headers, so any page loads straight into this UI.
//    snapshot/nlab-index.json (scripts/mirror-index.mjs) maps page names and redirects to files.
//  • Latest changes and the nForum: live through the Vite proxy in dev; in the static build from
//    the snapshot written by scripts/snapshot.mjs.
export const ORIGIN = 'https://ncatlab.org';
export const FORUM = 'https://nforum.ncatlab.org';
export const API = '/nlab-api';
export const FORUM_API = '/nforum-api';
export const LIVE = import.meta.env.DEV;
const MIRROR = 'https://raw.githubusercontent.com/ncatlab/nlab-content/master/pages/';

export const decodeName = (seg) => decodeURIComponent(seg.replace(/\+/g, ' '));
export const encodeName = (name) => encodeURIComponent(name).replace(/%20/g, '+');
export const pageUrl = (name) => (name === 'HomePage' ? './' : `page.html?p=${encodeName(name)}`);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class PageNotFound extends Error {
  constructor(name) { super(`There is no nLab page called “${name}” yet`); this.page = name; }
}

// Map any nLab / nForum URL to its in-site equivalent; everything else becomes absolute.
export function rewriteHref(href) {
  if (!href || href.startsWith('#') || /^(page|cqts|forum|index)\.html|^\.\//.test(href)) return href;
  let u;
  try { u = new URL(href, `${ORIGIN}/nlab/show/`); } catch { return href; }
  if (u.protocol === 'javascript:') return '#';
  if (u.hostname === 'ncatlab.org') {
    const m = u.pathname.match(/^\/nlab\/(?:show|edit|source|history|revision)\/([^/]+)/);
    if (m) return pageUrl(decodeName(m[1])) + u.hash;
    if (/^\/nlab\/(latest_revisions|recently_revised)/.test(u.pathname)) return 'page.html?recent';
    if (/^\/nlab\/(all_pages|list)/.test(u.pathname)) return 'page.html?all';
  }
  if (u.hostname === 'nforum.ncatlab.org') {
    const d = u.pathname.match(/^\/discussion\/(\d+)/);
    if (d) return `forum.html?d=${d[1]}${u.hash}`;
    if (u.pathname === '/' || u.pathname === '') return 'forum.html';
  }
  return u.href;
}

// Strip anything executable and fix up links/images so a fragment is safe to insert.
export function clean(root, base = ORIGIN) {
  root.querySelectorAll('script, iframe, object, embed, form, link, meta, style').forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((a) => { if (/^on/i.test(a.name) || (a.name === 'href' && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name); });
  });
  root.querySelectorAll('a[href]').forEach((a) => {
    const h = rewriteHref(a.getAttribute('href'));
    a.setAttribute('href', h);
    if (/^https?:/.test(h)) { a.target = '_blank'; a.rel = 'noopener'; }
  });
  root.querySelectorAll('img[src]').forEach((img) => {
    img.src = new URL(img.getAttribute('src'), base).href;
    img.loading = 'lazy';
  });
  return root;
}

export const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

/* ---------------- Page index & sources (mirror) ---------------- */
let indexP;
export function loadIndex() {
  return (indexP ??= fetch('snapshot/nlab-index.json').then((r) => (r.ok ? r.json() : { pages: [] })).catch(() => ({ pages: [] })).then((idx) => {
    const byName = new Map();
    const alias = new Map();
    for (const [dir, name, ...aliases] of idx.pages) {
      const e = { dir, name };
      byName.set(name.toLowerCase(), e);
      for (const a of aliases) if (!alias.has(a.toLowerCase())) alias.set(a.toLowerCase(), e);
    }
    return { ...idx, byName, alias, count: idx.pages.length };
  }));
}

// Resolve a page name the way nLab links do: exact, redirect, then simple plural/case variants.
export async function resolvePage(name) {
  const { byName, alias } = await loadIndex();
  const n = name.trim().replace(/\s+/g, ' ').toLowerCase();
  const tries = [n, n.replace(/_/g, ' '), n.replace(/ies$/, 'y'), n.replace(/es$/, ''), n.replace(/s$/, '')];
  for (const k of tries) {
    const e = byName.get(k) || alias.get(k);
    if (e) return e;
  }
  return null;
}

const sourceCache = new Map();
export async function fetchSource(name) {
  const e = await resolvePage(name);
  if (!e) {
    if (LIVE) { // brand-new pages may not have reached the mirror yet
      const res = await fetch(`${API}/nlab/source/${encodeName(name)}`);
      const ta = res.ok && parse(await res.text()).querySelector('textarea#content');
      if (ta) return { name, source: ta.value.replace(/^\n/, '') };
    }
    throw new PageNotFound(name);
  }
  if (!sourceCache.has(e.dir)) {
    sourceCache.set(e.dir, fetch(`${MIRROR}${e.dir}/content.md`).then((r) => {
      if (!r.ok) throw new Error(`Could not load “${e.name}” (HTTP ${r.status})`);
      return r.text();
    }));
  }
  try {
    return { name: e.name, source: await sourceCache.get(e.dir) };
  } catch (err) { sourceCache.delete(e.dir); throw err; }
}

// Search page names and redirects (instant, no server needed)
export async function searchPages(q, limit = 200) {
  const { pages } = await loadIndex();
  const ql = q.trim().toLowerCase();
  const words = ql.split(/\s+/).filter(Boolean);
  const hits = [];
  for (const [, name, ...aliases] of pages) {
    const l = name.toLowerCase();
    let score = -1;
    if (l === ql) score = 0;
    else if (l.startsWith(ql)) score = 1;
    else if (l.includes(ql)) score = 2;
    else if (aliases.some((a) => a.toLowerCase().includes(ql))) score = 3;
    else if (words.length > 1 && words.every((w) => l.includes(w))) score = 4;
    if (score >= 0) hits.push({ name, score, via: score === 3 ? aliases.find((a) => a.toLowerCase().includes(ql)) : null });
  }
  hits.sort((a, b) => a.score - b.score || a.name.length - b.name.length);
  return { total: hits.length, hits: hits.slice(0, limit) };
}

/* ---------------- Snapshot (latest changes, forum) ---------------- */
let snapIndex;
const loadSnap = () => (snapIndex ??= fetch('snapshot/index.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
export const snapshotMeta = async () => (await loadSnap()).fetchedAt || null;

// Fetch a live nLab/nForum path in dev, or its snapshot copy in the static build.
async function fetchLiveOrSnapshot(livePath, snapFile) {
  if (LIVE) {
    const res = await fetch(livePath);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parse(await res.text());
  }
  const res = await fetch(`snapshot/${snapFile}`);
  if (!res.ok) throw new Error('Not in this snapshot');
  return parse(await res.text());
}

// Parse /nlab/latest_revisions into plain records.
export async function latestChanges(limit = 8) {
  const doc = await fetchLiveOrSnapshot(`${API}/nlab/latest_revisions`, 'latest_revisions.html');
  return [...doc.querySelectorAll('#Content ul > li')]
    .filter((li) => li.querySelector('.revisedby'))
    .slice(0, limit)
    .map((li) => {
      const a = li.querySelector('a[href^="/nlab/show/"]');
      const by = li.querySelector('.revisedby');
      const author = by.querySelector('a')?.textContent.trim() || by.textContent.replace(/^\s*by\s*/, '').split(/\s+at\s+/)[0].trim();
      const when = (by.textContent.match(/at\s+(.+?\d{4})\s+at\s+(\d{1,2}:\d{2})/) || []);
      const rev = (li.querySelector('.views')?.textContent.match(/rev\s*#\s*(\d+)/) || [])[1];
      return { title: a?.textContent.trim(), href: rewriteHref(a?.getAttribute('href')), author, date: when[1] || '', time: when[2] || '', rev };
    });
}

// nForum: front page (list of discussions) and single discussions
export const forumFront = () => fetchLiveOrSnapshot(`${FORUM_API}/`, 'forum/index.html');
export const forumDiscussion = (id) => fetchLiveOrSnapshot(`${FORUM_API}/discussion/${id}/`, `forum/d${id}.html`);
