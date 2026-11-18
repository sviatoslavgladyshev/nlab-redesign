// Article / search viewer: loads nLab content (live through the dev proxy, or from the
// build-time snapshot) and re-renders it in the redesigned layout. Articles are editable:
// the editor loads the page's nLab source, previews it live and keeps edits in this browser
// until they are submitted to the nLab.
import { icons } from './main.js';
import './article.css';
import { ORIGIN, LIVE, decodeName, encodeName, liveUrl, esc, rewriteHref, clean, fetchDoc, fetchSource, NotInSnapshot } from './nlab.js';
import { renderSource, diffLines } from './markup.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function setHero({ title, crumb, meta = '', actions = [], edit = false }) {
  document.title = `${title} — nLab`;
  $('#a-title').textContent = title;
  $('#crumb-current').textContent = crumb ?? title;
  $('#a-meta').textContent = meta || ' ';
  $('#a-actions').innerHTML = (edit ? '<button type="button" class="tbtn primary" data-act="edit" title="Edit this page (E)"><i data-lucide="pencil"></i><span>Edit</span></button>' : '')
    + actions.map(([label, href, icon]) =>
      `<a class="tbtn" href="${esc(href)}" target="_blank" rel="noopener">${icon ? `<i data-lucide="${icon}"></i>` : ''}<span>${esc(label)}</span></a>`).join('');
  icons();
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

const toast = (msg) => {
  const t = Object.assign(document.createElement('div'), { className: 'toast', role: 'status', textContent: msg });
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4800);
};

/* ---------------- Shared post-processing ---------------- */
function numberEnvs(root) {
  let n = 0;
  root.querySelectorAll('[class^="num_"], [class*=" num_"]').forEach((env) => {
    n += 1;
    const head = env.querySelector('h6');
    if (head && !/\d/.test(head.textContent)) head.textContent = `${head.textContent.trim()} ${n}`;
  });
}

