// Design switcher: three designs on one site, chosen on first visit and switchable anytime.
// The active design lives on <html data-theme>, set before paint by a tiny inline script
// in each page's <head> (reads ?theme= or localStorage).
export const THEMES = [
  { id: 'folio', name: 'Folio', tagline: 'Paper & ink — a mathematician’s notebook' },
  { id: 'lumen', name: 'Lumen', tagline: 'Light, airy and glassy' },
  { id: 'prism', name: 'Prism', tagline: 'Colourful, rounded, tonal' },
];
const KEY = 'nlab-theme';
const current = () => document.documentElement.dataset.theme || 'folio';
const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

export function setTheme(id) {
  if (!THEMES.some((t) => t.id === id)) return;
  const apply = () => {
    document.documentElement.dataset.theme = id;
    document.querySelectorAll('.design-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === id)));
    dispatchEvent(new CustomEvent('themechange', { detail: id }));
  };
  try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
  const url = new URL(location.href); // keep the URL shareable: ?theme=<id>
  url.searchParams.set('theme', id);
  history.replaceState(null, '', url);
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(apply);
  else apply();
}

/* ---------- Floating switcher ---------- */
const bar = document.createElement('div');
bar.className = 'design-switch';
bar.setAttribute('role', 'group');
bar.setAttribute('aria-label', 'Choose a design');
bar.innerHTML = `<span class="ds-label">Design</span>${THEMES.map((t) =>
  `<button type="button" data-theme="${t.id}" title="${t.tagline}" aria-pressed="${current() === t.id}">${t.name}</button>`).join('')}`;
bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTheme(b.dataset.theme); });
document.body.append(bar);

/* ---------- First visit: chooser (skipped when the link already names a design) ---------- */
if (!THEMES.some((t) => t.id === stored()) && !new URLSearchParams(location.search).get('theme')) {
  const preview = '<b>Mathematics, <i>linked.</i></b><div class="dc-ui"><span class="dc-btn">Search</span><span class="dc-chip"></span></div>';
  const dlg = document.createElement('div');
  dlg.className = 'design-chooser';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-label', 'Choose a design');
  dlg.innerHTML = `<div class="dc-panel">
      <h2>Choose a design</h2>
      <p>Three takes on the same nLab redesign. Same content and structure — pick the look.</p>
      <div class="dc-grid">${THEMES.map((t) => `
        <button class="dc-card" type="button" data-theme="${t.id}">
          <div class="dc-preview dc-${t.id}">${preview}</div>
          <div class="dc-meta"><strong>${t.name}</strong><span>${t.tagline}</span></div>
        </button>`).join('')}</div>
      <p class="dc-foot">You can switch at any time with the bar at the bottom of the page.</p>
    </div>`;
  const close = (id) => { setTheme(id); dlg.remove(); document.body.style.overflow = ''; };
  dlg.addEventListener('click', (e) => {
    const card = e.target.closest('.dc-card');
    if (card) close(card.dataset.theme);
    else if (e.target === dlg) close(current());
  });
  addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape' && dlg.isConnected) { close(current()); removeEventListener('keydown', esc); }
  });
  document.body.append(dlg);
  document.body.style.overflow = 'hidden';
  dlg.querySelector('.dc-card')?.focus();
}
