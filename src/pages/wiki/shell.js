// Shared pieces of the wiki app: DOM helpers, the page header (title, meta, actions), buttons and toasts.
import { icons } from '../../ui/app.js';
import { esc } from '../../core/nlab.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const params = new URLSearchParams(location.search);

export function setHero({ title, crumb, meta = '', actions = '' }) {
  document.title = `${title} — nLab`;
  $('#a-title').textContent = title;
  $('#crumb-current').textContent = crumb ?? title;
  const metaLine = $('#a-meta');
  metaLine.innerHTML = meta;
  metaLine.hidden = !meta;
  $('#a-actions').innerHTML = actions;
  icons();
}
export const btn = (label, icon, attrs) => `<button type="button" class="tbtn" ${attrs}><i data-lucide="${icon}"></i><span>${esc(label)}</span></button>`;
export const link = (label, icon, href, primary = false) => `<a class="tbtn${primary ? ' primary' : ''}" href="${esc(href)}"><i data-lucide="${icon}"></i><span>${esc(label)}</span></a>`;
export const rel = (ts) => {
  const d = Date.now() / 1000 - ts;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 86400 * 7) return `${Math.round(d / 86400)} d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
export const toast = (msg) => {
  const t = Object.assign(document.createElement('div'), { className: 'toast', role: 'status', textContent: msg });
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4400);
};
