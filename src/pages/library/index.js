// Library: every nLab page, filterable by kind (concepts, theorems, people, references),
// field and subject, sortable by how often pages are linked to, with lazy previews.
// Data: snapshot/library.json, built from the nLab content mirror by scripts/mirror-index.mjs.
import { icons } from '../../ui/app.js';
import { withPageLoading } from '../../ui/page-loading.js';
import './library.css';
import 'katex/dist/katex.min.css';
import { esc, pageUrl, displayTitle } from '../../core/nlab.js';
import { fillPreview } from '../../ui/preview.js';
import { isExcludedPage } from '../../core/page-visibility.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const KINDS = [
  ['all', 'All pages', 'library'], ['c', 'Concepts', 'sigma'], ['t', 'Theorems & results', 'radical'],
  ['p', 'People', 'users'], ['r', 'References', 'book-open'], ['s', 'Sandbox', 'flask-conical'],
];
const FIELD_ICONS = ['network', 'sigma', 'orbit', 'globe', 'history', 'library', 'scroll-text', 'atom', 'presentation', 'atom', 'hash', 'lightbulb'];
const PAGE = 48;

const state = { kind: 'all', field: null, sub: null, q: '', sort: 'linked', letter: null, shown: PAGE };
const readUrl = () => {
  const p = new URLSearchParams(location.search);
  state.kind = KINDS.some((k) => k[0] === p.get('kind')) ? p.get('kind') : 'all';
  state.field = p.has('field') ? +p.get('field') : null;
  state.sub = p.has('sub') ? +p.get('sub') : null;
  state.q = p.get('q') || '';
  state.sort = p.get('sort') === 'az' ? 'az' : 'linked';
  state.letter = p.get('letter');
};
const writeUrl = () => {
  const p = new URLSearchParams();
  if (state.kind !== 'all') p.set('kind', state.kind);
  if (state.field != null) p.set('field', state.field);
  if (state.sub != null) p.set('sub', state.sub);
  if (state.q) p.set('q', state.q);
  if (state.sort !== 'linked') p.set('sort', state.sort);
  if (state.letter) p.set('letter', state.letter);
  history.replaceState(null, '', `library/${p.toString() ? `?${p}` : ''}`);
};

let LIB;
const initials = (n) => n.replace(/\(.*?\)/g, '').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const letterOf = (n) => { const c = n[0].toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };

/* ---------- filtering ---------- */
const fieldsOf = (p) => [...new Set(p.subs.map((s) => LIB.subs[s][1]))];
function matches(p, { kind = state.kind, field = state.field, sub = state.sub, q = state.q } = {}) {
  if (kind === 'all' ? p.kind === 's' : p.kind !== kind) return false; // sandboxes only in their own section
  if (sub != null && !p.subs.includes(sub)) return false;
  if (field === -2 && p.subs.length) return false; // "Unsorted"
  if (field != null && field >= 0 && !p.fields.includes(field)) return false;
  if (q && !p.lower.includes(q)) return false;
  return true;
}

