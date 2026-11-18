// Shared helpers for loading nLab content.
//  • dev server: live, through the Vite proxy at /nlab-api (ncatlab.org sends no CORS headers)
//  • static build (GitHub Pages): snapshots written by scripts/snapshot.mjs at build time
export const ORIGIN = 'https://ncatlab.org';
export const API = '/nlab-api';
export const LIVE = import.meta.env.DEV;

export const decodeName = (seg) => decodeURIComponent(seg.replace(/\+/g, ' '));
export const encodeName = (name) => encodeURIComponent(name).replace(/%20/g, '+');
export const pageUrl = (name) => (name === 'HomePage' ? './' : `page.html?p=${encodeName(name)}`);
export const liveUrl = (name) => `${ORIGIN}/nlab/show/${encodeName(name)}`;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Thrown in the static build when a page was not included in the snapshot.
export class NotInSnapshot extends Error {
  constructor(name) { super(`"${name}" is not in this snapshot`); this.page = name; }
}

// Map any nLab URL to its in-site equivalent; everything else becomes absolute.
export function rewriteHref(href) {
  if (!href || href.startsWith('#') || /^(page|cqts)\.html|^\.\//.test(href)) return href; // already in-site
  let u;
  try { u = new URL(href, `${ORIGIN}/nlab/show/`); } catch { return href; }
  if (u.protocol === 'javascript:') return '#';
  if (u.hostname === 'ncatlab.org') {
    const m = u.pathname.match(/^\/nlab\/show\/(.+)$/);
    if (m) return pageUrl(decodeName(m[1])) + u.hash;
  }
  return u.href;
}

// Strip anything executable and fix up links/images so a fragment is safe to insert.
export function clean(root) {
  root.querySelectorAll('script, iframe, object, embed, form, link, meta, style').forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((a) => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); });
  });
  root.querySelectorAll('a[href]').forEach((a) => {
    const h = rewriteHref(a.getAttribute('href'));
    a.setAttribute('href', h);
    if (/^https?:/.test(h)) { a.target = '_blank'; a.rel = 'noopener'; }
  });
  root.querySelectorAll('img[src]').forEach((img) => {
    img.src = new URL(img.getAttribute('src'), ORIGIN).href;
    img.loading = 'lazy';
  });
  return root;
}

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

let snapIndex;
const loadIndex = () => (snapIndex ??= fetch('snapshot/index.json').then((r) => (r.ok ? r.json() : { pages: {} })).catch(() => ({ pages: {} })));
export const snapshotMeta = async () => (await loadIndex()).fetchedAt || null;

// Fetch an nLab path; returns the parsed document and the final (post-redirect) nLab path.
export async function fetchDoc(path) {
  if (LIVE) {
    const res = await fetch(API + path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const finalPath = new URL(res.url).pathname.replace(/^\/nlab-api/, '');
    return { doc: parse(await res.text()), path: finalPath };
  }
  const idx = await loadIndex();
  if (path === '/nlab/latest_revisions') {
    const res = await fetch('snapshot/latest_revisions.html');
    if (!res.ok) throw new Error('No snapshot of latest revisions');
    return { doc: parse(await res.text()), path };
  }
  const m = path.match(/^\/nlab\/show\/(.+)$/);
  if (!m) throw new Error('Not available in the static build');
  const name = decodeName(m[1]);
  const entry = idx.pages?.[name] || idx.pages?.[name.toLowerCase()];
  if (!entry) throw new NotInSnapshot(name);
  const res = await fetch(`snapshot/${entry.file}`);
  if (!res.ok) throw new NotInSnapshot(name);
  return { doc: parse(await res.text()), path: `/nlab/show/${encodeName(entry.canonical)}` };
}

// Parse /nlab/latest_revisions into plain records.
export async function latestChanges(limit = 8) {
  const { doc } = await fetchDoc('/nlab/latest_revisions');
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

// Raw nLab source (Markdown+itex) of a page — from /nlab/source in dev, from the snapshot in the static build.
export async function fetchSource(name) {
  if (LIVE) {
    const res = await fetch(`${API}/nlab/source/${encodeName(name)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ta = parse(await res.text()).querySelector('textarea#content, textarea');
    if (!ta) throw new Error('No source on this page');
    return ta.value.replace(/^\n/, '');
  }
  const entry = (await loadIndex()).pages?.[name] || (await loadIndex()).pages?.[name.toLowerCase()];
  if (!entry?.source) throw new Error('The source of this page is not in this snapshot');
  const res = await fetch(`snapshot/${entry.source}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
