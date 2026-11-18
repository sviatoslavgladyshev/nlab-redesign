import { currentUser, dbEnabled, deleteReviewedSuggestion, embedPage, reviewSuggestion, suggestionsInbox } from '../../core/db.js';
import { esc, forgetPage, pageUrl } from '../../core/nlab.js';
import { $, setHero } from './shell.js';

export function showSuggestions() {
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  setHero({ title: 'Suggestions', meta: 'Review proposed edits to pages you authored.' });
  body.innerHTML = `
    <p role="status" id="review-status"></p>
    <div id="review-list"></div>`;
  const status = $('#review-status');
  const list = $('#review-list');
  let generation = 0;

  async function load(message = '') {
    const request = ++generation;
    list.replaceChildren();
    if (!dbEnabled) {
      status.textContent = 'Suggestion tracking requires a connected database.';
      return;
    }
    if (!currentUser()) {
      status.innerHTML = '<button type="button" class="linkish" data-acct="in">Sign in</button> to review suggestions.';
      return;
    }
    status.textContent = message || 'Loading suggestions…';
    try {
      const rows = await suggestionsInbox();
      if (request !== generation) return;
      status.textContent = message || (rows.length ? '' : 'No suggestions for your pages yet.');
      for (const row of rows) {
        const open = row.status === 'open';
        const label = { open: 'Pending', accepted: 'Accepted', declined: 'Rejected' }[row.status];
        const card = document.createElement('article');
        card.className = 'review-card';
        card.innerHTML = `
          <div class="review-heading"><a href="${esc(pageUrl(row.name))}">${esc(row.name)}</a><span>${label}</span></div>
          <p>From ${esc(row.author_name || 'a contributor')} · ${new Date(row.created_at).toLocaleDateString()}${row.reviewed_at ? ` · reviewed ${new Date(row.reviewed_at).toLocaleDateString()}` : ''}</p>
          ${row.note ? `<p>${esc(row.note)}</p>` : ''}
          <details><summary>View proposed edit</summary>
            <div class="review-sources">
              ${open ? `<div><strong>Current source</strong><pre>${esc(row.current_source ?? '')}</pre></div>` : ''}
              <div><strong>Proposed source</strong><pre>${esc(row.source)}</pre></div>
            </div>
            ${open ? `<div class="review-actions">
              <button type="button" class="tbtn primary" data-review="accept" ${row.stale ? 'disabled' : ''}>Accept and publish</button>
              <button type="button" class="tbtn" data-review="reject">Reject</button>
            </div>` : '<button type="button" class="tbtn danger" data-review="delete">Delete suggestion</button>'}
            ${open && row.stale ? '<p>The published page changed after this suggestion. Ask for an updated suggestion before accepting.</p>' : ''}
            <p role="status" class="review-feedback"></p>
          </details>`;
        list.append(card);
        const buttons = [...card.querySelectorAll('[data-review]')];
        for (const button of buttons) {
          button.addEventListener('click', async () => {
            const accept = button.dataset.review === 'accept';
            const remove = button.dataset.review === 'delete';
            if (remove && !confirm('Permanently delete this suggestion from the review history? The published page will stay as it is.')) return;
            for (const action of buttons) action.disabled = true;
            try {
              let summary = '', links = [];
              if (accept) {
                const { pageSummary, pageLinks } = await import('../editor/editor.js');
                summary = pageSummary(row.source);
                links = pageLinks(row.source);
              }
              if (remove) await deleteReviewedSuggestion(row.id);
              else await reviewSuggestion(row.id, accept, row.current_source, summary, links);
              if (accept) {
                forgetPage(row.name);
                embedPage(row.name);
              }
              if (request === generation) await load(remove ? 'Suggestion deleted.' : accept ? 'Suggestion accepted and published.' : 'Suggestion rejected.');
            } catch (error) {
              card.querySelector('.review-feedback').textContent = error.message || 'Could not review this suggestion.';
              for (const action of buttons) action.disabled = row.stale && action.dataset.review === 'accept';
            }
          });
        }
      }
    } catch (error) {
      if (request === generation) status.textContent = error.message || 'Could not load suggestions.';
    }
  }

  addEventListener('account-change', () => load());
  load();
}
