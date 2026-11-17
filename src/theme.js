// Design switcher: four designs on one site, chosen on first visit and switchable anytime.
// The active design lives on <html data-theme>, set before paint by a tiny inline script
// in each page's <head> (reads ?theme= or localStorage).
export const THEMES = [
  { id: 'folio', name: 'Folio', tagline: 'Paper & ink — a mathematician’s notebook' },
  { id: 'lumen', name: 'Lumen', tagline: 'Light, airy and glassy' },
  { id: 'prism', name: 'Prism', tagline: 'Colourful, rounded, tonal' },
  { id: 'meniscus', name: 'Meniscus', tagline: 'Liquid glass that bends the light' },
];
const KEY = 'nlab-theme';
const current = () => document.documentElement.dataset.theme || 'folio';
const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

/* ---------- Meniscus: real liquid glass via simple-liquid-glass (<liquid-glass>) ---------- */
// Surfaces that get a refracting glass plate behind their content.
const GLASS_TARGETS = '.nav, .design-switch, .card, .plate, .definition, .proof, .big-search, .tabs-bar, .principles li, .side-tabs, .popular a';
let liquidOn = false;
let libLoaded;

function addPlate(el) {
  if (el.querySelector(':scope > .lg-plate')) return;
  const radius = Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
  const g = document.createElement('liquid-glass');
  g.className = 'lg-plate';
  g.setAttribute('aria-hidden', 'true');
  g.setAttribute('radius', String(radius));
  g.setAttribute('frost', el.matches('.nav, .design-switch, .tabs-bar, .big-search, .popular a') ? '0.06' : '0.24');
  g.setAttribute('saturation', '160');
  g.setAttribute('backdrop-selector', '.liquid-bg'); // WebGL source on Safari/Firefox/phones
  if (el.matches('.nav, .tabs-bar')) g.setAttribute('lens', 'shift');
  el.classList.add('lg-host');
  el.prepend(g);
}

async function enableLiquid() {
  if (liquidOn) return;
  liquidOn = true;
  if (!document.querySelector('.liquid-bg')) {
    const bg = document.createElement('div');
    bg.className = 'liquid-bg';
    bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = '<i></i><i></i><i></i><b>∫</b>';
    document.body.prepend(bg);
  }
  libLoaded ??= import('simple-liquid-glass/web-component');
  try { await libLoaded; } catch { return; } // CSS fallback styles still apply
  if (!liquidOn) return;
  document.querySelectorAll(GLASS_TARGETS).forEach(addPlate);
}

function disableLiquid() {
  liquidOn = false;
  document.querySelectorAll('.lg-plate').forEach((g) => g.remove());
  document.querySelectorAll('.lg-host').forEach((el) => el.classList.remove('lg-host'));
  document.querySelector('.liquid-bg')?.remove();
}

// Content that appears later (e.g. article sidebar) gets glass too
new MutationObserver(() => {
  if (liquidOn) document.querySelectorAll(GLASS_TARGETS).forEach((el) => { if (!el.querySelector(':scope > .lg-plate')) addPlate(el); });
}).observe(document.body, { childList: true, subtree: true });

const syncLiquid = () => (current() === 'meniscus' ? enableLiquid() : disableLiquid());

export function setTheme(id) {
  if (!THEMES.some((t) => t.id === id)) return;
  const apply = () => {
    document.documentElement.dataset.theme = id;
    document.querySelectorAll('.design-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === id)));
    syncLiquid();
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
syncLiquid();

/* ---------- First visit: chooser (skipped when the link already names a design) ---------- */
if (!stored() && !new URLSearchParams(location.search).get('theme')) {
  const preview = '<b>Mathematics, <i>linked.</i></b><div class="dc-ui"><span class="dc-btn">Search</span><span class="dc-chip"></span></div>';
  const dlg = document.createElement('div');
  dlg.className = 'design-chooser';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-label', 'Choose a design');
  dlg.innerHTML = `<div class="dc-panel">
      <h2>Choose a design</h2>
      <p>Four takes on the same nLab redesign. Same content and structure — pick the look.</p>
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
