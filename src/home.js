// Home page: shared behaviour + live widgets (recent edits, featured excerpt, page count,
// random page, "find or create a page", and a working LaTeX editor demo).
import './main.js';
import './home.css';
import { esc, clean, pageUrl, fetchSource, loadIndex, displayTitle } from './nlab.js';
import { attachSuggest, randomPage, loadNames, pageExists } from './suggest.js';
import { latestEdits } from './forum-data.js';
import credits from './data/credits.json';
import { heroField } from './hero-field.js';

const $ = (s) => document.querySelector(s);

// Old links pointed at CQTS anchors on the home page; those sections now live on cqts/.
const cqtsAnchors = ['cqts', 'Symposium2026', 'CQTSSymposium2026Materials', 'GladyshevSymposium2026', 'GolubSymposium2026',
  'SchreiberSymposium2026', 'SingSymposium2026', 'colloquium', 'research', 'events'];
const hash = decodeURIComponent(location.hash.slice(1));
if (cqtsAnchors.includes(hash)) location.replace(`cqts/${location.search}${hash === 'cqts' ? '' : `#${hash}`}`);

/* ---------- Page count ---------- */
loadIndex().then(({ count }) => {
  if (count) document.querySelectorAll('.stat-pages').forEach((el) => { el.textContent = count.toLocaleString('en-US'); });
});

/* ---------- Random page ---------- */
document.querySelectorAll('[data-random]').forEach((b) => b.addEventListener('click', async () => { location.href = pageUrl(await randomPage()); }));

/* ---------- Find or create a page → editor ---------- */
const open = $('#c-open');
if (open) {
  attachSuggest(open, { edit: true });
  open.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = open.querySelector('input').value.trim();
    if (!q) { open.querySelector('input').focus(); return; }
    await loadNames();
    const exact = pageExists(q);
    location.href = exact ? `${pageUrl(exact, 'edit')}` : `${pageUrl(q, 'new')}`;
  });
}

/* ---------- Recent edits (edit announcements from the forum) ---------- */
const rel = (ts) => {
  const d = Date.now() / 1000 - ts;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
async function renderEdits() {
  const list = $('#edits');
  if (!list) return;
  try {
    const edits = await latestEdits(6);
    if (!edits.length) throw new Error('empty');
    list.innerHTML = edits.map((e) => `<li><a href="${esc(pageUrl(e.page))}" title="${esc(e.summary || '')}"><b>${esc(displayTitle(e.page))}</b><time>${esc(rel(e.when))}</time><span>${esc(e.author || 'anonymous')}${e.summary ? ` — ${esc(e.summary.slice(0, 70))}${e.summary.length > 70 ? '…' : ''}` : ''}</span></a></li>`).join('');
    $('#edits-when').textContent = '';
  } catch {
    list.innerHTML = '<li class="edits-loading">Recent edits are listed under <a href="recent">Recent changes</a>.</li>';
  }
}
renderEdits();

/* ---------- Featured article: first paragraph of its "Idea" section ---------- */
async function renderFeatured() {
  const box = $('#featured-excerpt');
  if (!box) return;
  try {
    const { renderSource } = await import('./markup.js');
    const { source } = await fetchSource(decodeURIComponent(box.dataset.page.replace(/\+/g, ' ')));
    const idea = source.split(/^##\s+Idea\s*$/m)[1];
    const para = idea?.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p.length > 60 && !/^[$+#*{]/.test(p));
    if (!para) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = renderSource(para);
    clean(wrap);
    wrap.querySelectorAll('a').forEach((a) => a.replaceWith(...a.childNodes)); // no nested links inside the card link
    box.replaceChildren(...wrap.childNodes);
    box.classList.add('live');
  } catch { /* keep the static fallback text */ }
}
renderFeatured();

/* ---------- "Try it" editor demo ---------- */
const tryBox = $('#try');
if (tryBox) {
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const [{ createSourceEditor }, { renderSource }] = await Promise.all([import('./cm.js'), import('./markup.js')]);
    await import('katex/dist/katex.min.css');
    const ta = $('#try-src');
    const out = $('#try-out');
    const show = (src) => { out.innerHTML = renderSource(src); clean(out); out.querySelectorAll('a').forEach((a) => { a.target = '_blank'; }); };
    const host = document.createElement('div');
    host.className = 'try-cm';
    ta.replaceWith(host);
    createSourceEditor({ parent: host, doc: ta.value, compact: true, onChange: show });
    show(ta.value);
  }, { rootMargin: '200px' });
  io.observe(tryBox);
}

/* ---------- Image credits ---------- */
document.querySelectorAll('img[data-credit]').forEach((img) => {
  const c = credits[img.dataset.credit];
  if (c) img.title = `${c.title} — ${c.author || 'Wikimedia Commons'} (${c.license})`;
});
const list = $('#credits-list');
if (list) list.innerHTML = Object.values(credits).map((c) => `
  <li><a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.title)}</a> — ${esc(c.author || 'unknown')}, ${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license)}</li>`).join('');

/* ---------- Full-screen hero: the constellation of concepts ---------- */
const heroEl = document.querySelector('.hero-v3');
if (heroEl) heroField(heroEl);

/* ---------- Numbers and field counts from the library index ---------- */
fetch('snapshot/library.json').then((r) => r.json()).then((lib) => {
  const fmt = (n) => n.toLocaleString('en-US');
  const set = (k, v) => document.querySelectorAll(`[data-count="${k}"]`).forEach((el) => { el.textContent = v; });
  set('pages', fmt(lib.pages.length));
  set('people', fmt(lib.pages.filter((p) => p[1] === 'p').length));
  const top = lib.pages.reduce((m, p) => (p[2] > m[2] ? p : m), lib.pages[0]);
  document.querySelectorAll('[data-count="links"]').forEach((el) => { el.textContent = fmt(top[2]); el.nextElementSibling.textContent = `pages link to “${displayTitle(top[0])}”`; });
  const counts = lib.fields.map(() => 0);
  lib.pages.forEach((p) => new Set(p[3].map((s) => lib.subs[s][1])).forEach((f) => { if (f >= 0) counts[f] += 1; }));
  document.querySelectorAll('.hf-n[data-field]').forEach((el) => { el.textContent = `${fmt(counts[+el.dataset.field] || 0)} pages`; });
}).catch(() => {});

/* light that follows the pointer on the field tiles */
document.querySelectorAll('.h-field').forEach((el) => el.addEventListener('pointermove', (e) => {
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`);
}));
