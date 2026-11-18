// Loads the nLab into the site's database: every page's source, kind, summary, fields, inbound links,
// outgoing links and alternative names. Pages edited on this site are never overwritten.
//
//   node scripts/db-import.mjs [path-to-mirror-clone]
//
// Needs (after `npm run snapshot`, which writes public/snapshot/*.json):
//   VITE_SUPABASE_URL      in .env (already there)
//   SUPABASE_SECRET_KEY    in .env.local (git-ignored) or the environment: the project's secret key.
//                          It can write anything, so keep it out of the repository and out of the site.
// Options: --out <dir>  write the batches as JSON files instead of sending them (for testing).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT_DIR = outIdx >= 0 ? args[outIdx + 1] : null;
const mirror = args.find((a, i) => !a.startsWith('--') && i !== outIdx + 1) || join(tmpdir(), 'nlab-content');

// settings from .env / .env.local (without printing them)
const env = { ...process.env };
for (const f of ['.env', '.env.local']) {
  const p = new URL(f, ROOT);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const URL_ = env.VITE_SUPABASE_URL, SECRET = env.SUPABASE_SECRET_KEY;
if (!OUT_DIR && (!URL_ || !SECRET)) {
  console.error('Missing VITE_SUPABASE_URL (in .env) or SUPABASE_SECRET_KEY (in .env.local).');
  process.exit(1);
}
if (!existsSync(join(mirror, 'pages'))) { console.error(`No nLab mirror at ${mirror} (run npm run snapshot, or pass its path).`); process.exit(1); }

const snap = (f) => JSON.parse(readFileSync(new URL(`public/snapshot/${f}`, ROOT), 'utf8'));
const index = snap('nlab-index.json').pages;                       // [dir, name, ...aliases]
const meta = new Map(snap('search.json').map(([name, kind, inbound, summary, fields]) => [name, { kind, inbound, summary, fields }]));

const linksOf = (src) => [...new Set([...src.replace(/\[\[!include[^\]]*\]\]/g, '').matchAll(/\[\[([^\]|#!][^\]|#]*)/g)]
  .map((m) => m[1].trim().toLowerCase()).filter((l) => l && l.length <= 300))].slice(0, 2000);

const pages = [], aliases = [];
for (const [dir, name, ...al] of index) {
  const file = join(mirror, 'pages', dir, 'content.md');
  const source = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const m = meta.get(name) || {};
  pages.push({ name, dir, source, kind: m.kind || (/sandbox/i.test(name) ? 's' : 'c'), summary: m.summary || '', fields: m.fields || 0, inbound: m.inbound || 0, links: linksOf(source) });
  for (const a of al) aliases.push({ alias: a, name });
}

// batches of about 2 MB
const batches = (rows, max = 2_000_000) => {
  const out = []; let cur = [], size = 0;
  for (const r of rows) {
    const s = JSON.stringify(r).length;
    if (cur.length && size + s > max) { out.push(cur); cur = []; size = 0; }
    cur.push(r); size += s;
  }
  if (cur.length) out.push(cur);
  return out;
};

async function call(fn, rows, attempt = 1) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (attempt < 4 && res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * attempt)); return call(fn, rows, attempt + 1); }
    throw new Error(`${fn}: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

const pageBatches = batches(pages), aliasBatches = batches(aliases, 1_000_000);
if (OUT_DIR) {
  mkdirSync(OUT_DIR, { recursive: true });
  pageBatches.forEach((b, i) => writeFileSync(join(OUT_DIR, `pages-${String(i).padStart(3, '0')}.json`), JSON.stringify(b)));
  aliasBatches.forEach((b, i) => writeFileSync(join(OUT_DIR, `aliases-${String(i).padStart(3, '0')}.json`), JSON.stringify(b)));
  console.log(`Wrote ${pageBatches.length} page batches and ${aliasBatches.length} alias batches to ${OUT_DIR}.`);
} else {
  let changed = 0;
  for (const [i, b] of pageBatches.entries()) {
    changed += await call('import_pages', b);
    process.stdout.write(`\rPages: batch ${i + 1}/${pageBatches.length}`);
  }
  let al = 0;
  for (const b of aliasBatches) al += await call('import_aliases', b);
  console.log(`\nImported ${pages.length} pages (${changed} new or changed) and ${al} alternative names.`);
}
