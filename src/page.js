// Article / search / recent changes / all pages, all rendered in this UI.
// Pages come from the nLab content mirror (any of its ~20 000 pages); editing opens the workspace.
import { icons } from './main.js';
import './article.css';
import './editor.css';
import { esc, clean, pageUrl, fetchSource, resolvePage, searchPages, loadIndex, PageNotFound } from './nlab.js';
import { renderSource, expandIncludes, contextSource, resolveRefs } from './markup.js';
import { openWorkspace, drafts } from './editor.js';
import { latestEdits, allTopics } from './forum-data.js';

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
/* Card previews: the first sentences of the linked page's "Idea", loaded when the card scrolls into view */
const excerpts = new Map();
function excerptFor(name) {
  if (!excerpts.has(name)) {
    excerpts.set(name, (async () => {
      try { const c = sessionStorage.getItem(`nlab-ex:${name}`); if (c != null) return c; } catch { /* ignore */ }
      const { source } = await fetchSource(name);
      const body = source.replace(/^\s*\+--[^\n]*rightHandSide[\s\S]*?\n=--\s*\n=--\s*\n=--/m, '');
      const part = body.split(/^#{2,3}\s+(?:Idea|Definition|Statement)\b.*$/m)[1] || body;
      const para = part.split(/\n\s*\n/).map((x) => x.trim())
        .find((x) => x.length > 50 && !/^([+#*{=<|>\-]|\$\$|\\\[|\[\[!)/.test(x) && !/^\s*\{:/.test(x)) || '';
      // split into sentences without breaking inside formulas or after "cor.", "def.", "e.g."…
      const math = [];
      const flat = para.replace(/\s+/g, ' ').replace(/\$[^$]*\$/g, (m) => `\u0001${math.push(m) - 1}\u0002`);
      const sentences = flat.split(/(?<=[.!?])\s+(?=[A-Z_*[])/);
      let out = '';
      for (const t of sentences) { if ((out + t).length > 230 && out) break; out += `${t} `; }
      out = out.replace(/\u0001(\d+)\u0002/g, (_, i) => math[+i]);
      const html = out ? renderSource(out.trim()) : '';
      try { sessionStorage.setItem(`nlab-ex:${name}`, html); } catch { /* full */ }
      return html;
    })().catch(() => ''));
  }
  return excerpts.get(name);
}
const previewIO = new IntersectionObserver((entries) => {
  entries.forEach(async (e) => {
    if (!e.isIntersecting) return;
    previewIO.unobserve(e.target);
    const a = e.target;
    const box = a.querySelector('.ll-ex');
    if (a.classList.contains('missing')) { box.innerHTML = '<em>Not written yet. Be the first to write it.</em>'; return; }
    const html = await excerptFor(a.dataset.wiki.split('#')[0]);
    if (!html) { box.remove(); return; }
    box.innerHTML = html;
    box.querySelectorAll('a').forEach((x) => x.replaceWith(...x.childNodes));
    box.querySelectorAll('p').forEach((x) => x.replaceWith(...x.childNodes, ' '));
    box.classList.add('in');
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

async function markMissing(root) {
  const links = $$('a[data-wiki]', root);
  await Promise.all(links.map(async (a) => {
    if (!(await resolvePage(a.dataset.wiki.split('#')[0]))) { a.classList.add('missing'); a.title = 'This page doesn’t exist yet — click to create it'; a.href += '&new'; }
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
  linkLists(body);
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
  setHero({ title: 'Write an article', crumb: 'Write', meta: 'Give it a title, pick a starting point, and write. Your work is saved as you go, and you publish when it’s ready.' });
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
      <div class="w-go"><button class="tbtn primary" type="submit"><i data-lucide="pen-line"></i><span>Start writing</span></button></div>
    </form>
    <section class="w-drafts" id="drafts">
      <h2>Your drafts</h2>
      ${drafts.length ? `<ul>${drafts.map((d) => `<li><a href="${esc(pageUrl(d.name))}&edit"><b>${esc(d.name)}</b><span>${d.isNew ? 'New article' : 'Edit of an existing page'} · saved ${new Date(d.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></a></li>`).join('')}</ul>`
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
        ? `There is already a page <a href="${esc(pageUrl(hit.name))}">${esc(hit.name)}</a>. <a href="${esc(pageUrl(hit.name))}&edit">Improve it instead</a>, or choose a different title.`
        : 'Use the name of the concept, result or person, as you would in a dictionary.';
    }, 200);
  });
  $('#w-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const hit = await resolvePage(q);
    location.href = hit ? `${pageUrl(hit.name)}&edit` : `${pageUrl(q)}&new&tpl=${new FormData(e.target).get('tpl')}`;
  });
}

const state = { name: '', published: '', exists: true, showingDraft: false };

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
      <p class="mt-s">${link('Create this page', 'file-plus-2', `${pageUrl(state.name)}&new`, true)} ${link('Search for similar pages', 'search', `page.html?search=${encodeURIComponent(state.name)}`)}</p>
    </div>`;
    buildToc(body);
  } else await renderInto(body, src);
  const words = src.replace(/\$[^$]*\$|\[\[!.*?\]\]|[#*_>`{}]/g, ' ').split(/\s+/).filter(Boolean).length;
  const idx = await loadIndex();
  const meta = useDraft
    ? `<span class="badge draft">Your draft</span> saved ${new Date(d.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : state.exists ? `${words.toLocaleString()} words · from the nLab, as of ${new Date(idx.committed || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'New page';
  setHero({
    title: state.name,
    meta,
    actions: `<button type="button" class="tbtn primary" data-act="edit" title="Edit this page (E)"><i data-lucide="pencil"></i><span>${state.exists ? 'Edit' : 'Create'}</span></button>`
      + link('Discuss', 'messages-square', `forum.html?q=${encodeURIComponent(state.name)}`)
      + btn('Copy link', 'link', 'data-act="share"'),
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
  $('#crumb-current').textContent = requested;
  let name = requested, source = '';
  try {
    ({ name, source } = await fetchSource(requested));
    state.exists = true;
  } catch (e) {
    if (!(e instanceof PageNotFound)) throw e;
    state.exists = false;
  }
  if (name !== requested) { const u = new URL(location.href); u.searchParams.set('p', name); history.replaceState(null, '', u); }
  Object.assign(state, { name, published: source });
  $('#a-body').classList.add('loaded');
  if (state.exists) await renderContext(source);
  await showArticle(drafts.get(name) ? 'draft' : 'published');

  if (params.has('edit') || params.has('new')) openEditor();
  else if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}

function openEditor() {
  const d = drafts.get(state.name);
  const start = d?.source ?? (state.exists ? state.published : NEW_TEMPLATE(state.name));
  const u = new URL(location.href); u.searchParams.delete('new'); u.searchParams.set('edit', ''); history.replaceState(null, '', u.href.replace(/edit=(&|$)/, 'edit$1'));
  openWorkspace({
    name: state.name, original: state.exists ? state.published : '', start, isNew: !state.exists,
    onExit: (how) => {
      const v = new URL(location.href); v.searchParams.delete('edit'); history.replaceState(null, '', v);
      showArticle(drafts.get(state.name) ? 'draft' : 'published');
      if (how === 'published') toast('Thanks! It may take a little while for the nLab mirror to show your change here.');
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
    actions: exact ? link(`Open “${exact.name}”`, 'arrow-right', pageUrl(exact.name), true) : link(`Create “${q}”`, 'file-plus-2', `${pageUrl(q)}&new`, true),
  });
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  body.innerHTML = `
    ${hits.length ? `<section class="s-group"><h2>Pages</h2><div class="s-grid">${hits.map((h) => `<a class="s-item" href="${esc(pageUrl(h.name))}">${esc(h.name)}${h.via ? `<small>also called “${esc(h.via)}”</small>` : ''}</a>`).join('')}</div>${total > hits.length ? `<p class="s-more">Showing ${hits.length} of ${total.toLocaleString()}. Refine your search to narrow it down.</p>` : ''}</section>` : ''}
    ${disc.length ? `<section class="s-group"><h2>In the forum</h2><div class="s-list">${disc.map((t) => `<a href="forum.html?c=${t.channelId}&t=${encodeURIComponent(t.t)}"><b>${esc(t.t)}</b><span>${esc(t.channel)} · ${t.n} message${t.n === 1 ? '' : 's'} · ${rel(t.last)}</span></a>`).join('')}</div></section>` : ''}
    ${!hits.length && !disc.length ? `<div class="a-empty"><p class="lead">No page is called anything like “${esc(q)}”.</p><p>${link(`Create the page “${q}”`, 'file-plus-2', `${pageUrl(q)}&new`, true)}</p></div>` : ''}`;
  icons();
}

/* ---------------- Recent changes ---------------- */
async function renderRecent() {
  setHero({ title: 'Recent changes', crumb: 'Recent changes', meta: 'Every edit to the nLab is announced in the forum, with its author’s summary.', actions: link('Discussions', 'messages-square', 'forum.html') });
  const edits = await latestEdits(80);
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  let day = '';
  body.innerHTML = `<ol class="recent">${edits.map((e) => {
    const d = new Date(e.when * 1000).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const head = d !== day ? `<li class="r-day">${(day = d)}</li>` : '';
    return `${head}<li class="r-item"><a class="r-page" href="${esc(pageUrl(e.page))}">${esc(e.page)}</a>
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
  if (act === 'edit') openEditor();
  else if (act === 'toggle-published') showArticle(state.showingDraft ? 'published' : 'draft');
  else if (act === 'random-all') location.href = pageUrl(state.allNames[Math.floor(Math.random() * state.allNames.length)]);
  else if (act === 'share') { try { await navigator.clipboard.writeText(location.href.replace(/[?&]edit\b/, '')); toast('Link copied.'); } catch { toast(location.href); } }
});
addEventListener('keydown', (e) => {
  if (state.name && !document.body.classList.contains('ws-open') && e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey
    && !/input|textarea|select/i.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { e.preventDefault(); openEditor(); }
});

/* ---------------- Router ---------------- */
function showError(name, err) {
  setHero({ title: name || 'Something went wrong', meta: 'This page could not be loaded.' });
  $('#a-body').innerHTML = `<div class="a-empty"><p class="lead">${esc(err.message || String(err))}</p><p class="mt-s">${link('Back to the home page', 'arrow-left', './')}</p></div>`;
  icons();
}
const q = params.get('search');
const name = params.get('p');
if (q) renderSearch(q).catch((e) => showError(`Search: ${q}`, e));
else if (params.has('recent')) renderRecent().catch((e) => showError('Recent changes', e));
else if (params.has('all')) renderAll().catch((e) => showError('All pages', e));
else if (params.has('write')) renderWrite();
else if (!name || name === 'HomePage') location.replace('./');
else renderArticle(name).catch((e) => showError(name, e));
