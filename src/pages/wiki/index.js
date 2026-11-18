// The wiki app: articles, search, recent changes, all pages and the Write page, all at clean URLs
// (wiki/<Name>/, search?q=…, recent, all, write). It is also the site's 404 page, so it handles every
// unknown path and old .html links.
import { icons } from '../../ui/app.js';
import './article.css';
import { esc, pageUrl } from '../../core/nlab.js';
import { isExcludedPage } from '../../core/page-visibility.js';
import { $, params, setHero, link } from './shell.js';
import { renderArticle } from './article.js';
import { renderSearch } from './search.js';
import { renderRecent } from './recent.js';
import { renderAll } from './all-pages.js';
import { renderWrite } from './write.js';

function showError(name, err) {
  setHero({ title: name || 'Something went wrong', meta: 'This page could not be loaded.' });
  $('#a-body').innerHTML = `<div class="a-empty"><p class="lead">${esc(err.message || String(err))}</p><p class="mt-s">${link('Back to the home page', 'arrow-left', './')}</p></div>`;
  icons();
}
history.scrollRestoration = 'manual';
const BASE = new URL(document.baseURI).pathname;
const path = decodeURIComponent((location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\//, '')).replace(/\+/g, ' '));
const go = (to) => location.replace(`${new URL(to, document.baseURI).href}${location.hash}`);
const legacy = path.match(/^(page|library|forum|cqts|index)\.html$/);
if (legacy) {
  const p = new URLSearchParams(location.search);
  if (legacy[1] === 'page') {
    if (p.get('p')) go(pageUrl(p.get('p'), ['edit', 'new'].filter((k) => p.has(k)).join('&')));
    else if (p.get('search')) go(`search?q=${encodeURIComponent(p.get('search'))}`);
    else go(['recent', 'all', 'write'].find((k) => p.has(k)) || './');
  } else go(legacy[1] === 'index' ? './' : `${legacy[1]}/${location.search}`);
} else {
  const article = path.match(/^wiki\/(.+?)\/?$/);
  const view = path.replace(/\/$/, '');
  if (article && !isExcludedPage(article[1])) renderArticle(article[1]).catch((e) => showError(article[1], e));
  else if (view === 'search') renderSearch(params.get('q') || '').catch((e) => showError('Search', e));
  else if (view === 'recent') renderRecent().catch((e) => showError('Recent changes', e));
  else if (view === 'all') renderAll().catch((e) => showError('All pages', e));
  else if (view === 'write') renderWrite();
  else if (view === 'suggestions') import('./suggestions.js').then(({ showSuggestions }) => showSuggestions()).catch((e) => showError('Suggestions', e));
  else if (view === 'profile' || view === 'profile/settings') import('./profile.js').then(({ showProfile }) => showProfile(view.endsWith('/settings'))).catch((e) => showError('Profile', e));
  else if (view === 'wiki' || view === '') location.replace(document.baseURI);
  else {
    setHero({ title: 'Page not found', meta: 'There is nothing at this address.' });
    $('#a-body').innerHTML = `<div class="a-empty"><p class="lead">Try the search above, or ${link('open the library', 'library', 'library/')}</p></div>`;
    icons();
  }
}
