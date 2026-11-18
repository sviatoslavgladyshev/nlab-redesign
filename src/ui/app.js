// nLab redesign — shared behaviour (icons, reveal, nav, search, hero diagram)
import '../styles/base.css';
import '../styles/theme.css';
import { attachSuggest } from './suggest.js';
import { dbEnabled, subscribe } from '../core/db.js';
import './account.js';
import {
  createIcons, Search, ArrowRight, ArrowUpRight, Sigma, Atom, Lightbulb, BookOpen, BookMarked, PenLine, Quote,
  MessagesSquare, Sparkles, Shuffle, History, Server, Palette, Radio, Calendar, FileText, Presentation,
  ExternalLink, Microscope, Users, Newspaper, Orbit, Network, CodeXml, Library, ScrollText, ChevronRight,
  ChevronLeft, Globe, Telescope, Infinity as InfinityIcon,
  Pencil, Bold, Italic, Link, Heading2, List, ListOrdered, Radical, SquareFunction, Save, X, Eye, GitCompare,
  Upload, Copy, Check, Code, Info, RotateCcw, FileCode,
  LogIn, Inbox, Hash, Plus, Send, ArrowLeft, MessageSquarePlus, Undo2, Redo2, Type, ChevronDown, PanelRight, Keyboard,
  CircleHelp, Trash2, ListTree, Omega, TextQuote, Clock, Dices, FilePlus2, CircleCheck, CloudUpload,
  Play, Moon, Sun, BookText, Menu, User, Split, FlaskConical, Tag, SlidersHorizontal, Filter, MailCheck,
} from 'lucide';

const ICONS = {
  Search, ArrowRight, ArrowUpRight, Sigma, Atom, Lightbulb, BookOpen, BookMarked, PenLine, Quote, MessagesSquare,
  Sparkles, Shuffle, History, Server, Palette, Radio, Calendar, FileText, Presentation, ExternalLink, Microscope,
  Users, Newspaper, Orbit, Network, CodeXml, Library, ScrollText, ChevronRight, ChevronLeft, Globe, Telescope,
  Infinity: InfinityIcon,
  Pencil, Bold, Italic, Link, Heading2, List, ListOrdered, Radical, SquareFunction, Save, X, Eye, GitCompare,
  Upload, Copy, Check, Code, Info, RotateCcw, FileCode,
  LogIn, Inbox, Hash, Plus, Send, ArrowLeft, MessageSquarePlus, Undo2, Redo2, Type, ChevronDown, PanelRight, Keyboard,
  CircleHelp, Trash2, ListTree, Omega, TextQuote, Clock, Dices, FilePlus2, CircleCheck, CloudUpload,
  Play, Moon, Sun, BookText, Menu, User, Split, FlaskConical, Tag, SlidersHorizontal, Filter, MailCheck,
};
// Re-run after inserting markup that contains <i data-lucide="…">
export const icons = () => createIcons({ icons: ICONS });
icons();

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Reveal on scroll ---------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
$$('.reveal').forEach((el) => io.observe(el));

/* ---------- Nav state + reading progress ---------- */
const nav = document.querySelector('.nav');
const progress = document.querySelector('.progress');
let ticking = false;
const onScroll = () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    nav?.classList.toggle('scrolled', scrollY > 8);
  });
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- Search (any search form on the page) ---------- */
$$('form[role="search"]').forEach(attachSuggest);
$$('form[role="search"]').forEach((f) => f.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = f.querySelector('input').value.trim();
  if (q) location.href = `search?q=${encodeURIComponent(q)}`;
}));
addEventListener('keydown', (e) => {
  if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !/input|textarea/i.test(document.activeElement?.tagName)) {
    e.preventDefault();
    (document.querySelector('.big-search input') || document.querySelector('.nav-search input'))?.focus();
  }
});

