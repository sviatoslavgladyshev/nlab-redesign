// Home hero: a slowly turning 3D constellation of the nLab's most-linked concepts.
// Nodes are coloured by field, joined to their nearest neighbours, react to the pointer and
// open their page on click. Scrolling zooms the constellation in while the hero text lifts away.
import { pageUrl, displayTitle } from './nlab.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function heroField(hero) {
  const canvas = document.createElement('canvas');
  canvas.className = 'home-field';
  canvas.setAttribute('aria-hidden', 'true');
  hero.prepend(canvas);
  const ctx = canvas.getContext('2d');

  // The real knowledge graph: the most-linked concepts and the actual [[links]] between their pages
  let g;
  try { g = await (await fetch('snapshot/graph.json')).json(); } catch { return; }
  const maxIn = Math.max(...g.nodes.map((n) => n[1]));
  const nodes = g.nodes.map(([name, inb, f], i) => {
    const k = (i + 0.5) / g.nodes.length, phi = Math.acos(1 - 2 * k), th = Math.PI * (1 + Math.sqrt(5)) * i;
    return { name, label: displayTitle(name), w: Math.sqrt(inb / maxIn), f, x: Math.sin(phi) * Math.cos(th), y: Math.cos(phi), z: Math.sin(phi) * Math.sin(th), vx: 0, vy: 0, vz: 0 };
  });
  const edges = g.edges;
  const nbrs = nodes.map(() => new Set());
  edges.forEach(([a, b]) => { nbrs[a].add(b); nbrs[b].add(a); });
  // force layout in 3D: linked pages attract, all pages repel; heavily linked hubs drift to the centre
  for (let it = 0; it < 260; it++) {
    const cool = 1 - it / 260;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        const d2 = dx * dx + dy * dy + dz * dz + 0.01, f = 0.012 / d2;
        a.vx += dx * f; a.vy += dy * f; a.vz += dz * f; b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
      }
    }
    for (const [i, j] of edges) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, f = 0.004;
      a.vx += dx * f; a.vy += dy * f; a.vz += dz * f; b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
    }
    for (const n of nodes) {
      n.vx -= n.x * 0.01; n.vy -= n.y * 0.01; n.vz -= n.z * 0.01;
      n.x += n.vx * cool; n.y += n.vy * cool; n.z += n.vz * cool; n.vx *= 0.6; n.vy *= 0.6; n.vz *= 0.6;
    }
  }
  // spread evenly: keep each node's direction from the centre, but give it a radius by rank
  // (hubs stay nearer the middle), so the constellation fills the hero instead of clumping
  const byDist = nodes.map((n, i) => [Math.hypot(n.x, n.y, n.z), i]).sort((p, q) => p[0] - q[0]);
  byDist.forEach(([d], k) => {
    const n = nodes[byDist[k][1]], r = 0.42 + 0.58 * Math.cbrt((k + 1) / nodes.length);
    const s = d > 1e-6 ? r / d : 0;
    n.x *= s; n.y *= s; n.z *= s;
  });
  nodes.forEach((n) => { n.x *= 1.5; n.y *= 0.9; });

  let W = 0, H = 0, rot = 0.3, tilt = -0.15, hover = -1, running = true, zoom = 1, intro = reduce ? 1 : 0;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0, px: -1, py: -1 };
  let pal;
  const readPalette = () => {
    const dark = document.documentElement.dataset.mode === 'dark';
    pal = {
      dark,
      field: dark ? ['#8ab4f8', '#81c995', '#f28b82', '#fdd663', '#c58af9', '#78d9ec'] : ['#1d4f91', '#2a7a3b', '#a8253b', '#b7791f', '#6b3fa0', '#1f7a8c'],
      ink: dark ? '232,234,237' : '27,29,33',
      halo: dark ? '15,18,24' : '255,255,255',
    };
  };
  readPalette();
  addEventListener('modechange', readPalette);
  const colorOf = (n) => (n.f < 0 ? pal.field[5] : pal.field[n.f % 5]);

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  new ResizeObserver(resize).observe(hero);
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    ptr.px = e.clientX - r.left; ptr.py = e.clientY - r.top;
    ptr.tx = (ptr.px / W - 0.5) * 2; ptr.ty = (ptr.py / H - 0.5) * 2;
  });
  hero.addEventListener('pointerleave', () => { ptr.tx = 0; ptr.ty = 0; ptr.px = -1; hover = -1; });
  canvas.addEventListener('click', () => { if (hover >= 0) location.href = pageUrl(nodes[hover].name); });

  // keep labels away from the centred text block
  const textBox = () => {
    const r = hero.querySelector('.hero-center')?.getBoundingClientRect(), h = hero.getBoundingClientRect();
    return r ? { l: r.left - h.left - 20, r: r.right - h.left + 20, t: r.top - h.top - 10, b: r.bottom - h.top + 10 } : null;
  };

  function frame() {
    if (!running) return;
    if (!reduce) rot += 0.0011 + (1 - intro) * 0.02; // spins in, then settles
    intro = Math.min(1, intro + 0.012);
    const ease = 1 - (1 - intro) ** 3;
    ptr.x += (ptr.tx - ptr.x) * 0.04; ptr.y += (ptr.ty - ptr.y) * 0.04;
    const ry = rot + ptr.x * 0.35, rx = tilt + ptr.y * 0.22;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    const f = Math.min(W * 0.68, H * 1.12) * zoom * (0.55 + 0.45 * ease), camD = 2.4;
    for (const n of nodes) {
      const x1 = n.x * cy - n.z * sy, z1 = n.x * sy + n.z * cy;
      const y2 = n.y * cx - z1 * sx, z2 = n.y * sx + z1 * cx;
      n.d = z2 + camD; n.s = f / n.d; n.sx = W / 2 + x1 * n.s; n.sy = H / 2 + y2 * n.s;
      n.depth = Math.max(0, Math.min(1, (camD + 1.1 - n.d) / 2.2));
    }
    ctx.clearRect(0, 0, W, H);
    const box = textBox();
    const navH = document.body.classList.contains('home') ? (document.querySelector('.nav')?.offsetHeight || 64) : 0;
    const inBox = (x, y) => box && x > box.l && x < box.r && y > box.t && y < box.b;

    // links
    ctx.lineWidth = 1;
    for (const [i, j] of edges) {
      const a = nodes[i], b = nodes[j], d = (a.depth + b.depth) / 2;
      const lit = hover === i || hover === j;
      if (!lit && hover >= 0) continue; // focus on the hovered page's real links
      const fade = (inBox((a.sx + b.sx) / 2, (a.sy + b.sy) / 2) ? 0.2 : 1) * ease;
      ctx.strokeStyle = lit ? colorOf(nodes[hover]) : `rgba(${pal.ink}, ${(0.02 + d * 0.07) * fade})`;
      ctx.lineWidth = lit ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    // nodes, back to front
    const order = [...nodes.keys()].sort((a, b) => nodes[b].d - nodes[a].d);
    hover = -1;
    if (ptr.px >= 0) {
      let best = 18;
      for (const k of order) { const n = nodes[k], dd = Math.hypot(n.sx - ptr.px, n.sy - ptr.py); if (dd < best && n.depth > 0.35) { best = dd; hover = k; } }
    }
    const placed = [];
    for (const k of order.slice().reverse()) nodes[k].front = true; // labels: nearest first
    const labelOk = (x, y, w, h) => !placed.some((q) => x < q.x + q.w && x + w > q.x && y < q.y + q.h && y + h > q.y);
    const labelFor = new Map();
    [...order].reverse().forEach((k) => {
      const n = nodes[k];
      const near = hover >= 0 && nbrs[hover].has(k);
      if (hover >= 0 && !near && k !== hover) return;
      if (!(n.depth > 0.6 || k === hover || near) || (inBox(n.sx, n.sy) && k !== hover) || n.sy < navH + 18) return;
      const size = Math.round(11 + n.depth * 5 + (k === hover ? 2 : 0));
      ctx.font = `${k === hover ? 600 : 500} ${size}px 'Inter Variable', sans-serif`;
      const w = ctx.measureText(n.label).width, r = (2.2 + n.w * 5) * (0.55 + n.depth * 0.75);
      const rect = { x: n.sx + r + 6, y: n.sy - size + 4, w, h: size + 2 };
      if (k === hover || labelOk(rect.x - 4, rect.y - 3, rect.w + 8, rect.h + 6)) { placed.push(rect); labelFor.set(k, size); }
    });
    for (const k of order) {
      const n = nodes[k], c = colorOf(n), r = (2.2 + n.w * 5) * (0.55 + n.depth * 0.75), lit = k === hover;
      ctx.globalAlpha = (0.22 + n.depth * 0.5) * (inBox(n.sx, n.sy) && !lit ? 0.3 : 1) * ease * (lit ? 1.4 : 1);
      if (n.depth > 0.4 || lit) {
        const g = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, r * 4);
        g.addColorStop(0, `${c}38`); g.addColorStop(1, `${c}00`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(n.sx, n.sy, lit ? r + 2.5 : r, 0, Math.PI * 2); ctx.fill();
      if (labelFor.has(k)) {
        const size = labelFor.get(k);
        ctx.font = `${lit ? 600 : 500} ${size}px 'Inter Variable', sans-serif`;
        ctx.globalAlpha = 1;
        ctx.fillStyle = lit ? c : `rgba(${pal.ink}, ${(0.3 + n.depth * 0.32) * ease})`;
        ctx.fillText(n.label, n.sx + r + 6, n.sy + 4);
      }
      ctx.globalAlpha = 1;
    }
    canvas.style.cursor = hover >= 0 ? 'pointer' : '';
    if (!reduce) requestAnimationFrame(frame);
  }
  new IntersectionObserver(([e]) => { const was = running; running = e.isIntersecting; if (running && !was) requestAnimationFrame(frame); }).observe(hero);
  requestAnimationFrame(frame);

  // scroll: zoom into the constellation, lift the text
  const content = hero.querySelector('.hero-center');
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const p = Math.min(1, scrollY / Math.max(1, H));
      zoom = 1 + p * 0.55;
      if (!reduce && content) { content.style.transform = `translate3d(0, ${p * -60}px, 0)`; content.style.opacity = String(1 - p * 1.3); }
      if (reduce) frame();
    });
  }, { passive: true });
}
