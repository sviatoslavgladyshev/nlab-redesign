// nLab redesign — shared behaviour (icons, reveal, nav, search, hero diagram)
import './style.css';
import {
  createIcons, Search, ArrowRight, ArrowUpRight, Sigma, Atom, Lightbulb, BookOpen, BookMarked, PenLine, Quote,
  MessagesSquare, Sparkles, Shuffle, History, Server, Palette, Radio, Calendar, FileText, Presentation,
  ExternalLink, Microscope, Users, Newspaper, Orbit, Network, CodeXml, Library, ScrollText, ChevronRight,
  ChevronLeft, Globe, Telescope, Infinity as InfinityIcon,
} from 'lucide';

createIcons({
  icons: {
    Search, ArrowRight, ArrowUpRight, Sigma, Atom, Lightbulb, BookOpen, BookMarked, PenLine, Quote, MessagesSquare,
    Sparkles, Shuffle, History, Server, Palette, Radio, Calendar, FileText, Presentation, ExternalLink, Microscope,
    Users, Newspaper, Orbit, Network, CodeXml, Library, ScrollText, ChevronRight, ChevronLeft, Globe, Telescope,
    Infinity: InfinityIcon,
  },
});

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
$$('form[role="search"]').forEach((f) => f.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = f.querySelector('input').value.trim();
  if (q) location.href = `page.html?search=${encodeURIComponent(q)}`;
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
  const colors = ['#193c78', '#226622', '#a41e32', '#1c1b1f'];
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const nodes = labels.map((label, i) => {
    // Fibonacci-sphere placement: even spread, no clumps
    const k = (i + 0.5) / labels.length, ph = Math.acos(1 - 2 * k), th = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = 0.78 + rnd() * 0.22;
    return { label, x: Math.sin(ph) * Math.cos(th) * r, y: Math.cos(ph) * r * 0.85, z: Math.sin(ph) * Math.sin(th) * r, c: colors[i % colors.length] };
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
      ctx.strokeStyle = lit ? 'rgba(164,30,50,.85)' : `rgba(28,27,31,${0.12 + depth * 0.25})`;
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
      ctx.fillStyle = '#fffdf8'; ctx.strokeStyle = '#1c1b1f'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, r + 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = lit ? '#a41e32' : n.c; ctx.beginPath(); ctx.arc(n.sx, n.sy, r - 0.5, 0, Math.PI * 2); ctx.fill();
      // Label only the front of the sphere (plus the hovered node) so labels don't pile up
      if (lit || n.d < camD - 0.15) {
        ctx.font = `italic ${Math.round(12 + depth * 6)}px 'Source Serif 4 Variable', Georgia, serif`;
        ctx.fillStyle = lit ? '#a41e32' : '#1c1b1f';
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
    location.href = `page.html?p=${encodeURIComponent(page).replace(/%20/g, '+')}`;
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