/* ---------- Plates gallery arrows ---------- */
$$('[data-plates]').forEach((wrap) => {
  const track = wrap.querySelector('.plates');
  const [prev, next] = $$('.plates-nav button', wrap);
  if (!track || !prev || !next) return;
  const step = () => (track.querySelector('.plate-card')?.offsetWidth || 300) + 26;
  const update = () => {
    prev.disabled = track.scrollLeft < 8;
    next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  track.addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
});

/* ---------- Highlight a targeted talk (#GladyshevSymposium2026 etc.) ---------- */
const hiliteTarget = () => {
  $$('.talk.featured').forEach((t) => t.classList.remove('featured'));
  const t = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (t && t.classList.contains('talk')) { t.classList.add('featured'); t.classList.add('in'); }
};
addEventListener('hashchange', hiliteTarget);
hiliteTarget();

/* ---------- Hero diagram: a slowly turning graph of nLab concepts (drag to rotate) ---------- */
function conceptDiagram(canvas) {
  const ctx = canvas.getContext('2d');
  const labels = ['category', 'functor', 'adjunction', 'monad', 'topos', 'sheaf', 'stack', '∞-groupoid', '(∞,1)-category',
    'homotopy type', 'spectrum', 'cohomology', 'K-theory', 'fiber bundle', 'connection', 'gauge field', 'Lagrangian', 'TQFT',
    'cobordism', 'brane', 'anyon', 'modality', 'type theory', 'Yoneda lemma', 'Kan extension', 'operad',
    'monoidal category', 'Lie algebra', 'supergravity', 'scheme', 'groupoid', 'quantization', 'Hilbert space'];
  // Colours come from the active design (CSS variables --dg-*), refreshed on theme change
  let pal = {};
  const readPalette = () => {
    const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
    pal = { nodes: [v('--dg-1'), v('--dg-2'), v('--dg-3'), v('--dg-4')], ink: v('--dg-ink'), hi: v('--dg-hi'), bg: v('--dg-node'),
      font: v('--serif') || 'Georgia, serif', italic: document.documentElement.dataset.theme === 'folio' || !document.documentElement.dataset.theme };
  };
  readPalette();
  addEventListener('themechange', () => { readPalette(); if (!running) draw(); });
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const nodes = labels.map((label, i) => {
    // Fibonacci-sphere placement: even spread, no clumps
    const k = (i + 0.5) / labels.length, ph = Math.acos(1 - 2 * k), th = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = 0.78 + rnd() * 0.22;
    return { label, x: Math.sin(ph) * Math.cos(th) * r, y: Math.cos(ph) * r * 0.85, z: Math.sin(ph) * Math.sin(th) * r, ci: i % 4 };
  });
  const edges = [];
  nodes.forEach((a, i) => {
    nodes.map((b, j) => [j, (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2]).filter(([j]) => j !== i)
      .sort((p, q) => p[1] - q[1]).slice(0, 2)
      .forEach(([j]) => { if (!edges.some(([p, q]) => p === j && q === i)) edges.push([i, j]); });
  });
  let W = 0, H = 0, ry = 0.4, rx = -0.2, vy = reduce ? 0 : 0.0016, drag = null, hover = -1, running = false;

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  new ResizeObserver(() => { resize(); if (!running) draw(); }).observe(canvas); // canvas size settles after layout/fonts

  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ry, rx }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (drag) {
      ry = drag.ry + (e.clientX - drag.x) * 0.008;
      rx = clamp(drag.rx + (e.clientY - drag.y) * 0.006, -1.2, 1.2);
      if (!running) draw();
    }
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    hover = nodes.findIndex((n) => n.s && Math.hypot(n.sx - mx, n.sy - my) < 12);
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => { hover = -1; });

  function draw() {
    if (!drag) ry += vy;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    const f = Math.min(W, H) * 0.9, camD = 2.6;
    nodes.forEach((n) => {
      const x1 = n.x * cy - n.z * sy, z1 = n.x * sy + n.z * cy;
      const y2 = n.y * cx - z1 * sx, z2 = n.y * sx + z1 * cx;
      n.d = z2 + camD; n.s = f / n.d; n.sx = W / 2 + x1 * n.s; n.sy = H / 2 + y2 * n.s;
    });
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1.1;
    edges.forEach(([i, j]) => {
      const a = nodes[i], b = nodes[j], depth = clamp(2 / ((a.d + b.d) / 2) - 0.35);
      const lit = hover === i || hover === j;
      ctx.strokeStyle = lit ? hexA(pal.hi, 0.85) : hexA(pal.ink, 0.12 + depth * 0.25);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      const t = 0.6, px = a.sx + (b.sx - a.sx) * t, py = a.sy + (b.sy - a.sy) * t, ang = Math.atan2(b.sy - a.sy, b.sx - a.sx);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(px + Math.cos(ang) * 6, py + Math.sin(ang) * 6);
      ctx.lineTo(px + Math.cos(ang + 2.6) * 6, py + Math.sin(ang + 2.6) * 6);
      ctx.lineTo(px + Math.cos(ang - 2.6) * 6, py + Math.sin(ang - 2.6) * 6); ctx.fill();
    });
    [...nodes.keys()].sort((a, b) => nodes[b].d - nodes[a].d).forEach((k) => {
      const n = nodes[k], depth = clamp(2.2 / n.d - 0.45), r = 3 + depth * 3.5, lit = k === hover;
      ctx.globalAlpha = 0.35 + depth * 0.65;
      ctx.fillStyle = pal.bg; ctx.strokeStyle = pal.italic ? pal.ink : hexA(pal.ink, 0.15); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, r + 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = lit ? pal.hi : pal.nodes[n.ci]; ctx.beginPath(); ctx.arc(n.sx, n.sy, r - 0.5, 0, Math.PI * 2); ctx.fill();
      // Label only the front of the sphere (plus the hovered node) so labels don't pile up
      if (lit || n.d < camD - 0.15) {
        ctx.font = `${pal.italic ? 'italic ' : '500 '}${Math.round(12 + depth * 6)}px ${pal.font}`;
        ctx.fillStyle = lit ? pal.hi : pal.ink;
        ctx.fillText(n.label, n.sx + r + 6, n.sy + 4);
      }
      ctx.globalAlpha = 1;
    });
    canvas.style.cursor = hover >= 0 ? 'pointer' : '';
    if (running && !reduce) requestAnimationFrame(draw);
  }
  canvas.addEventListener('click', () => {
    if (hover < 0) return;
    const page = nodes[hover].label.replace(/∞/g, 'infinity'); // nLab spells ∞ as "infinity" in page names
    location.href = `wiki/${encodeURIComponent(page).replace(/%20/g, '+')}`;
  });
  new IntersectionObserver(([e]) => {
    const was = running; running = e.isIntersecting;
    if (running && !was) requestAnimationFrame(draw);
  }).observe(canvas);
  document.fonts?.ready.then(() => { if (!running) draw(); });
  draw();
}
const diagram = document.querySelector('canvas.kgraph');
if (diagram) conceptDiagram(diagram);

