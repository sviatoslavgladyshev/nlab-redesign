// Home page: shared behaviour + recent edits, featured excerpt, image credits.
import './main.js';
import { LIVE, esc, clean, fetchDoc, latestChanges, snapshotMeta } from './nlab.js';
import credits from './data/credits.json';

const $ = (s) => document.querySelector(s);

// Old links pointed at CQTS anchors on the home page; those sections now live on cqts.html.
const cqtsAnchors = ['cqts', 'Symposium2026', 'CQTSSymposium2026Materials', 'GladyshevSymposium2026', 'GolubSymposium2026',
  'SchreiberSymposium2026', 'SingSymposium2026', 'colloquium', 'research', 'events'];
const hash = decodeURIComponent(location.hash.slice(1));
if (cqtsAnchors.includes(hash)) location.replace(`cqts.html${location.search}${hash === 'cqts' ? '' : `#${hash}`}`);

/* ---------- Recent edits (live in dev, snapshot in the static build) ---------- */
const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
async function renderEdits() {
  const list = $('#edits');
  if (!list) return;
  try {
    const edits = (await latestChanges(60)).filter((r) => r.title && !/^Sandbox/i.test(r.title)).slice(0, 6);
    if (!edits.length) throw new Error('empty');
    list.innerHTML = edits.map((r) => {
      const when = r.date === todayStr ? r.time : new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<li><a href="${esc(r.href)}"><b>${esc(r.title)}</b><time>${esc(when)}</time><span>${esc(r.author)}</span></a></li>`;
    }).join('');
    const stamp = LIVE ? 'live' : await snapshotMeta();
    $('#edits-when').textContent = stamp === 'live' ? 'live'
      : stamp ? `as of ${new Date(stamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';
  } catch {
    list.innerHTML = '<li class="edits-loading">Recent edits are available on ncatlab.org.</li>';
  }
}
renderEdits();
if (LIVE) setInterval(renderEdits, 120_000);

/* ---------- Featured article: first paragraph of the live "Idea" section ---------- */
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
    wrap.querySelectorAll('a').forEach((a) => a.replaceWith(...a.childNodes)); // no nested links inside the card link
    box.replaceChildren(...wrap.childNodes);
    box.classList.add('live');
  } catch { /* keep the static fallback text */ }
}
renderFeatured();

/* ---------- Image credits ---------- */
document.querySelectorAll('img[data-credit]').forEach((img) => {
  const c = credits[img.dataset.credit];
  if (c) img.title = `${c.title} — ${c.author || 'Wikimedia Commons'} (${c.license})`;
});
const list = $('#credits-list');
if (list) list.innerHTML = Object.values(credits).map((c) => `
  <li><a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.title)}</a> — ${esc(c.author || 'unknown')}, ${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license)}</li>`).join('');
