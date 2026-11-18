// The search page: live results with summaries, kinds, filters, the query syntax help and forum matches.
// The search engine itself (index, query language, ranking) is in core/search-engine.js.
import { icons } from '../../ui/app.js';
import { esc, pageUrl, displayTitle } from '../../core/nlab.js';
import { allTopics } from '../../core/forum-data.js';
import { dbEnabled, smartSearch } from '../../core/db.js';
import { $, $$, params, setHero, link, rel } from './shell.js';

/* ---------------- Search ---------------- */
const KIND = { c: ['Concept', 'sigma'], t: ['Theorem', 'radical'], p: ['Person', 'user'], r: ['Reference', 'book-open'], d: ['Disambiguation', 'split'] };
const FILTERS = [['all', 'All'], ['c', 'Concepts'], ['t', 'Theorems'], ['p', 'People'], ['r', 'References']];
const SR_PAGE = 30;
const SYNTAX = [
  ['"natural transformation"', 'Exact phrase'],
  ['sheaf OR stack', 'Either word'],
  ['topos NOT elementary', 'Exclude a word (or -elementary)'],
  ['(monad OR comonad) AND algebra', 'Group with brackets'],
  ['homot*', 'Any ending'],
  ['title:fibration', 'Only in titles'],
  ['summary:anyon', 'Only in summaries'],
  ['kind:person cohomology', 'Concept, theorem, person, reference'],
];

