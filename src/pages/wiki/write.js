// Start a page and manage drafts and publications.
import { busy, icons } from '../../ui/app.js';
import { esc, pageUrl, findExistingTitle } from '../../core/nlab.js';
import { isExcludedPage } from '../../core/page-visibility.js';
import { $, params, setHero, link } from './shell.js';
import { currentUser, dbEnabled, myPublications } from '../../core/db.js';
import { drafts as draftStore, draftsSynced } from '../../core/drafts.js';
import { PAGE_STARTERS, starterSource } from './templates.js';

const titleHint = 'Use the name of the concept, result or person, as you would in a dictionary.';
const titleConflict = (name) => `<strong>Page already exists</strong> <a href="${esc(pageUrl(name))}">${esc(name)}</a> is already in the wiki. Choose another title, or <a href="${esc(pageUrl(name, 'suggest'))}">suggest an edit</a>.`;

function renderDrafts() {
  const list = $('#draft-list');
  if (!list) return;
  $('.w-sync').innerHTML = draftsSynced()
    ? 'Drafts sync with your account.'
    : 'Saved in this browser. <button type="button" class="linkish" data-acct="in">Sign in</button> to keep them on every device.';
  const drafts = draftStore.list();
  const html = drafts.length ? `<ul>${drafts.map((d) => {
        const excluded = isExcludedPage(d.name);
        const editUrl = esc(excluded ? `write?${new URLSearchParams({ 'from-draft': d.name })}` : pageUrl(d.name, 'edit'));
        const name = esc(d.name);
        const saved = new Date(d.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `<li class="w-draft-row">
          <a class="w-draft-main" href="${editUrl}"><b>${name}</b><span>${d.isNew ? 'New article' : 'Edit of an existing page'} · saved ${saved}</span></a>
          <details class="w-draft-menu" name="draft-actions">
            <summary aria-label="Actions for ${name}"><span aria-hidden="true">⋯</span></summary>
            <div class="w-draft-actions">
              <a href="${editUrl}">${excluded ? 'Copy to a new title' : 'Keep editing'}</a>
              <button type="button" data-delete-draft="${name}">Remove</button>
            </div>
          </details>
        </li>`;
      }).join('')}</ul>` : '<p class="w-none">No drafts yet.</p>';
  if (list.dataset.rendered !== html) {
    list.innerHTML = html;
    list.dataset.rendered = html;
  }
}

export function renderWrite() {
  document.body.classList.add('write-page');
  const copyFrom = params.get('from-draft');
  const copyDraft = copyFrom && draftStore.get(copyFrom);
  const section = ['#drafts', '#publications'].includes(location.hash) ? location.hash : null;
  if (!section) scrollTo({ top: 0, left: 0, behavior: 'instant' });
  setHero({ title: 'Your workspace', crumb: 'Write', actions: link('Drafts', 'file-text', '#drafts') + link('Publications', 'book-open', '#publications') + link('Sandboxes', 'flask-conical', 'library/?kind=s') });
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  body.innerHTML = `
    <section class="w-create" aria-labelledby="w-create-title">
      <h2 id="w-create-title">${copyDraft ? 'Copy a draft' : 'Create a page'}</h2>
      ${copyDraft ? '' : `<div class="w-gallery" role="group" aria-label="Page templates">${PAGE_STARTERS.map(({ id, title, icon, sections }) => `
        <button class="w-starter" type="button" data-starter="${id}" aria-pressed="false" aria-controls="w-form">
          <span class="w-starter-preview" aria-hidden="true">
            <i data-lucide="${icon}"></i>
            ${sections.length ? `<span class="w-starter-outline">${sections.map((heading) => `<span>${heading}</span>`).join('')}</span>` : ''}
          </span>
          <span class="w-starter-title">${title}</span>
        </button>`).join('')}</div>`}
    <form class="w-form" id="w-form" ${copyDraft ? '' : 'hidden'}>
      <label class="w-title">Title<input id="w-name" type="text" placeholder="e.g. Hopf invariant" autocomplete="off" aria-describedby="w-hint" required></label>
      <p class="w-hint" id="w-hint" role="status">${copyDraft ? `Choose a new title for a copy of your “${esc(copyFrom)}” draft.` : titleHint}</p>
      <div class="w-go"><button class="tbtn primary" type="submit"><i data-lucide="pen-line"></i><span>Start writing</span></button></div>
    </form>
    </section>
    <section class="w-drafts" id="drafts">
      <h2>Your drafts</h2>
      <p class="w-sync"></p>
      <p role="status" class="w-draft-status" hidden></p>
      <div id="draft-list"></div>
      <section class="w-publications" id="publications">
        <h2>Your publications</h2>
        <div id="publication-list" aria-live="polite"></div>
      </section>
    </section>`;
  icons();
  const draftSection = $('#drafts');
  renderDrafts();
  loadPublications($('#publication-list'));
  if (section) requestAnimationFrame(() => $(section)?.scrollIntoView({ block: 'start', behavior: 'instant' }));
  draftSection.addEventListener('keydown', (event) => {
    const menu = event.target.closest('.w-draft-menu[open]');
    if (event.key === 'Escape' && menu) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  const draftStatus = $('.w-draft-status', draftSection);
  draftSection.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-draft]');
    if (!button) return;
    const name = button.dataset.deleteDraft;
    const where = draftsSynced() ? 'from this browser and your account' : 'from this browser';
    if (!confirm(`Permanently delete the “${name}” draft ${where}?`)) return;
    button.disabled = true;
    draftStatus.hidden = false;
    draftStatus.textContent = 'Deleting draft…';
    try {
      await draftStore.remove(name);
      renderDrafts();
      draftStatus.textContent = 'Draft deleted.';
    } catch (error) {
      draftStatus.textContent = error.message || 'Could not delete this draft.';
      button.disabled = false;
    }
  });
  const input = $('#w-name');
  const hint = $('#w-hint');
  const form = $('#w-form');
  const starters = [...body.querySelectorAll('[data-starter]')];
  let selectedStarter = '';
  for (const tile of starters) {
    tile.addEventListener('click', () => {
      selectedStarter = tile.dataset.starter;
      for (const option of starters) option.setAttribute('aria-pressed', String(option === tile));
      form.hidden = false;
      input.focus();
    });
  }
  const showTitleMatch = (hit) => {
    hint.innerHTML = hit ? titleConflict(hit.name) : copyDraft ? 'Choose an unused title for your draft copy.' : titleHint;
    hint.classList.toggle('w-conflict', !!hit);
    if (hit) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };
  if (copyDraft && !section) input.focus();
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    showTitleMatch(null);
    t = setTimeout(async () => {
      const q = input.value.trim();
      if (isExcludedPage(q)) {
        showUnavailableTitle();
        return;
      }
      const hit = q && await findExistingTitle(q);
      if (input.value.trim() === q) showTitleMatch(hit);
    }, 200);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    const q = input.value.trim();
    if (!q) return;
    if (isExcludedPage(q)) {
      showUnavailableTitle();
      input.focus();
      return;
    }
    const stop = busy(submit);
    const starter = starterSource(selectedStarter);
    try {
      const hit = await findExistingTitle(q);
      if (input.value.trim() !== q) return;
      if (hit) {
        showTitleMatch(hit);
        input.focus();
        return;
      }
      const { openWorkspace } = await import('../editor/editor.js');
      if (input.value.trim() !== q) return;
      const existing = draftStore.list().find((d) => d.name.toLowerCase() === q.toLowerCase());
      if (existing) {
        hint.innerHTML = `You already have a draft with this title. <a href="${esc(pageUrl(existing.name, 'edit'))}">Keep editing that draft</a> or choose another title.`;
        hint.classList.add('w-conflict');
        input.focus();
        return;
      }
      const source = copyDraft?.source ?? starter;
      if (!draftStore.set(q, { source, savedAt: Date.now(), isNew: true })) {
        throw new Error('Could not save the draft in this browser.');
      }
      openCreatedDraft(openWorkspace, q, source);
    } catch (error) {
      hint.textContent = error.message || 'Could not open the editor.';
      hint.classList.add('w-conflict');
    } finally {
      stop();
    }
  });
  function showUnavailableTitle() {
    hint.textContent = 'This title is unavailable. Choose a different title.';
    hint.classList.add('w-conflict');
    input.setAttribute('aria-invalid', 'true');
  }
}

