// Recent changes: every edit announced in the forum.
import { icons } from '../../ui/app.js';
import { esc, pageUrl, displayTitle } from '../../core/nlab.js';
import { latestEdits } from '../../core/forum-data.js';
import { $, setHero, link } from './shell.js';

export async function renderRecent() {
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
