// Reading an article: published version or your draft, the header actions, and opening the editor.
import { icons } from '../../ui/app.js';
import { withPageLoading } from '../../ui/page-loading.js';
import { esc, pageUrl, fetchSource, loadIndex, PageNotFound, displayTitle } from '../../core/nlab.js';
import { drafts, draftsSynced } from '../../core/drafts.js';
import { dbEnabled, ownsPage, backlinks, similarPages, relatedPages } from '../../core/db.js';
import { $, params, setHero, btn, link, toast } from './shell.js';
import { renderInto, renderContext, buildToc } from './render.js';
import { applyFocusRead, focusOn, toggleReading } from './reading.js';
import { isUntouchedStarter, starterSource } from './templates.js';
import { swr } from '../../core/swr.js';

// the editor (CodeMirror, KaTeX tooling…) is loaded only when someone opens it
const openWorkspace = async (opts) => (await import('../editor/editor.js')).openWorkspace(opts);

const state = { name: '', published: '', exists: true, showingDraft: false, meta: null, owner: false };
// a new page renamed from the editor's title: follow it
addEventListener('ws-rename', (e) => { if (state.name === e.detail.from) state.name = e.detail.to; });
const isSandbox = (name) => /^sandbox(?:\d+)?$/i.test(String(name || '').trim());
// new pages, sandboxes and pages started on this site are edited directly; other nLab pages take suggestions
const canDirectEdit = (page = state) => !page.exists || isSandbox(page.name) || page.owner;
const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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
      <div class="a-similar" hidden></div>
    </div>`;
    buildToc(body);
    showSimilar(body);
  } else await renderInto(body, src);
  await showArticleHeader();
}

async function showArticleHeader() {
  const d = drafts.get(state.name);
  const useDraft = state.showingDraft && d;
  const src = useDraft ? d.source : state.published;
  const words = src.replace(/\$[^$]*\$|\[\[!.*?\]\]|[#*_>`{}]/g, ' ').split(/\s+/).filter(Boolean).length;
  const mirroredAt = state.meta?.mirroredAt || (!useDraft && state.exists && state.meta?.origin !== 'site' ? (await loadIndex()).committed : null);
  const meta = useDraft
    ? `<span class="badge draft">Your draft</span> saved ${new Date(d.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : !state.exists ? 'New page'
      : state.meta?.origin === 'site' ? `${words.toLocaleString()} words · edited here by <b>${esc(state.meta.updatedBy || 'a contributor')}</b>, ${when(state.meta.updatedAt)}`
        : `${words.toLocaleString()} words · from the nLab, as of ${new Date(mirroredAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const direct = canDirectEdit();
  setHero({
    title: displayTitle(state.name, /^category:\s*people/im.test(state.published)),
    meta,
    actions: `<button type="button" class="tbtn primary" data-act="${direct ? 'edit' : 'suggest'}" title="${direct ? 'Edit this page (E)' : 'Suggest an edit'}"><i data-lucide="${direct ? 'pencil' : 'message-square-plus'}"></i><span>${direct ? (state.exists ? 'Edit' : 'Create') : 'Suggest an edit'}</span></button>`
      + (state.owner ? link('Review suggestions', 'inbox', 'suggestions/') : '')
      + link('Discuss', 'messages-square', `forum/?q=${encodeURIComponent(state.name)}`)
      + btn('Copy link', 'link', 'data-act="share"')
      + `<button type="button" class="tbtn" data-act="focus-read" aria-pressed="${focusOn()}" title="ADHD reading: a calmer font, wider spacing and bold word beginnings that guide the eye"><i data-lucide="book-text"></i><span>ADHD reading</span></button>`,
  });
  const bar = $('#draft-bar');
  bar.hidden = !d;
  if (d) {
    bar.classList.toggle('viewing-published', !useDraft);
    $('#draft-title').textContent = useDraft ? 'You are reading your unpublished draft.' : 'You have an unpublished draft with this title.';
    const resume = $('#draft-bar [data-act="resume-draft"]');
    resume.querySelector('span').textContent = direct ? 'Continue editing' : 'Continue suggestion';
    $('#draft-copy').hidden = !state.exists;
    $('#draft-copy').href = `write?${new URLSearchParams({ 'from-draft': state.name })}`;
    $('#draft-when').textContent = `Saved ${new Date(d.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}, ${draftsSynced() ? 'to your account' : 'in this browser only'}.`;
    $('[data-act="toggle-published"] span').textContent = useDraft ? 'Show published' : 'Show my draft';
    $('[data-act="toggle-published"]').hidden = !state.exists;
  }
  icons();
}

export async function loadArticle(requested, { fresh = false } = {}) {
  let name = requested, source = '', meta = null, exists = true;
  try {
    ({ name, source, meta = null } = await fetchSource(requested, { fresh }));
  } catch (e) {
    if (!(e instanceof PageNotFound)) throw e;
    exists = false;
  }
  const owner = meta?.origin === 'site' && dbEnabled ? await ownsPage(name).catch(() => false) : false;
  return { name, published: source, meta, owner, exists };
}

export async function renderArticle(requested) {
  const wantsEditor = params.has('edit') || params.has('new') || params.has('suggest');
  scrollTo({ top: 0, left: 0, behavior: 'auto' });
  $('#crumb-current').textContent = requested;
  const article = await loadArticle(requested, { fresh: wantsEditor });
  const { name, published: source } = article;
  if (name !== requested) history.replaceState(null, '', `${new URL(pageUrl(name), document.baseURI).pathname}${location.search}${location.hash}`);
  Object.assign(state, article);
  $('#a-body').classList.add('loaded');
  if (params.has('new') && state.exists) {
    const url = new URL(location.href);
    for (const key of ['new', 'tpl', 'starter', 'edit', 'suggest']) {
      url.searchParams.delete(key);
      params.delete(key);
    }
    history.replaceState(null, '', url);
    toast('That title already exists. Choose a different title to create a new page.');
  } else if (wantsEditor) {
    await openEditor(state.exists && (params.has('suggest') || !canDirectEdit()));
    return;
  }
  await renderContext(source);
  await showArticle(drafts.get(name) ? 'draft' : 'published');
  if (state.exists) {
    // ask for both at once; draw related pages first, then backlinks
    const name = state.name;
    swr(`back:${name.toLowerCase()}`, () => backlinks(name, 24)).catch(() => {});
    showRelated().then(showBacklinks);
  }
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}

addEventListener('account-change', async () => {
  if (state.meta?.origin !== 'site' || !dbEnabled) return;
  const name = state.name;
  const owner = await ownsPage(name).catch(() => false);
  if (name !== state.name || owner === state.owner) return;
  state.owner = owner;
  await showArticleHeader();
});

addEventListener('reading-preference-change', (event) => {
  if (!state.name) return;
  const control = $('[data-act="focus-read"]');
  if (!control) return;
  control.setAttribute('aria-pressed', String(event.detail));
  applyFocusRead($('#a-body'), event.detail);
});

export function articleEditorOptions(page, { starterId, suggestion = !canDirectEdit(page) } = {}) {
  const d = drafts.get(page.name);
  const starter = !page.exists ? starterSource(starterId) : '';
  const start = d
    ? !page.exists && isUntouchedStarter(page.name, d.source) ? '' : d.source
    : page.exists ? page.published : starter;
  return { name: page.name, original: page.published, start, starter, isNew: !page.exists, suggestion };
}

function openEditor(suggestion = !canDirectEdit()) {
  const u = new URL(location.href);
  for (const key of ['new', 'edit', 'suggest', 'tpl']) u.searchParams.delete(key);
  u.searchParams.set(!state.exists ? 'new' : suggestion ? 'suggest' : 'edit', '');
  history.replaceState(null, '', u);
  return openWorkspace({
    ...articleEditorOptions(state, { starterId: params.get('starter'), suggestion }),
    onExit: (how) => {
      if (!how) {
        location.replace(new URL('write#drafts', document.baseURI));
        return;
      }
      const v = new URL(location.href);
      for (const key of ['new', 'edit', 'suggest', 'tpl', 'starter', 'from']) {
        params.delete(key);
        v.searchParams.delete(key);
      }
      history.replaceState(null, '', v);
      if (how === 'published-db') {
        toast('Published. It’s live for everyone.');
        renderArticle(state.name).catch((error) => toast(error.message || 'Could not refresh the published page.'));
        return;
      }
      renderContext(state.published).then(() => showArticle(drafts.get(state.name) ? 'draft' : 'published'))
        .catch((error) => toast(error.message || 'Could not display the article.'));
      if (how === 'suggested-db') { toast('Suggestion sent. The page’s authors can now review it.'); return; }
      if (how === 'published') toast('Thanks! It may take a little while for the nLab mirror to show your change here.');
      else if (how === 'suggested') toast('Suggestion prepared. Share it in the forum so an author can review it.');
      else if (drafts.get(state.name)) toast(draftsSynced() ? 'Draft saved to your account.' : 'Draft saved in this browser.');
    },
  });
}

let openingEditor = false;
async function openEditorFromArticle(suggestion) {
  if (openingEditor) return;
  openingEditor = true;
  try { await withPageLoading('Opening the editor…', () => openEditor(suggestion)); }
  catch (error) { toast(error.message || 'Could not open the editor.'); }
  finally { openingEditor = false; }
}

// Header buttons and the E shortcut
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'edit' || act === 'resume-draft') openEditorFromArticle();
  else if (act === 'suggest') openEditorFromArticle(true);
  else if (act === 'toggle-published') showArticle(state.showingDraft ? 'published' : 'draft');
  else if (act === 'focus-read') toggleReading(b);
  else if (act === 'share') { try { await navigator.clipboard.writeText(location.href.replace(/[?&]edit\b/, '')); toast('Link copied.'); } catch { toast(location.href); } }
});
addEventListener('keydown', (e) => {
  if (state.name && !document.body.classList.contains('ws-open') && e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey
    && !/input|textarea|select/i.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { e.preventDefault(); openEditorFromArticle(!canDirectEdit()); }
});

// "Pages that link here", from the database's link graph
async function showBacklinks() {
  if (!dbEnabled) return;
  let rows = [];
  try { rows = await swr(`back:${state.name.toLowerCase()}`, () => backlinks(state.name, 24)); } catch { return; }
  if (!rows.length || state.showingDraft) return;
  document.querySelector('.a-backlinks:not(.a-related)')?.remove();
  const sec = document.createElement('section');
  sec.className = 'a-backlinks';
  sec.innerHTML = `<h2 class="bl-h"><i data-lucide="corner-down-right"></i>Pages that link here</h2>
    <div class="bl-grid">${rows.map((r) => `<a href="${esc(pageUrl(r.name))}"><b>${esc(displayTitle(r.name, r.kind === 'p'))}</b>${r.summary ? `<span>${esc(r.summary.length > 120 ? `${r.summary.slice(0, 118)}…` : r.summary)}</span>` : ''}</a>`).join('')}</div>`;
  $('#a-body').append(sec);
  icons();
}

// a missing page: "Did you mean …?" from close titles
async function showSimilar(body) {
  if (!dbEnabled) return;
  const box = body.querySelector('.a-similar');
  try {
    const rows = (await similarPages(state.name, 6)).filter((r) => r.similarity > 0.3);
    if (!rows.length || !box) return;
    box.innerHTML = `<p class="a-similar-h">Did you mean</p>${rows.map((r) => `<a href="${esc(pageUrl(r.name))}">${esc(displayTitle(r.name, r.kind === 'p'))}</a>`).join('')}`;
    box.hidden = false;
  } catch { /* no database: nothing to suggest */ }
}

// "Related pages": the pages closest in meaning (embeddings, supabase/rag.sql)
async function showRelated() {
  if (!dbEnabled) return;
  let rows = [];
  try { rows = await swr(`rel:${state.name.toLowerCase()}`, () => relatedPages(state.name, 8)); } catch { return; }
  if (!rows.length || state.showingDraft) return;
  document.querySelector('.a-related')?.remove();
  const sec = document.createElement('section');
  sec.className = 'a-backlinks a-related';
  sec.innerHTML = `<h2 class="bl-h"><i data-lucide="sparkles"></i>Related pages</h2>
    <div class="bl-grid">${rows.map((r) => `<a href="${esc(pageUrl(r.name))}"><b>${esc(displayTitle(r.name, r.kind === 'p'))}</b>${r.summary ? `<span>${esc(r.summary.length > 120 ? `${r.summary.slice(0, 118)}…` : r.summary)}</span>` : ''}</a>`).join('')}</div>`;
  $('#a-body').append(sec);
  icons();
}
