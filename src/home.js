// Home page: shared behaviour + the small live pieces (edit ticker, featured excerpt, did-you-know).
import './main.js';
import { LIVE, esc, pageUrl, clean, fetchDoc, latestChanges, snapshotMeta } from './nlab.js';
import credits from './data/credits.json';

const $ = (s) => document.querySelector(s);
const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/* ---------- Date in the §1 header ---------- */
const dateEl = $('#today-label');
if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/* ---------- Latest-edits ticker ---------- */
async function renderTicker() {
  const track = $('#ticker');
  if (!track) return;
  try {
    const edits = (await latestChanges(60)).filter((r) => r.title && !/^Sandbox/i.test(r.title)).slice(0, 10);
    if (!edits.length) throw new Error('empty');
    const items = edits.map((r) => {
      const when = r.date === todayStr ? r.time : new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<a href="${esc(r.href)}"><b>${esc(r.title)}</b><span>${esc(r.author)} · ${esc(when)}</span></a>`;
    }).join('');
    track.innerHTML = items + items.replace(/<a /g, '<a aria-hidden="true" tabindex="-1" '); // doubled for a seamless loop
    if (!LIVE) {
      const at = await snapshotMeta();
      if (at) $('.ticker-label').title = `Snapshot of ${new Date(at).toLocaleString('en-US')}`;
    }
  } catch {
    track.innerHTML = '<span class="placeholder">See the latest edits on ncatlab.org →</span>';
    track.style.animation = 'none';
  }
}
renderTicker();
if (LIVE) setInterval(renderTicker, 120_000);

/* ---------- Featured article: pull the live "Idea" paragraph ---------- */
async function renderFeatured() {
  const box = $('#featured-excerpt');
  if (!box) return;
  try {
    const { doc } = await fetchDoc(`/nlab/show/${box.dataset.page}`);
    const idea = doc.querySelector('#revision h2#idea, #revision h2[id^="idea"]');
    let para;
    for (let n = idea?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
      if (n.tagName === 'P' && n.textContent.trim().length > 40) { para = n; break; }
    }
    if (!para) return;
    const wrap = document.createElement('div');
    wrap.append(para.cloneNode(true));
    clean(wrap);
    // Links inside a link card would nest <a>; keep them as plain emphasis instead.
    wrap.querySelectorAll('a').forEach((a) => a.replaceWith(...a.childNodes));
    box.replaceChildren(...wrap.childNodes);
    box.classList.add('live');
  } catch { /* keep the static fallback text */ }
}
renderFeatured();

/* ---------- Did you know (rotating) ---------- */
const facts = [
  '…that the nLab logo, by David Roberts, is inspired by Matisse’s <i>La Gerbe</i> — a nod to <a href="page.html?p=gerbe">gerbes</a>?',
  '…that nLab pages are written much like LaTeX, with TikZ and XyMatrix for diagrams? See the <a href="page.html?p=HowTo">HowTo</a>.',
  '…that every nLab page keeps its full public history, so you can cite the exact revision you read?',
  '…that the nLab server is hosted at Carnegie Mellon University?',
  '…that the nLab’s software began as an instance of the Instiki wiki, and is now largely written for the nLab itself?',
];
const dykText = $('#dyk-text'), dykDots = $('#dyk-dots');
let dyk = 0;
const showFact = (i) => {
  dyk = (i + facts.length) % facts.length;
  dykText.style.opacity = 0;
  setTimeout(() => { dykText.innerHTML = facts[dyk]; dykText.style.opacity = 1; }, 180);
  dykDots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === dyk));
};
if (dykText && dykDots) {
  dykDots.innerHTML = facts.map(() => '<i></i>').join('');
  dykDots.firstChild.classList.add('on');
  $('#dyk-next')?.addEventListener('click', () => showFact(dyk + 1));
}

/* ---------- Surprise me ---------- */
const surprise = ['adjoint functor', 'Yoneda lemma', 'topos', 'Hopf fibration', 'univalence axiom', 'cobordism hypothesis',
  'gerbe', 'spectrum', 'Kan extension', 'monad', 'sheaf', 'homotopy type theory', 'trefoil knot', 'graphene',
  'Bose-Einstein condensate', 'Chern-Simons theory', 'operad', 'string theory', 'quantum information', 'cosmology',
  'dynamical system', 'Grothendieck-Riemann-Roch theorem'];
document.querySelectorAll('[data-surprise]').forEach((b) => b.addEventListener('click', (e) => {
  e.preventDefault();
  location.href = pageUrl(surprise[Math.floor(Math.random() * surprise.length)]);
}));

/* ---------- Image credits ---------- */
document.querySelectorAll('img[data-credit]').forEach((img) => {
  const c = credits[img.dataset.credit];
  if (c) img.title = `${c.title} — ${c.author || 'Wikimedia Commons'} (${c.license})`;
});
const list = $('#credits-list');
if (list) list.innerHTML = Object.values(credits).map((c) => `
  <li><a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.title)}</a> — ${esc(c.author || 'unknown')}, ${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license)}</li>`).join('');
