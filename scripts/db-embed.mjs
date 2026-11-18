// Computes each page's embedding (its "meaning", 384 numbers) with the open gte-small model, here on
// this computer (no paid API), and stores it in the database for smart search and related pages.
// The search Edge Function embeds questions with the same model, so the two match.
//
//   node scripts/db-embed.mjs              pages without an embedding, or edited since (from the database)
//   node scripts/db-embed.mjs --out <dir> [mirror]   no database: embed from the snapshot + mirror into JSON files
//
// Needs VITE_SUPABASE_URL (.env) and SUPABASE_SECRET_KEY (.env.local, git-ignored), like db-import.mjs.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from '@huggingface/transformers';

const ROOT = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT_DIR = outIdx >= 0 ? args[outIdx + 1] : null;
const LIMIT = +(args[args.indexOf('--limit') + 1] || 0) || Infinity;

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
const rpc = async (fn, body) => {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
};

// what the model reads: the title, the summary and the start of the page as plain text
const plain = (src) => src
  .replace(/^\s*\+--[\s\S]*?\n=--\s*$/gm, ' ')
  .replace(/\[\[!\w+[^\]]*\]\]/g, ' ').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\{[:#][^}]*\}/g, ' ').replace(/^#+\s*/gm, '').replace(/[*_`>|]+/g, '')
  .replace(/\\(mathbb|mathcal|mathrm|mathbf|text|operatorname)\{([^}]*)\}/g, '$2').replace(/\\[a-zA-Z]+/g, ' ').replace(/[$^{}]/g, ' ')
  .replace(/\b(table of contents|toc|Contents|Idea|Definition|Properties|Examples|References|Related concepts)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();
const textOf = ({ name, summary, source }) => `${name}. ${summary || ''} ${plain(source || '').slice(0, 1200)}`.slice(0, 1600);

const embed = await pipeline('feature-extraction', 'Supabase/gte-small', { dtype: 'fp32' });
const BATCH = 32;
const SAVE_EVERY = OUT_DIR ? 500 : 96; // small uploads: the database recomputes each updated row
const started = Date.now();
let done = 0, file = 0;

// embed a list of pages and hand each ~500 to `save`
async function run(pages, total, save) {
  const out = [];
  for (let i = 0; i < pages.length; i += BATCH) {
    const chunk = pages.slice(i, i + BATCH);
    const list = (await embed(chunk.map(textOf), { pooling: 'mean', normalize: true })).tolist();
    chunk.forEach((p, k) => out.push({ name: p.name, embedding: `[${list[k].map((x) => +x.toFixed(5)).join(',')}]` }));
    if (out.length >= SAVE_EVERY || i + BATCH >= pages.length) { await save(out.splice(0)); }
    done += chunk.length;
    const rate = done / ((Date.now() - started) / 1000);
    process.stdout.write(`\r  ${done}${total ? `/${total}` : ''} · ${rate.toFixed(0)} pages/s${total ? ` · ${Math.round((total - done) / rate)} s left` : ''}   `);
  }
}

if (OUT_DIR) {
  // no database: from the snapshot and the mirror, into JSON files
  const mirror = args.find((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1) && args[i - 1] !== "--limit") || join(tmpdir(), 'nlab-content');
  const snap = (f) => JSON.parse(readFileSync(new URL(`public/snapshot/${f}`, ROOT), 'utf8'));
  const summary = new Map(snap('search.json').map((r) => [r[0], r[3]]));
  const pages = snap('nlab-index.json').pages.map(([dir, name]) => {
    const f = join(mirror, 'pages', dir, 'content.md');
    return { name, summary: summary.get(name) || '', source: existsSync(f) ? readFileSync(f, 'utf8').slice(0, 4000) : '' };
  }).slice(0, LIMIT);
  console.log(`Embedding ${pages.length} pages with gte-small…`);
  mkdirSync(OUT_DIR, { recursive: true });
  await run(pages, pages.length, async (rows) => writeFileSync(join(OUT_DIR, `emb-${String(file++).padStart(4, '0')}.json`), JSON.stringify(rows)));
} else {
  // the database: pages without a current embedding, 1000 at a time (the API's page size), until none are left
  if (!URL_ || !SECRET) { console.error('Missing VITE_SUPABASE_URL (in .env) or SUPABASE_SECRET_KEY (in .env.local).'); process.exit(1); }
  console.log('Embedding pages with gte-small…');
  for (;;) {
    const pages = (await rpc('pages_to_embed', { p_limit: 1000 })).slice(0, LIMIT - done);
    if (!pages.length) break;
    await run(pages, 0, (rows) => rpc('import_embeddings', { rows }));
    if (done >= LIMIT) break;
  }
}
console.log(`\nDone: ${done} pages.`);
