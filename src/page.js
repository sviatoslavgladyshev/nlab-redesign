// Article / search / recent changes / all pages, all rendered in this UI.
// Pages come from the nLab content mirror (any of its ~20 000 pages); editing opens the workspace.
import { icons } from './main.js';
import './article.css';
import './editor.css';
import { esc, clean, pageUrl, fetchSource, resolvePage, searchPages, loadIndex, PageNotFound, displayTitle } from './nlab.js';
import { renderSource, expandIncludes, contextSource, resolveRefs } from './markup.js';
import { openWorkspace, drafts } from './editor.js';
import { latestEdits, allTopics } from './forum-data.js';
import { fillPreview } from './preview.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const params = new URLSearchParams(location.search);
const getSource = async (n) => (await fetchSource(n)).source;

function setHero({ title, crumb, meta = '', actions = '' }) {
  document.title = `${title} — nLab`;
  $('#a-title').textContent = title;
  $('#crumb-current').textContent = crumb ?? title;
  $('#a-meta').innerHTML = meta || '&nbsp;';
  $('#a-actions').innerHTML = actions;
  icons();
}
const btn = (label, icon, attrs) => `<button type="button" class="tbtn" ${attrs}><i data-lucide="${icon}"></i><span>${esc(label)}</span></button>`;
const link = (label, icon, href, primary = false) => `<a class="tbtn${primary ? ' primary' : ''}" href="${esc(href)}"><i data-lucide="${icon}"></i><span>${esc(label)}</span></a>`;
const rel = (ts) => {
  const d = Date.now() / 1000 - ts;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 86400 * 7) return `${Math.round(d / 86400)} d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const toast = (msg) => {
  const t = Object.assign(document.createElement('div'), { className: 'toast', role: 'status', textContent: msg });
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4400);
};

/* ---------------- Rendering helpers ---------------- */
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

/* Focus reading (ADHD-friendly): Lexend, wider spacing and bold word beginnings ("bionic" anchors).
   Formulas, code and diagrams are left as they are. */
const FOCUS_KEY = 'nlab-focus-read';
const focusOn = () => { try { return localStorage.getItem(FOCUS_KEY) === '1'; } catch { return false; } };
export function applyFocusRead(root, on = focusOn()) {
  root.classList.toggle('focus-read', on);
  root.querySelectorAll('b.bx').forEach((b) => b.replaceWith(b.textContent));
  root.normalize();
  if (!on) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('.katex, .m, .eq, code, pre, figure, script, style, h1, h2, h3, h6, .ref') || !/[A-Za-z]{2}/.test(n.nodeValue)
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => {
    const frag = document.createDocumentFragment();
    n.nodeValue.split(/(\p{L}+)/u).forEach((part) => {
      if (/^\p{L}{2,}$/u.test(part)) {
        const k = part.length <= 3 ? 1 : Math.ceil(part.length * 0.45);
        const b = document.createElement('b'); b.className = 'bx'; b.textContent = part.slice(0, k);
        frag.append(b, part.slice(k));
      } else if (part) frag.append(part);
    });
    n.replaceWith(frag);
  });
}

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
function buildToc(body) {
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

async function renderInto(body, src) {
  const expanded = await expandIncludes(src, getSource);
  body.innerHTML = renderSource(expanded);
  clean(body);
  numberEnvs(body);
  resolveRefs(body);
  diagramFallback(body);
  linkLists(body);
  applyFocusRead(body);
  markMissing(body);
  buildToc(body);
}

async function renderContext(src) {
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

/* ---------------- Article ---------------- */
const TEMPLATES = {
  concept: { label: 'A concept', icon: 'sigma', note: 'Idea, definition, properties, examples', make: (n) => `## Idea

What is ${n}, and why does it matter? Explain it in a few sentences, linking to related pages like [[category theory]].

## Definition

