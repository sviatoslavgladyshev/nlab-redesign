// Reading an article: published version or your draft, the header actions, and opening the editor.
import { icons } from '../../ui/app.js';
import { esc, pageUrl, fetchSource, loadIndex, PageNotFound, displayTitle } from '../../core/nlab.js';
import { drafts, draftsSynced } from '../../core/drafts.js';
import { $, params, setHero, btn, link, toast } from './shell.js';
import { renderInto, renderContext, buildToc } from './render.js';
import { focusOn, toggleReading } from './reading.js';
import { newTemplate } from './templates.js';

// the editor (CodeMirror, KaTeX tooling…) is loaded only when someone opens it
const openWorkspace = async (opts) => (await import('../editor/editor.js')).openWorkspace(opts);

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
      + `<button type="button" class="tbtn" data-act="focus-read" aria-pressed="${focusOn()}" title="ADHD reading: a calmer font, wider spacing and bold word beginnings that guide the eye"><i data-lucide="book-text"></i><span>ADHD reading</span></button>`,
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

export async function renderArticle(requested) {
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
  const start = d?.source ?? (state.exists ? state.published : newTemplate(state.name, params.get('tpl')));
  const u = new URL(location.href); u.searchParams.delete('new'); u.searchParams.delete('edit'); u.searchParams.delete('suggest'); u.searchParams.set(suggestion ? 'suggest' : 'edit', ''); history.replaceState(null, '', u);
  openWorkspace({
    name: state.name, original: state.exists ? state.published : '', start, isNew: !state.exists, suggestion,
    onExit: (how) => {
      const v = new URL(location.href); v.searchParams.delete('edit'); v.searchParams.delete('suggest'); history.replaceState(null, '', v);
      showArticle(drafts.get(state.name) ? 'draft' : 'published');
      if (how === 'published') toast('Thanks! It may take a little while for the nLab mirror to show your change here.');
      else if (how === 'suggested') toast('Suggestion prepared. Share it in the forum so an author can review it.');
      else if (drafts.get(state.name)) toast(draftsSynced() ? 'Draft saved to your account.' : 'Draft saved in this browser.');
    },
  });
}

// Header buttons and the E shortcut
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'edit') openEditor(false);
  else if (act === 'suggest') openEditor(true);
  else if (act === 'toggle-published') showArticle(state.showingDraft ? 'published' : 'draft');
  else if (act === 'focus-read') toggleReading(b);
  else if (act === 'share') { try { await navigator.clipboard.writeText(location.href.replace(/[?&]edit\b/, '')); toast('Link copied.'); } catch { toast(location.href); } }
});
addEventListener('keydown', (e) => {
  if (state.name && !document.body.classList.contains('ws-open') && e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey
    && !/input|textarea|select/i.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { e.preventDefault(); openEditor(!canDirectEdit()); }
});
