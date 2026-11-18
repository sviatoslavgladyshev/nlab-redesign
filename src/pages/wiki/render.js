// Turning nLab source into the article view: includes, numbering, references, diagrams,
// link-card lists, category chips, missing-page links, the table of contents and the context panel.
import { esc, clean, pageUrl, fetchSource, resolvePage, displayTitle } from '../../core/nlab.js';
import { renderSource, expandIncludes, contextSource, resolveRefs } from '../../core/markup.js';
import { fillPreview } from '../../ui/preview.js';
import { $, $$ } from './shell.js';
import { applyFocusRead } from './reading.js';

const getSource = async (n) => (await fetchSource(n)).source;

function numberEnvs(root) {
  let n = 0;
  root.querySelectorAll('[class^="num_"] > h6, [class*=" num_"] > h6').forEach((h) => { n += 1; if (!/\d/.test(h.textContent)) h.textContent = `${h.textContent.trim()} ${n}`; });
}
const previewIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    previewIO.unobserve(e.target);
    const a = e.target;
    fillPreview(a.querySelector('.ll-ex'), a.dataset.wiki.split('#')[0], a.classList.contains('missing'));
  });
}, { rootMargin: '300px' });

// Bullet lists that are only links to other pages ("Related entries", "Basic facts"…) become a card grid
function linkLists(root) {
  const linksOf = (li) => [...li.querySelectorAll(':scope > a[href], :scope > p > a[href]')];
  const onlyLinks = (li) => {
    const links = linksOf(li);
    if (!links.length || li.querySelector('ul, ol, .katex')) return false;
    let rest = li.textContent;
    links.forEach((a) => { rest = rest.replace(a.textContent, ''); });
    return /^[\s,;.:·]*$/.test(rest);
  };
  root.querySelectorAll('ul').forEach((ul) => {
    const items = [...ul.children];
    if (items.length < 2 || ul.closest('.link-list') || !items.every(onlyLinks)) return;
    ul.classList.add('link-list');
    items.forEach((li) => {
      const links = linksOf(li);
      if (links.length === 1) {
        const a = links[0];
        const title = document.createElement('span');
        title.className = 'll-t';
        title.append(...a.childNodes);
        if (title.childNodes.length === 1 && title.firstChild.nodeType === 3) title.textContent = displayTitle(title.textContent);
        a.append(title);
        if (a.dataset.wiki) { a.insertAdjacentHTML('beforeend', '<span class="ll-ex"><span class="ll-skel"></span><span class="ll-skel short"></span></span>'); previewIO.observe(a); }
        a.insertAdjacentHTML('beforeend', '<span class="ll-go" aria-hidden="true">→</span>');
        li.replaceChildren(a);
      } else {
        li.classList.add('ll-multi');
        li.replaceChildren(...links.flatMap((a, i) => (i ? [document.createTextNode(' · '), a] : [a])));
      }
    });
  });
}

// Diagrams the build hasn't pre-rendered yet: show their source instead of a broken image
export function diagramFallback(root) {
  root.querySelectorAll('img[data-diagram]').forEach((img) => img.addEventListener('error', () => {
    const fig = img.closest('figure');
    fig?.classList.add('no-render');
    const d = fig?.querySelector('details');
    if (d) { d.open = true; d.querySelector('summary').textContent = 'Diagram (TikZ source)'; }
    img.remove();
  }, { once: true }));
}

async function markMissing(root) {
  const links = $$('a[data-wiki]', root);
  await Promise.all(links.map(async (a) => {
    if (!(await resolvePage(a.dataset.wiki.split('#')[0]))) { a.classList.add('missing'); a.title = 'This page doesn’t exist yet — click to create it'; a.href = pageUrl(a.dataset.wiki.split('#')[0], 'new'); }
  }));
}