let spy;
function buildToc(body) {
  spy?.disconnect();
  const heads = [...body.querySelectorAll('h2[id], h3[id]')];
  const toc = $('#a-toc');
  toc.innerHTML = '';
  if (!heads.length && $('#ctx-tab').hidden) return;
  $('#a-side').hidden = false;
  document.body.classList.add('has-side');
  $('[data-tab="toc"]').hidden = !heads.length;
  if (!heads.length) { activateTab('ctx'); return; }

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

// Render nLab source to a sanitized fragment
function sourceToNodes(src) {
  const wrap = document.createElement('div');
  wrap.innerHTML = renderSource(src);
  clean(wrap);
  numberEnvs(wrap);
  return wrap;
}

/* ---------------- Local drafts ---------------- */
const draftKey = (name) => `nlab-draft:${name}`;
const drafts = {
  get(name) { try { return JSON.parse(localStorage.getItem(draftKey(name))); } catch { return null; } },
  set(name, d) { try { localStorage.setItem(draftKey(name), JSON.stringify(d)); return true; } catch { return false; } },
  clear(name) { try { localStorage.removeItem(draftKey(name)); } catch { /* ignore */ } },
};

/* ---------------- Article ---------------- */
const state = { name: '', published: null, meta: '', actions: [], original: null, showingDraft: false };

function showPublished() {
  const body = $('#a-body');
  body.replaceChildren(state.published.cloneNode(true));
  state.showingDraft = false;
  setHero({ title: state.name, meta: state.meta, actions: state.actions, edit: true });
  updateDraftBar();
  buildToc(body);
}

function showDraft() {
  const d = drafts.get(state.name);
  if (!d) return showPublished();
  const body = $('#a-body');
  body.replaceChildren(...sourceToNodes(d.source).childNodes);
  state.showingDraft = true;
  setHero({ title: state.name, meta: `Edited in this browser${d.summary ? ` — “${d.summary}”` : ''}`, actions: state.actions, edit: true });
  updateDraftBar();
  buildToc(body);
}

function updateDraftBar() {
  const d = drafts.get(state.name);
  const bar = $('#draft-bar');
  bar.hidden = !d;
  if (!d) return;
  bar.classList.toggle('viewing-published', !state.showingDraft);
  $('#draft-when').textContent = `Saved ${new Date(d.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`;
  $('b', bar).textContent = state.showingDraft ? 'You are viewing your edited version.' : 'You have unsubmitted edits to this page.';
  $('[data-act="toggle-published"] span', bar).textContent = state.showingDraft ? 'Show published' : 'Show my version';
}

async function renderArticle(requested) {
  $('#crumb-current').textContent = requested;
  const { doc, path } = await fetchDoc(`/nlab/show/${encodeName(requested)}`);
  const rev = $('#revision', doc);
  if (!rev) throw new Error('No page content');

  // Follow nLab redirects to the canonical page name
  const m = path.match(/^\/nlab\/show\/(.+)$/);
  const name = m ? decodeName(m[1]) : requested;
  if (name !== requested) { const u = new URL(location.href); u.searchParams.set('p', name); history.replaceState(null, '', u); }

  const ctx = $('.rightHandSide', rev);
  ctx?.remove();
  rev.querySelectorAll('.toc, .maruku_toc, #section_table_of_contents').forEach((n) => n.remove());
  [...rev.querySelectorAll('h1')].forEach((h) => { if (/^\s*contents\s*$/i.test(h.textContent)) h.remove(); });
  clean(rev);
  numberEnvs(rev);

  const revised = ($('.revisedby', doc)?.textContent.replace(/\s+/g, ' ').trim() || '').split(/(?<=\d)\.\s/)[0];
  const discuss = [...doc.querySelectorAll('.navigation a')].find((a) => /discuss/i.test(a.textContent));
  const enc = encodeName(name);
  Object.assign(state, {
    name,
    meta: revised.replace(/\.?\s*$/, ''),
    actions: [
      ['History', `${ORIGIN}/nlab/history/${enc}`, 'history'],
      ...(discuss ? [['Discuss', new URL(discuss.getAttribute('href'), ORIGIN).href, 'messages-square']] : []),
      ['View on nLab', `${ORIGIN}/nlab/show/${enc}`, 'external-link'],
    ],
    published: document.createDocumentFragment(),
  });
  state.published.append(...rev.childNodes);

  if (ctx && ctx.textContent.trim()) {
    clean(ctx);
    $('#a-ctx').append(...ctx.childNodes);
    $('#ctx-tab').hidden = false;
  }
  $('#a-body').classList.add('loaded');
  if (drafts.get(name)) showDraft(); else showPublished();

  if (new URLSearchParams(location.search).has('edit')) openEditor();
  else if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}

/* ---------------- Editor ---------------- */
const ed = {
  root: $('#editor'), text: $('#ed-text'), preview: $('#ed-preview'), diff: $('#ed-diff'), summary: $('#ed-summary'),
  status: $('#ed-status'), open: false, base: '', timer: 0,
};
const dirty = () => ed.open && ed.text.value !== ed.base;

async function openEditor() {
  if (ed.open || !state.name) return;
  ed.open = true;
  document.body.classList.add('editing');
  $('#a-layout').hidden = true;
  $('#draft-bar').hidden = true;
  ed.root.hidden = false;
  $('#a-meta').textContent = 'Editing';
  $('#a-actions').hidden = true;
  const url = new URL(location.href); url.searchParams.set('edit', ''); history.replaceState(null, '', url.href.replace(/edit=(&|$)/, 'edit$1'));
  scrollTo({ top: 0 });

  const d = drafts.get(state.name);
  ed.text.value = d?.source ?? '';
  ed.summary.value = d?.summary ?? '';
  ed.text.disabled = !d;
  ed.text.placeholder = 'Loading the page source…';
  try {
    state.original ??= await fetchSource(state.name);
  } catch (e) {
    if (!d) {
      ed.text.placeholder = '';
      ed.text.value = '';
      ed.status.innerHTML = `<b>Could not load the source</b> (${esc(e.message)}). <a href="${ORIGIN}/nlab/edit/${encodeName(state.name)}" target="_blank" rel="noopener">Edit on ncatlab.org ›</a>`;
      ed.status.classList.add('err');
      return;
    }
  }
  if (!d) ed.text.value = state.original;
  ed.base = ed.text.value;
  ed.text.disabled = false;
  renderPreview();
  ed.text.focus();
  ed.text.setSelectionRange(0, 0);
  ed.text.scrollTop = 0;
}

function closeEditor() {
  ed.open = false;
  document.body.classList.remove('editing');
  ed.root.hidden = true;
  $('#a-layout').hidden = false;
  $('#a-actions').hidden = false;
  const url = new URL(location.href); url.searchParams.delete('edit'); history.replaceState(null, '', url);
  ed.status.classList.remove('err');
}

function renderPreview() {
  clearTimeout(ed.timer);
  ed.timer = setTimeout(() => {
    const nodes = sourceToNodes(ed.text.value);
    nodes.querySelectorAll('a[href]:not([href^="#"])').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
    ed.preview.replaceChildren(...nodes.childNodes);
    renderDiff();
  }, 140);
}

function renderDiff() {
  const base = state.original ?? ed.base;
  const { ops, offset, added, removed } = diffLines(base, ed.text.value);
  $('#ed-count').textContent = added || removed ? `+${added} −${removed}` : '';
  if (!added && !removed) { ed.diff.innerHTML = '<p class="d-none">No changes yet.</p>'; return; }
  // Show changed lines with three lines of context
  const keep = ops.map((o, i) => ops.slice(Math.max(0, i - 3), i + 4).some((x) => x[0] !== ' '));
  let html = '', ln = offset, gap = 0;
  ops.forEach(([op, line], i) => {
    if (op !== '+') ln += 1;
    if (!keep[i]) { gap += 1; return; }
    if (gap) { html += `<div class="d-gap">⋯ ${gap} unchanged line${gap === 1 ? '' : 's'}</div>`; gap = 0; }
    const cls = op === '+' ? 'd-add' : op === '-' ? 'd-del' : 'd-ctx';
    html += `<div class="${cls}"><span class="d-ln">${op === '+' ? '' : ln}</span><span class="d-op">${op}</span><code>${esc(line) || ' '}</code></div>`;
  });
  if (gap) html += `<div class="d-gap">⋯ ${gap} unchanged line${gap === 1 ? '' : 's'}</div>`;
  ed.diff.innerHTML = html;
}

function save() {
  const src = ed.text.value;
  if (src === state.original) drafts.clear(state.name);
  else if (!drafts.set(state.name, { source: src, summary: ed.summary.value.trim(), savedAt: Date.now() })) {
    toast('Could not save: browser storage is unavailable.');
    return;
  }
  ed.base = src;
  closeEditor();
  if (drafts.get(state.name)) { showDraft(); toast('Saved in this browser. Use “Submit to nLab” to publish it.'); }
  else { showPublished(); toast('No changes — showing the published page.'); }
  scrollTo({ top: 0 });
}

function cancel() {
  if (dirty() && !confirm('Discard your unsaved changes?')) return;
  closeEditor();
  if (drafts.get(state.name)) showDraft(); else showPublished();
}

async function submit() {
  const d = drafts.get(state.name);
  if (!d) return;
  try { await navigator.clipboard.writeText(d.source); } catch { /* clipboard may be blocked */ }
  window.open(`${ORIGIN}/nlab/edit/${encodeName(state.name)}`, '_blank', 'noopener');
  toast('Your source is copied. Paste it into the nLab editor that just opened and save it there.');
}

// Editor views (split / source / preview / changes)
$$('.ed-tabs button').forEach((b) => b.addEventListener('click', () => {
  $$('.ed-tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  $('.ed-panes').dataset.view = b.dataset.view;
  if (b.dataset.view === 'changes') renderDiff();
}));
// Narrow screens have no room for side-by-side panes
const narrow = matchMedia('(max-width: 900px)');
const fitView = () => { if (narrow.matches && $('.ed-panes').dataset.view === 'split') $('.ed-tabs [data-view="write"]').click(); };
narrow.addEventListener('change', fitView);
fitView();

// Formatting
function insert(text, selStart, selEnd) {
  const t = ed.text;
  t.focus();
  const start = t.selectionStart;
  if (!document.execCommand?.('insertText', false, text)) t.setRangeText(text, t.selectionStart, t.selectionEnd, 'end');
  if (selStart != null) t.setSelectionRange(start + selStart, start + (selEnd ?? selStart));
  renderPreview();
}
function wrap(before, after, placeholder) {
  const t = ed.text;
  const sel = t.value.slice(t.selectionStart, t.selectionEnd) || placeholder;
  insert(before + sel + after, before.length, before.length + sel.length);
}
function prefixLines(fn) {
  const t = ed.text;
  const v = t.value;
  const s = v.lastIndexOf('\n', t.selectionStart - 1) + 1;
  let e = v.indexOf('\n', t.selectionEnd); if (e < 0) e = v.length;
  t.setSelectionRange(s, e);
  const lines = v.slice(s, e).split('\n').map(fn).join('\n');
  insert(lines, lines.length);
}
const FMT = {
  bold: () => wrap('**', '**', 'bold text'),
  italic: () => wrap('_', '_', 'emphasis'),
  code: () => wrap('`', '`', 'code'),
  math: () => wrap('$', '$', 'x'),
  display: () => wrap('\n$$\n  ', '\n  \\,.\n$$\n', 'a \\otimes b'),
  link: () => wrap('[[', ']]', 'page name'),
  heading: () => prefixLines((l) => (/^#{2,}\s/.test(l) ? l.replace(/^(#+)/, '$1#') : `## ${l}`).replace(/^#{7,}\s/, '')),
  list: () => prefixLines((l) => `* ${l}`),
  olist: () => prefixLines((l, i) => `${i + 1}. ${l}`),
};
$$('.ed-toolbar button').forEach((b) => b.addEventListener('click', () => FMT[b.dataset.fmt]?.()));
$('.ed-toolbar select').addEventListener('change', (e) => {
  const [cls, label] = e.target.value.split('|');
  e.target.value = '';
  if (!cls) return;
  const id = `${label}${Date.now().toString(36).slice(-4)}`;
  const block = cls === 'proof'
    ? `\n+-- {: .proof}\n###### Proof\n\n…\n\n=--\n`
    : `\n+-- {: .num_${cls} #${id}}\n###### ${label}\n\n…\n\n=--\n`;
  const at = block.indexOf('…');
  insert(block, at, at + 1);
});

ed.text.addEventListener('input', renderPreview);
ed.text.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); FMT.bold(); }
  else if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); FMT.italic(); }
  else if (mod && e.key.toLowerCase() === 'm') { e.preventDefault(); FMT.math(); }
  else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); insert('  '); }
});
// Keep the preview roughly in step with the source
ed.text.addEventListener('scroll', () => {
  const t = ed.text;
  const r = t.scrollTop / Math.max(1, t.scrollHeight - t.clientHeight);
  ed.preview.scrollTop = r * (ed.preview.scrollHeight - ed.preview.clientHeight);
}, { passive: true });

// Buttons (hero, draft bar, editor footer)
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'edit') openEditor();
  else if (act === 'save') save();
  else if (act === 'cancel') cancel();
  else if (act === 'submit') submit();
  else if (act === 'toggle-published') (state.showingDraft ? showPublished : showDraft)();
  else if (act === 'discard' && confirm('Discard your edits to this page? This cannot be undone.')) {
    drafts.clear(state.name);
    showPublished();
    toast('Your edits were discarded.');
  }
});
addEventListener('keydown', (e) => {
  if (ed.open && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  else if (ed.open && e.key === 'Escape') cancel();
  else if (!ed.open && state.name && e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey
    && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); openEditor(); }
});
addEventListener('beforeunload', (e) => { if (dirty()) e.preventDefault(); });

/* ---------------- Search ---------------- */
async function renderSearch(q) {
  setHero({ title: `“${q}”`, crumb: 'Search', meta: 'Searching the nLab…' });
  $$('.nav-search input').forEach((i) => { i.value = q; });
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
    actions: [['Search on ncatlab.org', `${ORIGIN}/nlab/search?query=${encodeURIComponent(q)}`, 'external-link']],
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