/* ---------- Sign up for updates ----------
   Saved to the site's database (the subscribers table; export it from the Supabase dashboard), or posted
   to VITE_UPDATES_ENDPOINT (a Buttondown / Mailchimp / Formspree form URL) if that is set instead.
   With neither, the sign-up is kept in this browser so the flow can be tried. */
const UPDATES_ENDPOINT = import.meta.env.VITE_UPDATES_ENDPOINT || '';
$$('form.signup').forEach((f) => {
  const email = f.querySelector('input[type="email"]');
  const note = f.querySelector('.signup-note');
  if (!UPDATES_ENDPOINT && !dbEnabled) note.textContent = 'Prototype: sign-ups are kept in this browser until a mailing list is connected.';
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!email.checkValidity() || !email.value.trim()) {
      email.closest('.signup-row').animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], 240);
      email.focus();
      note.textContent = 'Please enter a valid email address.';
      return;
    }
    const topics = [...f.querySelectorAll('input[name="topic"]:checked')].map((i) => i.value);
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      if (dbEnabled) await subscribe(email.value.trim(), topics);
      else if (UPDATES_ENDPOINT) {
        const res = await fetch(UPDATES_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email: email.value.trim(), topics }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        localStorage.setItem('nlab-updates', JSON.stringify({ email: email.value.trim(), topics, at: Date.now() }));
      }
      f.classList.add('done');
      f.querySelector('.signup-ok span').textContent = `Thanks — updates will go to ${email.value.trim()}.`;
    } catch {
      note.textContent = 'Sorry, that didn’t work. Please try again in a moment.';
      btn.disabled = false;
    }
  });
});