let spy;
export function buildToc(body) {
  spy?.disconnect();
  const heads = [...body.querySelectorAll('h2[id], h3[id]')];
  const toc = $('#a-toc');
  toc.innerHTML = '';
  const hasCtx = !$('#ctx-tab').hidden;
  $('#a-side').hidden = !heads.length && !hasCtx;
  document.body.classList.toggle('has-side', heads.length > 0 || hasCtx);
  $('[data-tab="toc"]').hidden = !heads.length;
  if (!heads.length) { if (hasCtx) activateTab('ctx'); return; }
  let s2 = 0, s3 = 0;
  toc.innerHTML = heads.map((h) => {
    const lvl = h.tagName[1];
    if (lvl === '2') { s2 += 1; s3 = 0; } else s3 += 1;
    return `<a href="#${esc(h.id)}" class="lvl-${lvl}"><span class="no">${lvl === '2' ? s2 : `${s2}.${s3}`}</span>${esc(h.textContent.trim())}</a>`;
  }).join('');
  const links = new Map([...toc.querySelectorAll('a')].map((a) => [a.getAttribute('href').slice(1), a]));
  spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      toc.querySelectorAll('.on').forEach((a) => a.classList.remove('on'));
      const a = links.get(e.target.id);
      if (a) { a.classList.add('on'); a.scrollIntoView({ block: 'nearest' }); }
    });
  }, { rootMargin: '-80px 0px -70% 0px' });
  heads.forEach((h) => spy.observe(h));
}
// Phones: the contents become a floating button with a bottom sheet
const tocFab = Object.assign(document.createElement('button'), { type: 'button', className: 'toc-fab', innerHTML: '<i data-lucide="list-tree"></i><span>Contents</span>' });
tocFab.setAttribute('aria-expanded', 'false');
document.body.append(tocFab);
const toggleToc = (on) => { $('#a-side').classList.toggle('open', on); tocFab.setAttribute('aria-expanded', String(on)); document.body.classList.toggle('sheet-open', on && innerWidth <= 960); };
tocFab.addEventListener('click', () => toggleToc(!$('#a-side').classList.contains('open')));
$('#a-side').addEventListener('click', (e) => { if (e.target.closest('a') || e.target === $('#a-side')) toggleToc(false); });

function activateTab(name) {
  $$('.side-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
}
$$('.side-tabs button').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));

// "category: people, physics" lines at the end of a page become coloured chips
const CAT_STYLE = [
  [/^people$/, 'users', '#b7791f', 'library/?kind=p', 'People'],
  [/^reference/, 'book-open', '#6b3fa0', 'library/?kind=r', 'References'],
  [/^disambiguation/, 'split', '#5f6670', null, 'Disambiguation'],
  [/physics|quantum|string|gravity|field theory/, 'atom', '#a8253b'],
  [/category|categor/, 'network', '#1d4f91'],
  [/homotopy|topolog|knot/, 'orbit', '#2a7a3b'],
  [/geometry|manifold/, 'globe', '#b7791f'],
  [/logic|type theory|foundation|set theory|computer/, 'scroll-text', '#6b3fa0'],
  [/algebra|group|ring|number/, 'sigma', '#1f7a8c'],
  [/analysis|measure|probab/, 'infinity', '#1f7a8c'],
  [/history|svg|diagram|image|motivation|meta|nlab|search|terminology|empty/, 'hash', '#5f6670'],
];
function categoryChips(body) {
  $$('p', body).forEach((p) => {
    const m = p.textContent.trim().match(/^category:\s*(.+)$/i);
    if (!m || p.children.length > 3) return;
    const cats = m[1].split(',').map((c) => c.trim()).filter(Boolean);
    if (!cats.length) return;
    const nav = document.createElement('nav');
    nav.className = 'a-cats';
    nav.setAttribute('aria-label', 'Categories');
    nav.innerHTML = `<span class="a-cats-l">Filed under</span>${cats.map((c) => {
      const lc = c.toLowerCase();
      const [, icon, color, href, label] = CAT_STYLE.find(([re]) => re.test(lc)) || [null, 'tag', '#1d4f91'];
      return `<a class="a-cat" style="--c:${color}" href="${esc(href || `search?q=${encodeURIComponent(c)}`)}"><i data-lucide="${icon}"></i>${esc(label || c.replace(/^./, (x) => x.toUpperCase()))}</a>`;
    }).join('')}`;
    p.replaceWith(nav);
  });
}

export async function renderInto(body, src) {
  const expanded = await expandIncludes(src, getSource);
  body.innerHTML = renderSource(expanded);
  clean(body);
  numberEnvs(body);
  resolveRefs(body);
  diagramFallback(body);
  linkLists(body);
  categoryChips(body);
  applyFocusRead(body);
  markMissing(body);
  buildToc(body);
}

export async function renderContext(src) {
  const ctx = contextSource(src);
  const box = $('#a-ctx');
  if (!ctx.trim()) { $('#ctx-tab').hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = renderSource(await expandIncludes(ctx, getSource), { context: true });
  clean(box);
  box.querySelectorAll('.hide').forEach((h, i) => {
    const head = h.previousElementSibling;
    if (!head || !/^H[3-6]$/.test(head.tagName)) return;
    head.classList.add('ctx-toggle');
    head.setAttribute('aria-expanded', String(i === 0));
    h.hidden = i !== 0;
    head.addEventListener('click', () => { h.hidden = !h.hidden; head.setAttribute('aria-expanded', String(!h.hidden)); });
  });
  box.querySelectorAll('h1, h2, h3').forEach((h) => { if (/^\s*context\s*$/i.test(h.textContent)) h.remove(); });
  $('#ctx-tab').hidden = false;
}