export async function renderSearch(q0) {
  const searchMod = import('../../core/search-engine.js');
  const fieldsP = fetch('snapshot/graph.json').then((r) => r.json()).then((g) => g.fields).catch(() => []);
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  const st = {
    q: q0.trim(), kind: params.get('kind') || 'all', field: params.has('field') ? +params.get('field') : null,
    where: params.get('in') === 'title' ? 'title' : 'any', sort: ['linked', 'az'].includes(params.get('sort')) ? params.get('sort') : 'rel',
    shown: SR_PAGE, hits: [], disc: [], tree: null, advanced: false,
  };
  const filtersOn = () => (st.field != null) + (st.where !== 'any') + (st.sort !== 'rel');
  body.innerHTML = `<div class="sr">
    <form class="sr-box" role="search" autocomplete="off">
      <i data-lucide="search"></i>
      <input type="search" name="q" value="${esc(q0)}" placeholder="Search 20,000 pages: concepts, theorems, people…" aria-label="Search the nLab" spellcheck="false">
      <button type="button" class="sr-tool" data-sr="help" aria-expanded="false" title="Search syntax"><i data-lucide="circle-help"></i></button>
      <button type="button" class="sr-tool sr-ftoggle" data-sr="filters" aria-expanded="false"><i data-lucide="sliders-horizontal"></i><span>Filters</span><em hidden></em></button>
    </form>
    <div class="sr-help" hidden>
      <p>Combine words like in a library catalogue. Click an example to try it.</p>
      <div class="sr-help-grid">${SYNTAX.map(([ex, d]) => `<button type="button" data-ex="${esc(ex)}"><code>${esc(ex)}</code><span>${esc(d)}</span></button>`).join('')}</div>
    </div>
    <div class="sr-filters" hidden>
      <label><span>Field</span><select data-f="field"><option value="">All fields</option></select></label>
      <div class="sr-seg" role="group" aria-label="Match in"><span>Match in</span><button type="button" data-in="any">Anywhere</button><button type="button" data-in="title">Titles only</button></div>
      <div class="sr-seg" role="group" aria-label="Sort"><span>Sort</span><button type="button" data-sort="rel">Relevance</button><button type="button" data-sort="linked">Most linked</button><button type="button" data-sort="az">A–Z</button></div>
      <button type="button" class="linkish sr-reset" data-sr="reset">Reset</button>
    </div>
    <p class="sr-explain" hidden></p>
    <div class="sr-chips" role="tablist" aria-label="Kind of page"></div>
    <div class="sr-layout">
      <div class="sr-main" aria-live="polite">${'<div class="sr-skel"><span></span><span></span><span></span></div>'.repeat(5)}</div>
      <aside class="sr-side"></aside>
    </div>
  </div>`;
  icons();
  const input = $('.sr-box input', body);
  if (!q0) input.focus();
  let hl = (t) => esc(t);
  let FIELDS = [];
  fieldsP.then((f) => {
    FIELDS = f;
    $('[data-f="field"]', body).insertAdjacentHTML('beforeend', f.map((n, i) => `<option value="${i}" ${st.field === i ? 'selected' : ''}>${esc(n)}</option>`).join(''));
  });
  if (filtersOn()) { $('.sr-filters', body).hidden = false; $('[data-sr="filters"]', body).setAttribute('aria-expanded', 'true'); }

  const syncUrl = () => {
    const p = new URLSearchParams();
    if (st.q) p.set('q', st.q);
    if (st.kind !== 'all') p.set('kind', st.kind);
    if (st.field != null) p.set('field', st.field);
    if (st.where !== 'any') p.set('in', st.where);
    if (st.sort !== 'rel') p.set('sort', st.sort);
    history.replaceState(null, '', `search${p.toString() ? `?${p}` : ''}`);
  };
  const header = () => {
    const n = st.hits.length;
    setHero({
      title: st.q ? `“${st.q}”` : 'Search', crumb: 'Search',
      meta: st.q ? `${n.toLocaleString()} page${n === 1 ? '' : 's'}${st.disc.length ? ` · ${st.disc.length} forum discussion${st.disc.length === 1 ? '' : 's'}` : ''}` : 'Search every page of the nLab',
      actions: '',
    });
  };
  const item = (h) => {
    const [kl, ki] = KIND[h.kind] || KIND.c;
    const fl = FIELDS.filter((_, i) => h.fields & (1 << i)).slice(0, 2);
    return `<li><a class="sr-item" href="${esc(pageUrl(h.name))}">
      <span class="sr-ic k-${h.kind}"><i data-lucide="${ki}"></i></span>
      <span class="sr-txt">
        <b>${hl(displayTitle(h.name))}</b>
        ${h.via ? `<small>also called “${hl(h.via)}”</small>` : ''}
        ${goodSnippet(h.snippet) ? `<span class="sr-sum sr-snip">${snippetHtml(h.snippet)}</span>` : h.summary ? `<span class="sr-sum">${hl(h.summary)}</span>` : ''}
        <span class="sr-meta">${h.inText ? '<span class="sr-intext">Found in the text</span> · ' : h.byMeaning ? '<span class="sr-intext sr-meaning">Close in meaning</span> · ' : ''}${kl}${fl.length ? ` · ${fl.map(esc).join(', ')}` : ''}${h.inbound ? ` · ${h.inbound.toLocaleString()} page${h.inbound === 1 ? '' : 's'} link here` : ''}</span>
      </span></a></li>`;
  };
  const draw = () => {
    // controls
    $$('[data-in]', body).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.in === st.where)));
    $$('[data-sort]', body).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === st.sort)));
    const fsel = $('[data-f="field"]', body); if (fsel) fsel.value = st.field ?? '';
    const n = filtersOn(), badge = $('.sr-ftoggle em', body);
    badge.hidden = !n; badge.textContent = n;
    const ex = $('.sr-explain', body);
    ex.hidden = !st.advanced || !st.tree;
    if (!ex.hidden) ex.innerHTML = `<i data-lucide="filter"></i><span>Pages where ${explainTree(st.tree)}</span>`;

    const list = st.kind === 'all' ? st.hits : st.hits.filter((h) => h.kind === st.kind);
    const count = (k) => (k === 'all' ? st.hits.length : st.hits.filter((h) => h.kind === k).length);
    $('.sr-chips', body).innerHTML = st.q ? FILTERS.map(([k, l]) => {
      const c = count(k);
      return c || k === 'all' || k === st.kind ? `<button type="button" role="tab" data-k="${k}" aria-selected="${k === st.kind}">${l}<span>${c.toLocaleString()}</span></button>` : '';
    }).join('') : '';
    const main = $('.sr-main', body);
    if (!st.q) {
      main.innerHTML = `<div class="sr-empty"><p class="lead">Type a concept, a theorem or a person.</p><div class="sr-try">${['adjoint functor', 'homotopy type theory', 'Hopf fibration', 'anyon', 'Yoneda lemma', '"spectral sequence" NOT title:spectral'].map((t) => `<button type="button" data-ex="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
    } else if (!list.length) {
      main.innerHTML = `<div class="sr-empty"><p class="lead">Nothing matches “${esc(st.q)}”${st.kind !== 'all' || filtersOn() ? ' with these filters' : ''}.</p><p>Try fewer or different words${filtersOn() ? ', <button type="button" class="linkish" data-sr="reset">reset the filters</button>' : ''}${st.kind !== 'all' ? ', <button type="button" class="linkish" data-k="all">search every kind of page</button>' : ''}, or <a href="${esc(pageUrl(st.q, 'new'))}">create the page “${esc(st.q)}”</a>.</p></div>`;
    } else {
      const [top, ...rest] = list;
      const best = top.score >= 850 && st.kind === 'all' && st.sort === 'rel';
      const shown = best ? rest.slice(0, st.shown - 1) : list.slice(0, st.shown);
      main.innerHTML = `${best ? `<a class="sr-best" href="${esc(pageUrl(top.name))}">
          <span class="sr-best-k"><i data-lucide="${(KIND[top.kind] || KIND.c)[1]}"></i>${(KIND[top.kind] || KIND.c)[0]} · best match${top.inbound ? ` · ${top.inbound.toLocaleString()} pages link here` : ''}</span>
          <h2>${esc(displayTitle(top.name))}</h2>
          ${top.summary ? `<p>${hl(top.summary)}</p>` : ''}
          <span class="sr-best-go">Read the page <i data-lucide="arrow-right"></i></span>
        </a>` : ''}
        ${shown.length ? `<ol class="sr-list">${shown.map(item).join('')}</ol>` : ''}
        ${list.length > st.shown ? `<button type="button" class="tbtn sr-more">Show more <span>${(list.length - st.shown).toLocaleString()} more</span></button>` : ''}`;
    }
    $('.sr-side', body).innerHTML = st.q ? `${st.disc.length ? `<section><h3><i data-lucide="messages-square"></i>In the forum</h3>${st.disc.map((t) => `<a class="sr-disc" href="forum/?c=${t.channelId}&t=${encodeURIComponent(t.t)}"><b>${hl(t.t)}</b><span>${esc(t.channel)} · ${t.n} message${t.n === 1 ? '' : 's'} · ${rel(t.last)}</span></a>`).join('')}</section>` : ''}
      <section class="sr-create"><h3><i data-lucide="file-plus-2"></i>Missing a page?</h3><p>Anyone can start one, in LaTeX or visually. Your draft saves as you go.</p>${link(`Create “${st.q.replace(/["()*]|\b(AND|OR|NOT)\b|\w+:/g, '').trim() || st.q}”`, 'pen-line', pageUrl(st.q.replace(/["()*]|\b(AND|OR|NOT)\b|\w+:/g, '').trim() || st.q, 'new'))}</section>` : '';
    icons();
  };

  let topicsP, seq = 0, explainTree = () => '';
  const run = async (q) => {
    const my = ++seq;
    const mod = await searchMod;
    explainTree = mod.explain;
    const qq = q.trim();
    const [res, topics] = await Promise.all([qq ? mod.searchAll(qq, { field: st.field, where: st.where, sort: st.sort }) : { hits: [] }, (topicsP ??= allTopics().catch(() => []))]);
    if (my !== seq) return; // a newer query has started
    st.q = qq; st.shown = SR_PAGE; st.hits = res.hits; st.tree = res.tree; st.advanced = res.advanced;
    hl = (t) => mod.highlight(t, qq);
    const words = qq ? mod.terms(qq) : [];
    st.disc = words.length ? topics.filter((t) => t.channel !== 'Latest Changes' && words.every((w) => mod.norm(`${t.t} ${t.excerpt || ''}`).includes(w))).slice(0, 6) : [];
    syncUrl(); header(); draw();
    // then the database's smart search: pages close in meaning, and pages that mention the words anywhere
    if (!dbEnabled || !qq || st.where === 'title') return;
    try {
      const rows = await smartSearch(toWebSearch(qq), { field: st.field, limit: 60 });
      if (my !== seq) return;
      const have = new Set(st.hits.map((h) => h.name.toLowerCase()));
      const extra = rows.filter((r) => !have.has(r.name.toLowerCase())).map((r) => ({
        name: r.name, kind: r.kind, summary: r.summary, inbound: r.inbound, fields: r.fields, aliases: [],
        score: 40 + (r.score ?? r.rank) * 60, snippet: r.snippet, inText: r.by_words, byMeaning: r.by_meaning && !r.by_words,
      }));
      if (!extra.length) return;
      st.hits = st.hits.concat(extra);
      if (st.sort === 'linked') st.hits.sort((a, b) => b.inbound - a.inbound);
      else if (st.sort === 'az') st.hits.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      header(); draw();
    } catch { /* database not set up yet: title and summary results only */ }
  };

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { $$('.nav-search input').forEach((i) => { i.value = input.value; }); run(input.value); }, 140);
  });
  $('.sr-box', body).addEventListener('submit', (e) => {
    e.preventDefault();
    const h = st.hits[0];
    if (h && h.score >= 850 && !st.advanced) location.href = pageUrl(h.name);
  });
  body.addEventListener('change', (e) => {
    if (e.target.matches('[data-f="field"]')) { st.field = e.target.value === '' ? null : +e.target.value; run(input.value); }
  });
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-k], [data-in], [data-sort], [data-sr], [data-ex], .sr-more');
    if (!t) return;
    const d = t.dataset;
    if (d.k) { st.kind = d.k; st.shown = SR_PAGE; syncUrl(); draw(); }
    else if (d.in) { st.where = d.in; run(input.value); }
    else if (d.sort) { st.sort = d.sort; run(input.value); }
    else if (d.ex) { input.value = d.ex; run(d.ex); input.focus(); }
    else if (d.sr === 'reset') { Object.assign(st, { field: null, where: 'any', sort: 'rel', kind: 'all' }); run(input.value); }
    else if (d.sr === 'help' || d.sr === 'filters') {
      const panel = $(d.sr === 'help' ? '.sr-help' : '.sr-filters', body);
      panel.hidden = !panel.hidden;
      t.setAttribute('aria-expanded', String(!panel.hidden));
    } else if (t.classList.contains('sr-more')) { st.shown += SR_PAGE * 2; draw(); }
  });
  $$('.nav-search input').forEach((i) => { i.value = q0; });
  header();
  await run(q0);
}

// the site's query language → Postgres web-search syntax (words, "phrases", OR, -word)
function toWebSearch(q) {
  return q.replace(/\b(title|summary|kind|type|name|text):("[^"]*"|\S+)/gi, (m, f, v) => (/^(summary|text)$/i.test(f) ? v : ''))
    .replace(/\bNOT\s+/g, '-').replace(/\bAND\b/g, ' ').replace(/[()*]/g, ' ').replace(/\s+/g, ' ').trim();
}
// a database snippet: nLab markup cleaned up, matches (⟦…⟧) highlighted
const cleanMarkup = (raw) => raw.replace(/(\+--|=--)[^\n]*/g, ' ').replace(/\bContext\s*#+[^⟦]*?(?=[A-Z][a-z]+ [a-z])/g, ' ').replace(/\\label\{?[\w:-]*\}?|label[A-Z]\w*/g, ' ').replace(/#+\s*Contents?\s*#*/gi, ' ');
// a snippet is only worth showing if it highlights a match and isn't mostly markup
const goodSnippet = (raw) => !!raw && raw.includes('⟦') && cleanMarkup(raw).replace(/[^A-Za-z]/g, '').length > 40;
function snippetHtml(raw) {
  const text = cleanMarkup(raw).replace(/\]\([^)]*\)/g, ' ').replace(/\[\[!\w+[^\]]*\]\]/g, ' ').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\{[:#][^}]*\}/g, ' ').replace(/(^|\s)#+\s*/g, ' ').replace(/[*_`>|]+/g, '').replace(/\$+/g, '')
    .replace(/\\(mathbb|mathcal|mathrm|mathbf|text|operatorname)\{([^}]*)\}/g, '$2').replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '')
    .replace(/\s+/g, ' ').trim();
  return `…${esc(text).replace(/⟦/g, '<mark>').replace(/⟧/g, '</mark>')}…`;
}
