// Build-time snapshot of nLab content for the static (GitHub Pages) build.
// ncatlab.org sends no CORS headers, so the browser cannot fetch it directly;
// instead this script runs before `vite build` and writes public/snapshot/.
//
//   node scripts/snapshot.mjs
//
// It fetches every nLab page the site links to (plus the "Surprise me" pool)
// and the latest-revisions list. Requests are sequential and spaced out.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const ORIGIN = 'https://ncatlab.org';
const OUT = new URL('../public/snapshot/', import.meta.url);
const UA = { 'User-Agent': 'nlab-redesign-prototype (static snapshot; GitHub Pages build)' };
const DELAY_MS = 400;

const decodeName = (s) => decodeURIComponent(s.replace(/\+/g, ' '));
const encodeName = (n) => encodeURIComponent(n).replace(/%20/g, '+');
const decodeEntities = (s) => s.replace(/&(#x[\da-f]+|#\d+|lt|gt|amp|quot|apos|#39);/gi, (_, e) => (
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1))
    : { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileFor = (name) => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
  return `${slug}-${createHash('sha1').update(name).digest('hex').slice(0, 8)}.html`;
};
// Keep only what the viewer needs (#Content), dropping nLab's scripts and styles.
const trim = (html) => {
  const i = html.indexOf('<div id="Content"');
  const j = html.lastIndexOf('</body>');
  const body = i >= 0 ? html.slice(i, j > i ? j : undefined) : html;
  return `<!DOCTYPE html><html><body>${body.replace(/<script[\s\S]*?<\/script>/gi, '')}</body></html>`;
};

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, redirect: 'follow' });
      if (res.ok) return res;
      if (res.status === 404) return null;
    } catch { /* retry */ }
    await sleep(1500 * attempt);
  }
  return null;
}

// 1. Collect page names from the site sources
const sources = await Promise.all(['../index.html', '../page.html', '../cqts.html', '../src/home.js'].map((p) => readFile(new URL(p, import.meta.url), 'utf8')));
const names = new Set();
for (const src of sources) for (const m of src.matchAll(/page\.html\?p=([^"'#&\s<]+)/g)) names.add(decodeName(m[1]));
const pool = sources[2].match(/const surprise = \[([\s\S]*?)\];/);
if (pool) for (const m of pool[1].matchAll(/'([^']+)'/g)) names.add(m[1]);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 2. Fetch pages
const pages = {};
let ok = 0;
for (const name of [...names].sort()) {
  const res = await get(`${ORIGIN}/nlab/show/${encodeName(name)}`);
  await sleep(DELAY_MS);
  if (!res) { console.warn(`  skip  ${name}`); continue; }
  const m = new URL(res.url).pathname.match(/^\/nlab\/show\/(.+)$/);
  const canonical = m ? decodeName(m[1]) : name;
  const file = fileFor(canonical);
  let entry = pages[canonical];
  if (!entry) {
    await writeFile(new URL(file, OUT), trim(await res.text()));
    ok++;
    entry = { file, canonical };
    // Page source, for the editor
    const src = await get(`${ORIGIN}/nlab/source/${encodeName(canonical)}`);
    await sleep(DELAY_MS);
    const ta = src && (await src.text()).match(/<textarea[^>]*id=.content.[^>]*>([\s\S]*?)<\/textarea>/);
    if (ta) {
      entry.source = file.replace(/\.html$/, '.md');
      await writeFile(new URL(entry.source, OUT), decodeEntities(ta[1]).replace(/^\n/, ''));
    }
  }
  for (const key of [name, canonical]) { pages[key] = entry; pages[key.toLowerCase()] = entry; }
  console.log(`  ok    ${name}${canonical !== name ? ` → ${canonical}` : ''}`);
}

// 3. Latest revisions
const latest = await get(`${ORIGIN}/nlab/latest_revisions`);
if (latest) await writeFile(new URL('latest_revisions.html', OUT), trim(await latest.text()));

await writeFile(new URL('index.json', OUT), JSON.stringify({ fetchedAt: new Date().toISOString(), pages }));
console.log(`Snapshot: ${ok} pages, latest revisions ${latest ? 'ok' : 'missing'}.`);
