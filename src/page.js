// Article / search viewer: loads live nLab content through the proxy and
// re-renders it in the redesigned layout.
import './main.js';
import './article.css';
import { ORIGIN, LIVE, decodeName, encodeName, pageUrl, liveUrl, esc, rewriteHref, clean, fetchDoc, NotInSnapshot } from './nlab.js';

const $ = (sel, root = document) => root.querySelector(sel);

function setHero({ title, crumb, meta = '', actions = [] }) {
  document.title = `${title} — nLab`;
  $('#a-title').textContent = title;
  $('#crumb-current').textContent = crumb ?? title;
  $('#a-meta').textContent = meta || ' ';
  $('#a-actions').innerHTML = actions
    .map(([label, href, primary]) => `<a class="pill${primary ? '' : ' ghost'}" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`)
    .join('');
}

function showError(name, err) {
  setHero({ title: name || 'Not found', meta: 'This page could not be loaded.' });
  $('#a-body').innerHTML = `
    <div class="a-empty">
      <p class="lead">We couldn’t load this page from ncatlab.org (${esc(err.message || err)}).</p>
      <p class="mt-s">It may not exist yet — or the dev server proxy isn’t running. Try
      <a href="${ORIGIN}/nlab/show/${encodeName(name || '')}" target="_blank" rel="noopener">opening it on the live nLab ›</a></p>
    </div>`;
}

/* ---------------- Article ---------------- */
async function renderArticle(requested) {
  $('#crumb-current').textContent = requested;
  const { doc, path } = await fetchDoc(`/nlab/show/${encodeName(requested)}`);
  const rev = $('#revision', doc);
  if (!rev) throw new Error('No page content');

  // Follow nLab redirects to the canonical page name
  const m = path.match(/^\/nlab\/show\/(.+)$/);
  const name = m ? decodeName(m[1]) : requested;
  if (name !== requested) history.replaceState(null, '', pageUrl(name) + location.hash);

  const ctx = $('.rightHandSide', rev);
  ctx?.remove();
  rev.querySelectorAll('.toc, .maruku_toc, #section_table_of_contents').forEach((n) => n.remove());
  [...rev.querySelectorAll('h1')].forEach((h) => { if (/^\s*contents\s*$/i.test(h.textContent)) h.remove(); });
  clean(rev);

  let n = 0;
  rev.querySelectorAll('[class^="num_"]').forEach((env) => {
    n += 1;
    const head = env.querySelector('h6');
    if (head && !/\d/.test(head.textContent)) head.textContent = `${head.textContent.trim()} ${n}`;
  });

  const revised = ($('.revisedby', doc)?.textContent.replace(/\s+/g, ' ').trim() || '').split(/(?<=\d)\.\s/)[0];
  const discuss = [...doc.querySelectorAll('.navigation a')].find((a) => /discuss/i.test(a.textContent));
  const enc = encodeName(name);
  setHero({
    title: name,
    meta: revised.replace(/\.?\s*$/, ''),
    actions: [
      ['View on nLab', `${ORIGIN}/nlab/show/${enc}`, true],
      ['History', `${ORIGIN}/nlab/history/${enc}`],
      ...(discuss ? [['Discuss', new URL(discuss.getAttribute('href'), ORIGIN).href]] : []),
      ['Source', `${ORIGIN}/nlab/source/${enc}`],
    ],
  });

  const body = $('#a-body');
  body.innerHTML = '';
  body.append(...rev.childNodes);
  body.classList.add('loaded');

  if (ctx && ctx.textContent.trim()) {
    clean(ctx);
    $('#a-ctx').append(...ctx.childNodes);
    $('#ctx-tab').hidden = false;
  }
  buildToc(body);

  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}

function buildToc(body) {
  const heads = [...body.querySelectorAll('h2[id], h3[id]')];
  const toc = $('#a-toc');
  if (!heads.length && $('#ctx-tab').hidden) return;
  $('#a-side').hidden = false;
  document.body.classList.add('has-side');
  if (!heads.length) { activateTab('ctx'); $('[data-tab="toc"]').hidden = true; return; }

  toc.innerHTML = heads.map((h) => `<a href="#${esc(h.id)}" class="lvl-${h.tagName[1]}">${esc(h.textContent.trim())}</a>`).join('');
  const links = new Map([...toc.querySelectorAll('a')].map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      toc.querySelectorAll('.on').forEach((a) => a.classList.remove('on'));
      const a = links.get(e.target.id);
      if (a) { a.classList.add('on'); a.scrollIntoView({ block: 'nearest' }); }
    });
  }, { rootMargin: '-80px 0px -70% 0px' });
  heads.forEach((h) => spy.observe(h));
}

function activateTab(name) {
  document.querySelectorAll('.side-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
}
document.querySelectorAll('.side-tabs button').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));

/* ---------------- Search ---------------- */
async function renderSearch(q) {
  setHero({ title: `“${q}”`, crumb: 'Search', meta: 'Searching the nLab…' });
  document.querySelectorAll('.nav-search input').forEach((i) => { i.value = q; });
  const { doc } = await fetchDoc(`/nlab/search?query=${encodeURIComponent(q)}`);
  const content = $('#Content', doc);
  const groups = [...(content?.querySelectorAll('h2') || [])].map((h2) => {
    let ul = h2.nextElementSibling;
    while (ul && ul.tagName !== 'UL' && ul.tagName !== 'H2') ul = ul.nextElementSibling;
    const items = ul && ul.tagName === 'UL' ? [...ul.querySelectorAll('a[href]')] : [];
    return { heading: h2.textContent.trim(), items };
  });
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  setHero({
    title: `“${q}”`,
    crumb: 'Search',
    meta: total ? `${total} result${total === 1 ? '' : 's'}` : 'No results',
    actions: [['Search on ncatlab.org', `${ORIGIN}/nlab/search?query=${encodeURIComponent(q)}`, true]],
  });
  $('#a-body').innerHTML = groups.length
    ? groups.map((g) => `
        <section class="s-group">
          <h2>${esc(g.heading)}</h2>
          <div class="s-grid">
            ${g.items.map((a) => `<a class="s-item" href="${esc(rewriteHref(a.getAttribute('href')))}">${esc(a.textContent.trim())}</a>`).join('')}
          </div>
        </section>`).join('')
    : `<div class="a-empty"><p class="lead">Nothing matched “${esc(q)}”.</p></div>`;
  $('#a-body').classList.add('loaded', 'is-search');
}

/* ---------------- Router ---------------- */
const params = new URLSearchParams(location.search);
const q = params.get('search');
const name = params.get('p');
if (q && !LIVE) location.replace(`${ORIGIN}/nlab/search?query=${encodeURIComponent(q)}`); // static build: search on nLab
else if (q) renderSearch(q).catch((e) => showError(`Search: ${q}`, e));
else if (!name || name === 'HomePage') location.replace('./');
else renderArticle(name).catch((e) => {
  // Static build: pages outside the snapshot open on the live nLab
  if (e instanceof NotInSnapshot) location.replace(liveUrl(e.page) + location.hash);
  else showError(name, e);
});