function openCreatedDraft(openWorkspace, name, source) {
  const publishedUrl = new URL(pageUrl(name), document.baseURI);
  const draftUrl = new URL(pageUrl(name, 'new='), document.baseURI);
  const draftsUrl = new URL('write#drafts', document.baseURI);
  const workspace = openWorkspace({
    name, original: '', start: source, isNew: true,
    onExit: (how) => {
      removeEventListener('popstate', onBack);
      location.replace(how ? publishedUrl : draftsUrl);
    },
  });
  function onBack() {
    if (location.pathname !== draftUrl.pathname) workspace.close();
  }
  history.pushState(null, '', draftUrl);
  document.title = `${name} — nLab editor`;
  addEventListener('popstate', onBack);
}

const publicationRequests = new Map();

function fetchPublications(userId, cacheKey) {
  if (!publicationRequests.has(userId)) {
    const request = myPublications().then((pages) => {
      const visible = pages.filter((page) => !isExcludedPage(page.name));
      if (currentUser()?.id === userId) {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(visible)); } catch { /* storage unavailable */ }
      }
      return visible;
    }).finally(() => publicationRequests.delete(userId));
    publicationRequests.set(userId, request);
  }
  return publicationRequests.get(userId);
}

function renderPublications(list, pages) {
  const html = pages.length ? `<ul>${pages.map((page) => `<li class="w-draft-row">
    <a class="w-draft-main" href="${esc(pageUrl(page.name))}"><b>${esc(page.name)}</b><span>Updated ${new Date(page.updated_at).toLocaleDateString()}</span></a>
    <a class="tbtn" href="${esc(pageUrl(page.name, 'edit'))}">Edit</a>
  </li>`).join('')}</ul>` : '<p class="w-none">No published pages yet.</p>';
  if (list.dataset.rendered !== html) {
    list.innerHTML = html;
    list.dataset.rendered = html;
  }
}

async function loadPublications(list) {
  if (!list) return;
  const user = currentUser();
  if (!dbEnabled || !user) {
    delete list.dataset.rendered;
    list.textContent = dbEnabled ? 'Sign in to see the pages you published.' : 'Publications require a connected database.';
    return;
  }
  const key = `nlab-publications:${user.id}`;
  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(key)); } catch { /* storage unavailable */ }
  if (Array.isArray(cached)) renderPublications(list, cached);
  else {
    delete list.dataset.rendered;
    list.textContent = 'Loading publications…';
  }
  try {
    const pages = await fetchPublications(user.id, key);
    if (!list.isConnected || currentUser()?.id !== user.id) return;
    renderPublications(list, pages);
  } catch {
    if (!Array.isArray(cached) && list.isConnected && currentUser()?.id === user.id) list.textContent = 'Could not load your publications.';
  }
}
addEventListener('account-change', () => {
  renderDrafts();
  loadPublications($('#publication-list'));
});
addEventListener('drafts-synced', renderDrafts);