+-- {: .num_defn #Definition}
###### Definition

A **${n}** is …

=--

## Properties

## Examples

## Related concepts

* [[ ]]

## References

` },
  result: { label: 'A theorem or result', icon: 'radical', note: 'Statement, proof, consequences', make: (n) => `## Statement

+-- {: .num_theorem #Statement}
###### Theorem

…

=--

+-- {: .proof}
###### Proof

…

=--

## Consequences

## Related results

* [[ ]]

## References

` },
  person: { label: 'A person', icon: 'users', note: 'Researcher, affiliation, selected writings', make: (n) => `* [personal page]( )

## Selected writings

* …

## Related entries

* [[ ]]

[[!redirects ${n}]]
` },
  blank: { label: 'Blank page', icon: 'file-text', note: 'Start from nothing', make: () => '## Idea\n\n' },
};
const NEW_TEMPLATE = (name) => (TEMPLATES[params.get('tpl')] || TEMPLATES.concept).make(name);

/* ---------------- Write an article ---------------- */
function listDrafts() {
  const out = [];
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('nlab-draft:')) continue;
      const d = JSON.parse(localStorage.getItem(k));
      out.push({ name: k.slice(11), ...d });
    }
  } catch { /* ignore */ }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}
function renderWrite() {
  scrollTo({ top: 0, left: 0, behavior: 'auto' });
  setHero({ title: 'Sandbox', crumb: 'Sandbox', meta: 'Draft a new article here. New pages can be edited directly; existing nLab pages accept suggestions from readers.' });
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  const drafts = listDrafts();
  body.innerHTML = `
    <form class="w-form" id="w-form">
      <label class="w-title">Title<input id="w-name" type="text" placeholder="e.g. Hopf invariant" autocomplete="off" required></label>
      <p class="w-hint" id="w-hint">Use the name of the concept, result or person, as you would in a dictionary.</p>
      <fieldset class="w-tpls"><legend>Start from</legend>
        ${Object.entries(TEMPLATES).map(([k, t], i) => `<label class="w-tpl"><input type="radio" name="tpl" value="${k}" ${i === 0 ? 'checked' : ''}><span class="w-ic"><i data-lucide="${t.icon}"></i></span><b>${t.label}</b><small>${t.note}</small></label>`).join('')}
      </fieldset>
      <div class="w-go"><button class="tbtn primary" type="submit"><i data-lucide="pen-line"></i><span>Open Sandbox</span></button></div>
    </form>
    <section class="w-drafts" id="drafts">
      <h2>Your drafts</h2>
      ${drafts.length ? `<ul>${drafts.map((d) => `<li><a href="${esc(pageUrl(d.name, 'edit'))}"><b>${esc(d.name)}</b><span>${d.isNew ? 'New article' : 'Edit of an existing page'} · saved ${new Date(d.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></a></li>`).join('')}</ul>`
        : '<p class="w-none">No drafts yet. Anything you start writing appears here, saved in this browser.</p>'}
    </section>`;
  icons();
  const input = $('#w-name');
  input.focus();
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = input.value.trim();
      const hit = q && await resolvePage(q);
      $('#w-hint').innerHTML = hit
        ? `There is already a page <a href="${esc(pageUrl(hit.name))}">${esc(hit.name)}</a>. <a href="${esc(pageUrl(hit.name, 'suggest'))}">Suggest an edit</a>, or choose a different title.`
        : 'Use the name of the concept, result or person, as you would in a dictionary.';
    }, 200);
  });
  $('#w-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const hit = await resolvePage(q);
    location.href = hit ? `${pageUrl(hit.name, 'suggest')}` : `${pageUrl(q, 'new&tpl=')}${new FormData(e.target).get('tpl')}`;
  });
}

const state = { name: '', published: '', exists: true, showingDraft: false };
const isSandbox = (name) => /^sandbox(?:\d+)?$/i.test(String(name || '').trim());
const canDirectEdit = () => !state.exists || isSandbox(state.name);

async function showArticle(which) {
  const d = drafts.get(state.name);
  const useDraft = which === 'draft' && d;
  state.showingDraft = !!useDraft;
  const src = useDraft ? d.source : state.published;
  const body = $('#a-body');
  if (!state.exists && !useDraft) {
    body.innerHTML = `<div class="a-empty">
      <p class="lead">There is no page called “${esc(state.name)}” yet.</p>
      <p>You can start it now: write in the visual editor or in LaTeX, and publish it to the nLab when it’s ready.</p>
      <p class="mt-s">${link('Create this page', 'file-plus-2', `${pageUrl(state.name, 'new')}`, true)} ${link('Search for similar pages', 'search', `search?q=${encodeURIComponent(state.name)}`)}</p>
    </div>`;
    buildToc(body);
  } else await renderInto(body, src);
  const words = src.replace(/\$[^$]*\$|\[\[!.*?\]\]|[#*_>`{}]/g, ' ').split(/\s+/).filter(Boolean).length;
  const idx = await loadIndex();
  const meta = useDraft
    ? `<span class="badge draft">Your draft</span> saved ${new Date(d.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : state.exists ? `${words.toLocaleString()} words · from the nLab, as of ${new Date(idx.committed || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'New page';
  const direct = canDirectEdit();
  setHero({
    title: displayTitle(state.name, /^category:\s*people/im.test(state.published)),
    meta,
    actions: `<button type="button" class="tbtn primary" data-act="${direct ? 'edit' : 'suggest'}" title="${direct ? 'Edit this page (E)' : 'Suggest an edit'}"><i data-lucide="${direct ? 'pencil' : 'message-square-plus'}"></i><span>${direct ? (state.exists ? 'Edit' : 'Create') : 'Suggest an edit'}</span></button>`
      + link('Discuss', 'messages-square', `forum/?q=${encodeURIComponent(state.name)}`)
      + btn('Copy link', 'link', 'data-act="share"')
      + `<button type="button" class="tbtn" data-act="focus-read" aria-pressed="${focusOn()}" title="Easier reading: Lexend font, wider spacing and bold word beginnings"><i data-lucide="book-text"></i><span>Focus reading</span></button>`,
  });
  const bar = $('#draft-bar');
  bar.hidden = !d;
  if (d) {
    bar.classList.toggle('viewing-published', !useDraft);
    $('#draft-title').textContent = useDraft ? 'You are reading your unpublished draft.' : 'You have an unpublished draft of this page.';
    $('#draft-when').textContent = `Saved ${new Date(d.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}, in this browser only.`;
    $('[data-act="toggle-published"] span').textContent = useDraft ? 'Show published' : 'Show my draft';
    $('[data-act="toggle-published"]').hidden = !state.exists;
  }
  icons();
}

async function renderArticle(requested) {
  scrollTo({ top: 0, left: 0, behavior: 'auto' });
  $('#crumb-current').textContent = requested;
  let name = requested, source = '';
  try {
    ({ name, source } = await fetchSource(requested));
    state.exists = true;
  } catch (e) {
    if (!(e instanceof PageNotFound)) throw e;
    state.exists = false;
  }
  if (name !== requested) history.replaceState(null, '', `${new URL(pageUrl(name), document.baseURI).pathname}${location.search}${location.hash}`);
  Object.assign(state, { name, published: source });
  $('#a-body').classList.add('loaded');
  if (state.exists) await renderContext(source);
  await showArticle(drafts.get(name) ? 'draft' : 'published');

  if (params.has('edit') || params.has('new') || params.has('suggest')) openEditor(params.has('suggest') || (params.has('edit') && !canDirectEdit()));
  else if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}

function openEditor(suggestion = !canDirectEdit()) {
  const d = drafts.get(state.name);
  const start = d?.source ?? (state.exists ? state.published : NEW_TEMPLATE(state.name));
  const u = new URL(location.href); u.searchParams.delete('new'); u.searchParams.delete('edit'); u.searchParams.delete('suggest'); u.searchParams.set(suggestion ? 'suggest' : 'edit', ''); history.replaceState(null, '', u);
  openWorkspace({
    name: state.name, original: state.exists ? state.published : '', start, isNew: !state.exists, suggestion,
    onExit: (how) => {
      const v = new URL(location.href); v.searchParams.delete('edit'); v.searchParams.delete('suggest'); history.replaceState(null, '', v);
      showArticle(drafts.get(state.name) ? 'draft' : 'published');
      if (how === 'published') toast('Thanks! It may take a little while for the nLab mirror to show your change here.');
      else if (how === 'suggested') toast('Suggestion prepared. Share it in the forum so an author can review it.');
      else if (drafts.get(state.name)) toast('Draft saved in this browser.');
    },
  });
}

/* ---------------- Search ---------------- */
async function renderSearch(q) {
  setHero({ title: `“${q}”`, crumb: 'Search', meta: 'Searching…' });
  $$('.nav-search input').forEach((i) => { i.value = q; });
  const [{ total, hits }, topics, exact] = await Promise.all([searchPages(q, 150), allTopics(), resolvePage(q)]);
  const ql = q.toLowerCase();
  const disc = topics.filter((t) => t.channel !== 'Latest Changes' && (t.t.toLowerCase().includes(ql) || (t.excerpt || '').toLowerCase().includes(ql))).slice(0, 6);
  setHero({
    title: `“${q}”`, crumb: 'Search',
    meta: `${total.toLocaleString()} page${total === 1 ? '' : 's'}${disc.length ? ` · ${disc.length} forum discussion${disc.length === 1 ? '' : 's'}` : ''}`,
    actions: exact ? link(`Open “${exact.name}”`, 'arrow-right', pageUrl(exact.name), true) : link(`Create “${q}”`, 'file-plus-2', `${pageUrl(q, 'new')}`, true),
  });
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  body.innerHTML = `
    ${hits.length ? `<section class="s-group"><h2>Pages</h2><div class="s-grid">${hits.map((h) => `<a class="s-item" href="${esc(pageUrl(h.name))}">${esc(displayTitle(h.name))}${h.via ? `<small>also called “${esc(h.via)}”</small>` : ''}</a>`).join('')}</div>${total > hits.length ? `<p class="s-more">Showing ${hits.length} of ${total.toLocaleString()}. Refine your search to narrow it down.</p>` : ''}</section>` : ''}
    ${disc.length ? `<section class="s-group"><h2>In the forum</h2><div class="s-list">${disc.map((t) => `<a href="forum/?c=${t.channelId}&t=${encodeURIComponent(t.t)}"><b>${esc(t.t)}</b><span>${esc(t.channel)} · ${t.n} message${t.n === 1 ? '' : 's'} · ${rel(t.last)}</span></a>`).join('')}</div></section>` : ''}
    ${!hits.length && !disc.length ? `<div class="a-empty"><p class="lead">No page is called anything like “${esc(q)}”.</p><p>${link(`Create the page “${q}”`, 'file-plus-2', `${pageUrl(q, 'new')}`, true)}</p></div>` : ''}`;
  icons();
}

/* ---------------- Recent changes ---------------- */
async function renderRecent() {
  setHero({ title: 'Recent changes', crumb: 'Recent changes', meta: 'Every edit to the nLab is announced in the forum, with its author’s summary.', actions: link('Discussions', 'messages-square', 'forum/') });
  const edits = await latestEdits(80);
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  let day = '';
  body.innerHTML = `<ol class="recent">${edits.map((e) => {
    const d = new Date(e.when * 1000).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const head = d !== day ? `<li class="r-day">${(day = d)}</li>` : '';
    return `${head}<li class="r-item"><a class="r-page" href="${esc(pageUrl(e.page))}">${esc(displayTitle(e.page))}</a>
      <p>${e.summary ? esc(e.summary) : '<i>No summary</i>'}</p>
      <span class="r-meta">${esc(e.author || 'anonymous')}${e.rev ? ` · revision ${esc(e.rev)}` : ''} · ${new Date(e.when * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></li>`;
  }).join('')}</ol>`;
  icons();
}

/* ---------------- All pages ---------------- */
async function renderAll() {
  const { pages } = await loadIndex();
  const names = pages.map((p) => p[1]).filter((n) => n !== 'HomePage' && !n.includes(' > ')).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const key = (n) => { const c = n[0].toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
  const letters = [...new Set(names.map(key))];
  setHero({ title: 'All pages', crumb: 'All pages', meta: `${names.length.toLocaleString()} pages, A to Z`, actions: btn('Random page', 'shuffle', 'data-act="random-all"') });
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  const show = (L) => {
    const list = names.filter((n) => key(n) === L);
    $$('.az button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === L)));
    $('#az-list').innerHTML = list.map((n) => `<a href="${esc(pageUrl(n))}">${esc(n)}</a>`).join('');
    $('#az-count').textContent = `${list.length.toLocaleString()} pages under “${L}”`;
  };
  body.innerHTML = `<nav class="az">${letters.map((L) => `<button type="button" data-l="${L}">${L}</button>`).join('')}</nav><p class="s-more" id="az-count"></p><div class="az-list" id="az-list"></div>`;
  body.querySelector('.az').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.l); });
  show(letters.includes('A') ? 'A' : letters[0]);
  state.allNames = names;
}

/* ---------------- Buttons ---------------- */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'edit') openEditor(false);
  else if (act === 'suggest') openEditor(true);
  else if (act === 'toggle-published') showArticle(state.showingDraft ? 'published' : 'draft');
  else if (act === 'random-all') location.href = pageUrl(state.allNames[Math.floor(Math.random() * state.allNames.length)]);
  else if (act === 'focus-read') {
    const on = !focusOn();
    try { localStorage.setItem(FOCUS_KEY, on ? '1' : '0'); } catch { /* ignore */ }
    b.setAttribute('aria-pressed', String(on));
    applyFocusRead($('#a-body'), on);
  } else if (act === 'share') { try { await navigator.clipboard.writeText(location.href.replace(/[?&]edit\b/, '')); toast('Link copied.'); } catch { toast(location.href); } }
});
addEventListener('keydown', (e) => {
  if (state.name && !document.body.classList.contains('ws-open') && e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey
    && !/input|textarea|select/i.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { e.preventDefault(); openEditor(!canDirectEdit()); }
});

/* ---------------- Router ---------------- */
function showError(name, err) {
  setHero({ title: name || 'Something went wrong', meta: 'This page could not be loaded.' });
  $('#a-body').innerHTML = `<div class="a-empty"><p class="lead">${esc(err.message || String(err))}</p><p class="mt-s">${link('Back to the home page', 'arrow-left', './')}</p></div>`;
  icons();
}
// Clean URLs (relative to the site root): wiki/<Name>, search?q=…, recent, all, write.
history.scrollRestoration = 'manual';
// This app is also the site's 404 page, so it handles every unknown path and old .html links.
const BASE = new URL(document.baseURI).pathname;
const path = decodeURIComponent((location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\//, '')).replace(/\+/g, ' '));
const go = (to) => location.replace(`${new URL(to, document.baseURI).href}${location.hash}`);
const legacy = path.match(/^(page|library|forum|cqts|index)\.html$/);
if (legacy) {
  const p = new URLSearchParams(location.search);
  if (legacy[1] === 'page') {
    if (p.get('p')) go(pageUrl(p.get('p'), ['edit', 'new'].filter((k) => p.has(k)).join('&')));
    else if (p.get('search')) go(`search?q=${encodeURIComponent(p.get('search'))}`);
    else go(['recent', 'all', 'write'].find((k) => p.has(k)) || './');
  } else go(legacy[1] === 'index' ? './' : `${legacy[1]}/${location.search}`);
} else {
  const article = path.match(/^wiki\/(.+?)\/?$/);
  const view = path.replace(/\/$/, '');
  if (article) renderArticle(article[1]).catch((e) => showError(article[1], e));
  else if (view === 'search') renderSearch(params.get('q') || '').catch((e) => showError('Search', e));
  else if (view === 'recent') renderRecent().catch((e) => showError('Recent changes', e));
  else if (view === 'all') renderAll().catch((e) => showError('All pages', e));
  else if (view === 'write') renderWrite();
  else if (view === 'wiki' || view === '') location.replace(document.baseURI);
  else {
    setHero({ title: 'Page not found', meta: 'There is nothing at this address.' });
    $('#a-body').innerHTML = `<div class="a-empty"><p class="lead">Try the search above, or ${link('open the library', 'library', 'library/')}</p></div>`;
    icons();
  }
}
