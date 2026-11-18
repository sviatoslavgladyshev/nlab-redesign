// Pre-renders the nLab's TikZ diagrams (tikzcd / tikzpicture / xymatrix) for the static site.
// The nLab renders these on its server into inline SVG, in source order. This script finds every
// page in the content mirror that contains such blocks, fetches the rendered page once, and saves
// each diagram as public/snapshot/tikz/<hash of its source>.svg. Incremental: existing files are kept.
//
//   node scripts/tikz-snapshot.mjs [path-to-mirror-clone]
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashSource, TIKZ_RE } from '../src/core/hash.js';

const dir = process.argv[2] || join(tmpdir(), 'nlab-content');
const OUT = new URL('../public/snapshot/tikz/', import.meta.url);
const UA = { 'User-Agent': 'nlab-redesign-prototype (diagram snapshot)' };
const exists = (u) => stat(u).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(OUT, { recursive: true });

const jobs = [];
async function walk(rel) {
  const entries = await readdir(join(dir, rel), { withFileTypes: true });
  if (entries.some((e) => e.name === 'content.md')) {
    const src = await readFile(join(dir, rel, 'content.md'), 'utf8');
    const blocks = [...src.matchAll(TIKZ_RE)].map((m) => hashSource(m[0]));
    if (blocks.length) jobs.push({ name: (await readFile(join(dir, rel, 'name'), 'utf8')).trim(), blocks });
    return;
  }
  for (const e of entries) if (e.isDirectory()) await walk(`${rel}/${e.name}`);
}
await walk('pages');

let saved = 0, skipped = 0, mismatched = 0;
for (const [k, job] of jobs.entries()) {
  const missing = [];
  for (const h of job.blocks) if (!(await exists(new URL(`${h}.svg`, OUT)))) missing.push(h);
  if (!missing.length) { skipped++; continue; }
  let html = '';
  try {
    const res = await fetch(`https://ncatlab.org/nlab/show/${encodeURIComponent(job.name).replace(/%20/g, '+')}`, { headers: UA });
    html = res.ok ? await res.text() : '';
  } catch { /* skip */ }
  const svgs = [...html.matchAll(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" xmlns:xlink[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  if (svgs.length !== job.blocks.length) { mismatched++; console.warn(`  ? ${job.name}: ${job.blocks.length} blocks, ${svgs.length} svgs`); await sleep(400); continue; }
  for (const [i, h] of job.blocks.entries()) {
    const svg = svgs[i].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
    await writeFile(new URL(`${h}.svg`, OUT), svg);
    saved++;
  }
  if (k % 25 === 0) console.log(`  ${k + 1}/${jobs.length} pages…`);
  await sleep(400);
}
const all = (await readdir(OUT)).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4));
await writeFile(new URL('../tikz.json', OUT), JSON.stringify(all));
console.log(`Diagrams: ${saved} new, ${all.length} total (${jobs.length} pages, ${skipped} up to date, ${mismatched} skipped).`);
