// Builds the page index for the nLab content mirror (github.com/ncatlab/nlab-content).
// The mirror holds the source of every nLab page; raw.githubusercontent.com serves it with
// CORS headers, so the site can load *any* page in the browser and render it itself.
// This script only needs to know which directory holds which page name (and redirects):
//
//   node scripts/mirror-index.mjs [path-to-existing-clone]
//
// Writes public/snapshot/nlab-index.json and public/snapshot/pages.json.
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = new URL('../public/snapshot/', import.meta.url);
const REPO = 'https://github.com/ncatlab/nlab-content.git';
let dir = process.argv[2] || join(tmpdir(), 'nlab-content');

const exists = (p) => stat(p).then(() => true, () => false);
if (await exists(join(dir, '.git'))) {
  console.log(`Updating ${dir}…`);
  execFileSync('git', ['-C', dir, 'pull', '-q', '--depth', '1'], { stdio: 'inherit' });
} else {
  console.log(`Cloning ${REPO} (shallow)…`);
  execFileSync('git', ['clone', '-q', '--depth', '1', REPO, dir], { stdio: 'inherit' });
}
const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD']).toString().trim();
const committed = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%cI']).toString().trim();

// Walk pages/** for directories containing a `name` file
const pages = [];
async function walk(rel) {
  const entries = await readdir(join(dir, rel), { withFileTypes: true });
  if (entries.some((e) => e.isFile() && e.name === 'name')) {
    const name = (await readFile(join(dir, rel, 'name'), 'utf8')).trim();
    const src = await readFile(join(dir, rel, 'content.md'), 'utf8').catch(() => '');
    const aliases = [...src.matchAll(/\[\[!redirects\s+([^\]]+?)\s*\]\]/g)].map((m) => m[1].trim());
    pages.push([rel.replace(/^pages\//, ''), name, ...aliases]);
    return;
  }
  for (const e of entries) if (e.isDirectory()) await walk(`${rel}/${e.name}`);
}
await walk('pages');

const names = pages.map((p) => p[1]).filter((n) => n !== 'HomePage' && !n.includes(' > ') && !/^Sandbox/i.test(n));
await mkdir(OUT, { recursive: true });
await writeFile(new URL('nlab-index.json', OUT), JSON.stringify({ commit, committed, pages }));
await writeFile(new URL('pages.json', OUT), JSON.stringify(names));
console.log(`Index: ${pages.length} pages, ${pages.reduce((s, p) => s + p.length - 2, 0)} redirects (mirror ${commit.slice(0, 8)}, ${committed}).`);