function render() {
  if (!LIB) return;
  const q = state.q.toLowerCase();
  const base = { q };
  // kind tabs with counts (respecting field + search)
  $('#lib-kinds').innerHTML = KINDS.map(([k, label, icon]) => {
    const n = LIB.pages.reduce((s, p) => s + (matches(p, { ...base, kind: k }) ? 1 : 0), 0);
    return `<button type="button" role="tab" data-kind="${k}" aria-selected="${state.kind === k}"><i data-lucide="${icon}"></i><span>${label}</span><em>${n.toLocaleString()}</em></button>`;
  }).join('');

  // fields with counts (respecting kind + search)
  const fieldCounts = LIB.fields.map(() => 0);
  let unsorted = 0, all = 0;
  const subCounts = new Map();
  for (const p of LIB.pages) {
    if (!matches(p, { ...base, field: null, sub: null })) continue;
    all += 1;
    if (!p.subs.length) unsorted += 1;
    p.fields.forEach((f) => { if (f >= 0) fieldCounts[f] += 1; });
    if (state.field != null) p.subs.forEach((s) => { if (LIB.subs[s][1] === state.field) subCounts.set(s, (subCounts.get(s) || 0) + 1); });
  }
  const subsHTML = state.field != null && state.field >= 0
    ? `<div class="lib-subs">${[...subCounts].sort((a, b) => b[1] - a[1]).map(([s, n]) => `<button type="button" data-sub="${s}" aria-pressed="${state.sub === s}">${esc(LIB.subs[s][0])}<em>${n.toLocaleString()}</em></button>`).join('')}</div>` : '';
  $('#lib-fields').innerHTML = `
    <button type="button" data-field="" class="${state.field == null ? 'on' : ''}"><i data-lucide="library"></i><span>All fields</span><em>${all.toLocaleString()}</em></button>
    ${LIB.fields.map((f, i) => fieldCounts[i] ? `<button type="button" data-field="${i}" class="${state.field === i ? 'on' : ''}"><i data-lucide="${FIELD_ICONS[i] || 'hash'}"></i><span>${esc(f)}</span><em>${fieldCounts[i].toLocaleString()}</em></button>${state.field === i ? subsHTML : ''}` : '').join('')}
    ${unsorted ? `<button type="button" data-field="-2" class="${state.field === -2 ? 'on' : ''}"><i data-lucide="inbox"></i><span>Not yet sorted</span><em>${unsorted.toLocaleString()}</em></button>` : ''}`;

  // results
  let list = LIB.pages.filter((p) => matches(p, base));
  if (state.sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  else list.sort((a, b) => b.inbound - a.inbound || a.name.localeCompare(b.name));
  const letters = state.sort === 'az' ? [...new Set(list.map((p) => letterOf(p.name)))] : [];
  $('#lib-az').hidden = state.sort !== 'az';
  $('#lib-az').innerHTML = letters.map((L) => `<button type="button" data-letter="${L}" aria-pressed="${state.letter === L}">${L}</button>`).join('');
  if (state.sort === 'az' && state.letter) list = list.filter((p) => letterOf(p.name) === state.letter);

  const kindLabel = KINDS.find((k) => k[0] === state.kind)[1].toLowerCase();
  $('#lib-count').innerHTML = `<b>${list.length.toLocaleString()}</b> ${state.kind === 'all' ? 'pages' : kindLabel}`;
  const chips = [];
  if (state.field != null) chips.push(['field', state.field === -2 ? 'Not yet sorted' : LIB.fields[state.field]]);
  if (state.sub != null) chips.push(['sub', LIB.subs[state.sub][0]]);
  if (state.q) chips.push(['q', `“${state.q}”`]);
  if (state.letter && state.sort === 'az') chips.push(['letter', `Starting with ${state.letter}`]);
  $('#lib-chips').innerHTML = chips.map(([k, l]) => `<button type="button" class="chip" data-clear="${k}" title="Remove filter">${esc(l)}<i data-lucide="x"></i></button>`).join('')
    + (chips.length > 1 ? '<button type="button" class="chip clear-all" data-clear="all">Clear all</button>' : '');
  $$('.lib-sort button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));

  const grid = $('#lib-grid');
  const items = list.slice(0, state.shown);
  const intro = state.kind === 's' ? `<div class="lib-sandbox"><span class="lsb-ic"><i data-lucide="flask-conical"></i></span><div><b>Sandboxes</b><p>Scratch pages where anyone can try out the syntax, test formulas and diagrams, or experiment before writing a real article. Edits here publish directly.</p></div><a class="tbtn primary" href="${esc(pageUrl('Sandbox', 'edit'))}"><i data-lucide="pen-line"></i><span>Open the main sandbox</span></a></div>` : '';
  grid.innerHTML = intro + (items.length ? items.map(card).join('') : `<div class="lib-empty"><p>No pages match these filters.</p>
    ${state.q ? `<a class="tbtn primary" href="${esc(pageUrl(state.q, 'new'))}"><i data-lucide="file-plus-2"></i><span>Write a page “${esc(state.q)}”</span></a>` : ''}</div>`);
  $('#lib-more').hidden = list.length <= state.shown;
  $('#lib-more span').textContent = `Show more (${(list.length - state.shown).toLocaleString()} left)`;
  grid.classList.remove('swap-in'); void grid.offsetWidth; grid.classList.add('swap-in');
  $$('.lib-card', grid).forEach((c) => previewIO.observe(c));
  icons();
  writeUrl();
}

function card(p) {
  const f = p.fields.find((x) => x >= 0);
  const tag = p.kind === 's' ? 'Sandbox' : p.kind === 't' ? 'Theorem' : p.kind === 'r' ? 'Reference' : p.kind === 'd' ? 'Disambiguation' : f != null ? LIB.fields[f] : '';
  const linked = p.inbound ? `${p.kind === 'p' ? 'Cited on' : 'Linked from'} ${p.inbound.toLocaleString()} page${p.inbound === 1 ? '' : 's'}` : 'New or rarely linked';
  if (p.kind === 'p') {
    return `<a class="lib-card person" href="${esc(pageUrl(p.name))}" data-name="${esc(p.name)}">
      <span class="av" style="--h:${hue(p.name)}">${esc(initials(displayTitle(p.name, true)))}</span>
      <span class="lc-body"><b>${esc(displayTitle(p.name, true))}</b><span class="lc-meta">${linked}</span>${p.fields.filter((x) => x >= 0).length ? `<span class="lc-fields">${p.fields.filter((x) => x >= 0).slice(0, 3).map((x) => `<span class="lc-tag">${esc(LIB.fields[x])}</span>`).join('')}</span>` : ''}<span class="lc-ex"></span></span></a>`;
  }
  return `<a class="lib-card" href="${esc(pageUrl(p.name))}" data-name="${esc(p.name)}">
    ${tag ? `<span class="lc-tag k-${p.kind}">${esc(tag)}</span>` : ''}
    <b>${esc(displayTitle(p.name))}</b>
    <span class="lc-ex"></span>
    <span class="lc-meta"><i data-lucide="network"></i>${linked}</span></a>`;
}

const previewIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    previewIO.unobserve(e.target);
    fillPreview(e.target.querySelector('.lc-ex'), e.target.dataset.name);
  });
}, { rootMargin: '400px' });

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-kind], [data-field], [data-sub], [data-sort], [data-letter], [data-clear]');
  if (!t) return;
  const d = t.dataset;
  if (d.kind) state.kind = d.kind;
  else if ('field' in d) { const f = d.field === '' ? null : +d.field; state.field = state.field === f ? null : f; state.sub = null; }
  else if (d.sub) state.sub = state.sub === +d.sub ? null : +d.sub;
  else if (d.sort) { state.sort = d.sort; state.letter = null; }
  else if (d.letter) state.letter = state.letter === d.letter ? null : d.letter;
  else if (d.clear) {
    if (d.clear === 'all') Object.assign(state, { field: null, sub: null, q: '', letter: null });
    else if (d.clear === 'field') { state.field = null; state.sub = null; } else state[d.clear] = d.clear === 'q' ? '' : null;
    $('#lib-q').value = state.q;
  }
  state.shown = PAGE;
  render();
  if (!t.closest('.lib-side')) return;
  if (innerWidth < 900) $('.lib-main').scrollIntoView({ behavior: 'smooth' });
});
let qt;
$('#lib-q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); state.letter = null; state.shown = PAGE; render(); }, 150); });
$('#lib-more').addEventListener('click', () => { state.shown += PAGE; render(); });
new IntersectionObserver(([e]) => { if (e.isIntersecting && !$('#lib-more').hidden) { state.shown += PAGE; render(); } }, { rootMargin: '600px' }).observe($('.lib-more'));

/* ---------- load ---------- */
readUrl();
$('#lib-q').value = state.q;
withPageLoading('Loading the library…', async () => {
  const response = await fetch('snapshot/library.json');
  if (!response.ok) throw new Error('Library index request failed');
  const data = await response.json();
  LIB = {
    fields: data.fields,
    subs: data.subs,
    pages: data.pages.filter(([name]) => !isExcludedPage(name)).map(([name, kind, inbound, subs]) => ({ name, kind, inbound, subs, lower: name.toLowerCase(), fields: [] })),
  };
  LIB.pages.forEach((p) => { p.fields = fieldsOf(p); });
  render();
}).catch(() => { $('#lib-grid').innerHTML = '<p class="lib-empty">The library index could not be loaded.</p>'; });
