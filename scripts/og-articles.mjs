// Renders a link-preview image (1200×630 JPEG) for each of the most-linked articles, showing
// that page's own title, kind, field and summary. Uses the locally installed Chrome.
//
//   node scripts/og-articles.mjs [number-of-articles]     (default 1000; the rest use the generic image)
//
// Writes public/og/wiki/<slug>.jpg (skips images that already exist; pass --force to redo).
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { articleMeta, ogSlug } from './article-meta.mjs';

const LIMIT = +(process.argv.find((a) => /^\d+$/.test(a)) || 1000);
const FORCE = process.argv.includes('--force');
const ROOT = new URL('../', import.meta.url);
const OUT = new URL('public/og/wiki/', ROOT);
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);

const lib = JSON.parse(readFileSync(new URL('public/snapshot/library.json', ROOT), 'utf8'));
const names = lib.pages.filter((p) => p[1] !== 's').sort((a, b) => b[2] - a[2]).slice(0, LIMIT).map((p) => p[0]);
if (!names.includes('Center for Quantum and Topological Systems')) names.push('Center for Quantum and Topological Systems');
const todo = names.filter((n) => FORCE || !existsSync(new URL(`${ogSlug(n)}.jpg`, OUT)));
console.log(`Preview images: ${todo.length} to render (${names.length - todo.length} already there).`);
if (!todo.length) process.exit(0);

const font = (pkg, file) => `data:font/woff2;base64,${readFileSync(new URL(`node_modules/@fontsource-variable/${pkg}/files/${file}`, ROOT)).toString('base64')}`;
const FIELD_COLORS = { 'Category theory': '#1d4f91', Algebra: '#1f7a8c', 'Homotopy theory & topology': '#2a7a3b', Geometry: '#b7791f', Cohomology: '#a8253b', 'Topos theory': '#6b3fa0',
  'Logic & foundations': '#6b3fa0', 'Lie theory': '#1f7a8c', Analysis: '#1f7a8c', Physics: '#a8253b', Combinatorics: '#b7791f' };
const KIND_COLORS = { Concept: '#1d4f91', Theorem: '#2a7a3b', Person: '#b7791f', Reference: '#6b3fa0', Disambiguation: '#5f6670' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CSS = `
@font-face { font-family: Fraunces; src: url(${font('fraunces', 'fraunces-latin-full-normal.woff2')}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: Inter; src: url(${font('inter', 'inter-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: SS4; src: url(${font('source-serif-4', 'source-serif-4-latin-wght-normal.woff2')}) format('woff2'); font-weight: 200 900; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; font-family: Inter, sans-serif; }
.card { position: relative; width: 1200px; height: 630px; padding: 64px 76px 56px; display: flex; flex-direction: column; background: #fff; color: #1b1d21; }
.card::before { content: ""; position: absolute; inset: 0; background: radial-gradient(760px 420px at 104% -6%, color-mix(in srgb, var(--c) 18%, transparent), transparent 70%), radial-gradient(520px 360px at -4% 106%, color-mix(in srgb, var(--c) 9%, transparent), transparent 70%); }
.bar { position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: var(--c); }
.top { position: relative; display: flex; align-items: center; justify-content: space-between; }
.brand { display: flex; align-items: center; gap: 14px; font: 600 34px Fraunces; }
.chips { display: flex; gap: 10px; }
.chip { font: 600 19px Inter; padding: 9px 18px; border-radius: 999px; color: var(--k); background: color-mix(in srgb, var(--k) 12%, #fff); border: 1.5px solid color-mix(in srgb, var(--k) 28%, transparent); }
.mid { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: center; }
h1 { font: 600 var(--fs, 78px)/1.05 Fraunces; letter-spacing: -0.025em; max-width: 1040px; }
p { margin-top: 24px; font: 400 27px/1.45 SS4; color: #3f444b; max-width: 1020px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.foot { position: relative; display: flex; justify-content: space-between; align-items: center; font: 600 20px Inter; color: #5f6670; }
.foot b { color: var(--c); }
`;
const LOGO = '<svg width="44" height="44" viewBox="0 0 32 32"><path d="M16 3c5 6 5 14 0 26C11 17 11 9 16 3z" fill="#193c78"/><path d="M4 12c7-1 13 3 12 17C9 25 4 19 4 12z" fill="#226622"/><path d="M28 12c-7-1-13 3-12 17 7-4 12-10 12-17z" fill="#a41e32"/></svg>';
const card = (m) => {
  const field = m.fields[0];
  const c = FIELD_COLORS[field] || KIND_COLORS[m.kindLabel] || '#1d4f91';
  const fs = m.title.length > 60 ? 54 : m.title.length > 38 ? 64 : 80;
  return `<div class="card" style="--c:${c}"><span class="bar"></span>
    <div class="top"><div class="brand">${LOGO}nLab</div><div class="chips"><span class="chip" style="--k:${KIND_COLORS[m.kindLabel] || c}">${esc(m.kindLabel)}</span>${field ? `<span class="chip" style="--k:${c}">${esc(field)}</span>` : ''}</div></div>
    <div class="mid"><h1 style="--fs:${fs}px">${esc(m.title)}</h1>${m.known && m.summary !== false ? `<p>${esc(m.description)}</p>` : ''}</div>
    <div class="foot"><span>${m.inbound ? `<b>${m.inbound.toLocaleString('en')}</b> pages link here` : 'The open wiki for mathematics &amp; physics'}</span><span>sviatoslavgladyshev.github.io/nlab-redesign</span></div></div>`;
};

const browser = await chromium.launch({ executablePath: CHROME });
const WORKERS = 6;
let next = 0, done = 0;
await Promise.all(Array.from({ length: WORKERS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(`<!doctype html><html><head><style>${CSS}</style></head><body></body></html>`);
  await page.evaluate(() => Promise.all(['600 80px Fraunces', '600 20px Inter', '400 20px Inter', '400 27px SS4'].map((f) => document.fonts.load(f))));
  while (next < todo.length) {
    const name = todo[next++];
    const m = articleMeta(name);
    await page.evaluate((html) => { document.body.innerHTML = html; return document.fonts.ready; }, card(m));
    await page.screenshot({ path: new URL(`${m.slug}.jpg`, OUT).pathname, type: 'jpeg', quality: 70 });
    if (++done % 250 === 0) console.log(`  ${done}/${todo.length}`);
  }
  await page.close();
}));
await browser.close();
console.log(`Preview images: ${done} rendered.`);
