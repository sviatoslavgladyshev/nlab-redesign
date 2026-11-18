// All pages, A to Z, with a random-page button.
import { esc, pageUrl, loadIndex } from '../../core/nlab.js';
import { $, $$, setHero, btn } from './shell.js';

let allNames = [];
export async function renderAll() {
  const { pages } = await loadIndex();
  const names = pages.map((p) => p[1]).filter((n) => n !== 'HomePage' && !n.includes(' > ')).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const key = (n) => { const c = n[0].toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
  const letters = [...new Set(names.map(key))];
  setHero({ title: 'All pages', crumb: 'All pages', meta: `${names.length.toLocaleString()} pages, A to Z`, actions: btn('Random page', 'shuffle', 'data-act="random-all"') });
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  const show = (L) => {
    const list = names.filter((n) => key(n) === L);
    $$('.az button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === L)));
    $('#az-list').innerHTML = list.map((n) => `<a href="${esc(pageUrl(n))}">${esc(n)}</a>`).join('');
    $('#az-count').textContent = `${list.length.toLocaleString()} pages under “${L}”`;
  };
  body.innerHTML = `<nav class="az">${letters.map((L) => `<button type="button" data-l="${L}">${L}</button>`).join('')}</nav><p class="s-more" id="az-count"></p><div class="az-list" id="az-list"></div>`;
  body.querySelector('.az').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.l); });
  show(letters.includes('A') ? 'A' : letters[0]);
  allNames = names;
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="random-all"]') && allNames.length) location.href = pageUrl(allNames[Math.floor(Math.random() * allNames.length)]);
});