/* Top bar: mark the current section */
{
  const base = new URL(document.baseURI).pathname;
  const here = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname;
  $$('.nav-links a').forEach((a) => {
    const href = a.getAttribute('href').replace(/\/$/, '');
    if (href && (here === href || here.startsWith(`${href}/`))) a.setAttribute('aria-current', 'page');
  });
}

/* In-page links (#section): with a <base> element they would otherwise resolve against the site root */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
  const id = decodeURIComponent(a.getAttribute('href').slice(1));
  e.preventDefault();
  const t = id ? document.getElementById(id) : null;
  if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); else if (!id) scrollTo({ top: 0, behavior: 'smooth' });
  history.pushState(null, '', `${location.pathname}${location.search}${id ? `#${encodeURIComponent(id)}` : ''}`);
  dispatchEvent(new HashChangeEvent('hashchange'));
});

/* Light / dark mode (the initial mode is set before paint by a tiny script in each page's <head>) */
{
  const sync = () => {
    const dark = document.documentElement.dataset.mode === 'dark';
    document.querySelectorAll('.nav-mode').forEach((b) => {
      b.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`;
      b.setAttribute('aria-pressed', String(dark));
    });
    icons();
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-mode')) return;
    const next = document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark';
    const apply = () => { document.documentElement.dataset.mode = next; sync(); dispatchEvent(new CustomEvent('modechange', { detail: next })); };
    try { localStorage.setItem('nlab-mode', next); } catch { /* private mode */ }
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(apply); else apply();
  });
  sync();
}

/* ---------- Phones and small tablets: a menu button opens a panel with everything in the top bar ---------- */
{
  const wrap = document.querySelector('.nav .wrap');
  if (wrap) {
    const burger = document.createElement('button');
    burger.type = 'button';
    burger.className = 'nav-burger';
    burger.setAttribute('aria-label', 'Menu');
    burger.setAttribute('aria-expanded', 'false');
    burger.innerHTML = '<i data-lucide="menu"></i>';
    wrap.append(burger);
    const sheet = document.createElement('div');
    sheet.className = 'nav-sheet';
    sheet.hidden = true;
    const links = [...document.querySelectorAll('.nav-links a')].map((a) => a.outerHTML).join('');
    sheet.innerHTML = `<div class="ns-panel" role="dialog" aria-label="Menu">
        <div class="ns-head"><span>Menu</span><button type="button" class="ns-close" aria-label="Close menu"><i data-lucide="x"></i></button></div>
        <form class="ns-search" role="search"><i data-lucide="search"></i><input type="search" placeholder="Search 20,000 pages" aria-label="Search the nLab"></form>
        <nav class="ns-links">${links}</nav>
        <div class="ns-actions">
          <a class="tbtn primary" href="write"><i data-lucide="pen-line"></i><span>Write an article</span></a>
          <button type="button" class="tbtn" data-acct="in"><i data-lucide="log-in"></i><span>Sign in</span></button>
          <button type="button" class="tbtn" data-acct="up"><i data-lucide="users"></i><span>Create account</span></button>
          <button type="button" class="tbtn nav-mode-text"><i data-lucide="moon"></i><span>Light / dark</span></button>
        </div>
      </div>`;
    document.body.append(sheet);
    const form = sheet.querySelector('form');
    attachSuggest(form);
    form.addEventListener('submit', (e) => { e.preventDefault(); const q = form.querySelector('input').value.trim(); if (q) location.href = `search?q=${encodeURIComponent(q)}`; });
    const open = (on) => {
      sheet.hidden = !on;
      burger.setAttribute('aria-expanded', String(on));
      document.body.classList.toggle('sheet-open', on);
      if (on) setTimeout(() => sheet.classList.add('in')); else sheet.classList.remove('in');
    };
    burger.addEventListener('click', () => open(true));
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet || e.target.closest('.ns-close') || e.target.closest('a, [data-acct]')) open(false);
      if (e.target.closest('.nav-mode-text')) document.querySelector('.nav-mode')?.click();
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) open(false); });
    icons();
  }
}

/* Styles are in place: show the page (see the inline style in each page's <head>) */
document.documentElement.classList.add('ready');
