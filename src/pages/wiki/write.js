// The Write page: pick a title and a template, see your drafts.
import { icons } from '../../ui/app.js';
import { esc, pageUrl, resolvePage } from '../../core/nlab.js';
import { $, setHero, link } from './shell.js';
import { TEMPLATES } from './templates.js';
import { drafts as draftStore, draftsSynced } from '../../core/drafts.js';

export function renderWrite() {
  scrollTo({ top: 0, left: 0, behavior: 'auto' });
  setHero({ title: 'Write a page', crumb: 'Write', meta: 'Start a new article. New pages can be edited directly; existing nLab pages accept suggestions from readers.', actions: link('Sandboxes', 'flask-conical', 'library/?kind=s') });
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  const drafts = draftStore.list();
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
      <p class="w-sync">${draftsSynced() ? 'Saved to your account: they follow you to every device.' : 'Saved in this browser. <button type="button" class="linkish" data-acct="in">Sign in</button> to keep them on every device.'}</p>
      ${drafts.length ? `<ul>${drafts.map((d) => `<li><a href="${esc(pageUrl(d.name, 'edit'))}"><b>${esc(d.name)}</b><span>${d.isNew ? 'New article' : 'Edit of an existing page'} · saved ${new Date(d.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></a></li>`).join('')}</ul>`
        : `<p class="w-none">No drafts yet. Anything you start writing appears here, ${draftsSynced() ? 'saved to your account' : 'saved in this browser'}.</p>`}
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
// when drafts arrive from your account (sign-in on another device), show them
addEventListener('drafts-synced', () => { if (document.querySelector('#w-form') && !document.querySelector('#w-name').value) renderWrite(); });
