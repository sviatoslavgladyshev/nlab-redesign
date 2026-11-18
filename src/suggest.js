// Instant page-name suggestions for every search box, from the list of all nLab pages
// (snapshot/pages.json, written by scripts/snapshot.mjs). Arrow keys + Enter, Esc to close.
import { pageUrl, esc } from './nlab.js';

let names, loaded = [];
export const loadNames = () => (names ??= fetch('snapshot/pages.json')
  .then((r) => (r.ok ? r.json() : []))
  .catch(() => [])
  .then((list) => { loaded = list; return list; }));
export const pageExists = (q) => loaded.find((n) => n.toLowerCase() === q.trim().toLowerCase());

export async function randomPage() {
  const list = await loadNames();
  return list.length ? list[Math.floor(Math.random() * list.length)] : 'category theory';
}

function rank(list, q) {
  const ql = q.toLowerCase();
  const hits = [];
  for (const n of list) {
    const l = n.toLowerCase();
    const i = l.indexOf(ql);
    if (i < 0) continue;
    const score = (l === ql ? 0 : i === 0 ? 1 : /[\s(-]/.test(l[i - 1]) ? 2 : 3) * 1000 + n.length;
    hits.push([score, n]);
  }
  return hits.sort((a, b) => a[0] - b[0]).slice(0, 7).map((h) => h[1]);
}

const mark = (name, q) => {
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(name) : `${esc(name.slice(0, i))}<b>${esc(name.slice(i, i + q.length))}</b>${esc(name.slice(i + q.length))}`;
};

let uid = 0;
export function attachSuggest(form, { edit = false } = {}) {
  const input = form.querySelector('input');
  if (!input) return;
  const box = document.createElement('div');
  box.className = 'suggest';
  box.id = `suggest-${++uid}`;
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  form.append(box);
  form.classList.add('has-suggest');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', box.id);
  input.setAttribute('aria-expanded', 'false');

  let items = [], active = -1;
  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const setActive = (i) => {
    active = i;
    [...box.children].forEach((el, k) => el.setAttribute('aria-selected', String(k === i)));
  };
  const go = (i) => { const it = items[i]; if (it) location.href = it.href; };

  const update = async () => {
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    const list = rank(await loadNames(), q);
    if (input.value.trim() !== q) return; // typed on meanwhile
    items = [
      ...list.map((n) => ({ href: pageUrl(n) + (edit ? '&edit' : ''), html: `<span class="sg-ic">§</span><span>${mark(n, q)}</span>` })),
      ...(edit ? [] : [{ href: `page.html?search=${encodeURIComponent(q)}`, html: `<span class="sg-ic">⌕</span><span>Search all pages for “${esc(q)}”</span>` }]),
      ...(pageExists(q) ? [] : [{ href: `${pageUrl(q)}&new`, html: `<span class="sg-ic">+</span><span>Create a new page “${esc(q)}”</span>`, cls: 'sg-new' }]),
    ];
    box.innerHTML = items.map((it, i) => `<a role="option" id="${box.id}-${i}" href="${esc(it.href)}" aria-selected="false"${it.cls ? ` class="${it.cls}"` : ''}>${it.html}</a>`).join('');
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
  };

  input.addEventListener('focus', () => { loadNames(); if (input.value.trim().length > 1) update(); });
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + items.length) % items.length); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); go(active); }
    else if (e.key === 'Escape') close();
  });
  // Enter with no selection: open an exact match directly, otherwise search
  form.addEventListener('submit', (e) => {
    const exact = pageExists(input.value);
    if (exact) { e.stopImmediatePropagation(); e.preventDefault(); location.href = pageUrl(exact) + (edit ? '&edit' : ''); }
  }, { capture: true });
  box.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus while clicking
  input.addEventListener('blur', () => setTimeout(close, 120));
}
