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
  execFileSync('git', ['-C', dir, 'fetch', '-q', '--depth', '1', 'origin', 'master'], { stdio: 'inherit' });
  execFileSync('git', ['-C', dir, 'reset', '-q', '--hard', 'FETCH_HEAD'], { stdio: 'inherit' });
} else {
  console.log(`Cloning ${REPO} (shallow)…`);
  execFileSync('git', ['clone', '-q', '--depth', '1', REPO, dir], { stdio: 'inherit' });
}
const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD']).toString().trim();
const committed = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%cI']).toString().trim();

// Walk pages/** for directories containing a `name` file
const pages = [];
const meta = []; // per page: { cats, includes, links }
async function walk(rel) {
  const entries = await readdir(join(dir, rel), { withFileTypes: true });
  if (entries.some((e) => e.isFile() && e.name === 'name')) {
    const name = (await readFile(join(dir, rel, 'name'), 'utf8')).trim();
    const src = await readFile(join(dir, rel, 'content.md'), 'utf8').catch(() => '');
    const aliases = [...src.matchAll(/\[\[!redirects\s+([^\]]+?)\s*\]\]/g)].map((m) => m[1].trim());
    pages.push([rel.replace(/^pages\//, ''), name, ...aliases]);
    meta.push({
      cats: [...src.matchAll(/^category:\s*(.+)$/gim)].flatMap((m) => m[1].split(',').map((c) => c.trim().toLowerCase())).filter(Boolean),
      includes: [...new Set([...src.matchAll(/\[\[!include\s+(.+?)\s+-\s+contents\s*\]\]/g)].map((m) => m[1].trim()))],
      links: [...new Set([...src.replace(/\[\[!include[^\]]*\]\]/g, '').matchAll(/\[\[([^\]|#!][^\]|#]*)/g)].map((m) => m[1].trim().toLowerCase()))],
    });
    return;
  }
  for (const e of entries) if (e.isDirectory()) await walk(`${rel}/${e.name}`);
}
await walk('pages');

// ---------- Library: kind, field and how often each page is linked to ----------
// Fields group the nLab's subject menus ("X - contents" includes) and category tags.
const FIELDS = {
  'Category theory': ['category theory', 'higher category theory', '2-category theory', '(0,1)-category theory', 'monoidal categories', 'infinity-limits', 'relations', 'equality and equivalence', 'duality', 'enriched category theory', 'categorical algebra', 'category'],
  Algebra: ['higher algebra', 'algebra', 'group theory', 'representation theory', 'homological algebra', 'monoid theory', 'higher linear algebra', 'differential graded objects', 'linear algebra', 'ring theory', 'number theory', 'arithmetic'],
  'Homotopy theory & topology': ['homotopy', 'topology', 'stable homotopy theory', 'model category theory', 'algebraic topology', 'manifolds and cobordisms', 'bundles', 'knot theory', 'mapping space', 'fibrations', 'homotopy theory'],
  Geometry: ['synthetic differential geometry', 'higher geometry', 'supergeometry', 'arithmetic geometry', 'complex geometry', 'Riemannian geometry', 'symplectic geometry', 'higher spin geometry', 'algebraic geometry', 'differential geometry', 'noncommutative geometry', 'geometry'],
  Cohomology: ['cohomology', 'differential cohomology', 'infinity-Chern-Weil theory', 'index theory', 'K-theory', 'motivic cohomology'],
  'Topos theory': ['topos theory', '(infinity,1)-topos', 'cohesive infinity-toposes', 'descent and locality', 'modalities', 'sheaf theory'],
  'Logic & foundations': ['type theory', 'constructivism', 'foundations', 'model theory', 'deduction and induction', 'universe', 'logic', 'set theory', 'foundational axiom', 'computer science', 'software'],
  'Lie theory': ['infinity-Lie theory', 'Lie theory'],
  Analysis: ['analysis', 'measure theory', 'functional analysis', 'integration theory', 'probability', 'operator algebra'],
  Physics: ['string theory', 'functorial quantum field theory', 'infinity-Chern-Simons theory', 'physics', 'quantum field theory', 'gravity', 'fields and quanta', 'solid state physics', 'quantum mechanics', 'algebraic quantum field theory'],
  Combinatorics: ['graph theory', 'combinatorics'],
  Philosophy: ['philosophy', 'philosophy of physics'],
};
const fieldNames = Object.keys(FIELDS);
const subToField = new Map();
fieldNames.forEach((f, i) => FIELDS[f].forEach((sub) => subToField.set(sub.toLowerCase(), i)));
const subs = []; // subfield names in use
const subIndex = new Map();
const subId = (name) => { const k = name.toLowerCase(); if (!subIndex.has(k)) { subIndex.set(k, subs.length); subs.push([name, subToField.get(k) ?? -1]); } return subIndex.get(k); };

// name / alias → page index, for counting incoming links
const lookup = new Map();
pages.forEach(([, name, ...aliases], i) => { [name, ...aliases].forEach((n) => { const k = n.toLowerCase(); if (!lookup.has(k)) lookup.set(k, i); }); });
const inbound = new Array(pages.length).fill(0);
const citedFrom = new Array(pages.length).fill(null).map(() => []);
meta.forEach((m, i) => {
  const seen = new Set();
  for (const l of m.links) {
    const j = lookup.get(l) ?? lookup.get(l.replace(/s$/, '')) ?? lookup.get(l.replace(/es$/, ''));
    if (j != null && j !== i && !seen.has(j)) { seen.add(j); inbound[j] += 1; citedFrom[j].push(i); }
  }
});
const ownSubs = (m) => [...new Set([...m.includes, ...m.cats.filter((c) => subToField.has(c))].map(subId))];
const kindOf = (name, m) => {
  if (m.cats.includes('people')) return 'p';
  if (m.cats.includes('reference')) return 'r';
  if (m.cats.includes('disambiguation')) return 'd';
  if (/\b(theorem|lemma|conjecture|hypothesis|principle|correspondence|formula|inequality|duality|equivalence|criterion|axiom)s?\b/i.test(name)) return 't';
  return 'c';
};
const lib = [];
pages.forEach(([, name], i) => {
  if (name === 'HomePage' || name.includes(' > ') || /^Sandbox/i.test(name) || /^(nLab|nForum)[ :]/i.test(name) && name.length > 40) return;
  const m = meta[i];
  let fieldSubs = ownSubs(m);
  // People rarely declare a field: use the subjects of the pages that cite them
  if (!fieldSubs.length && m.cats.includes('people')) {
    const tally = new Map();
    citedFrom[i].forEach((k) => ownSubs(meta[k]).forEach((sid) => tally.set(sid, (tally.get(sid) || 0) + 1)));
    fieldSubs = [...tally].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sid]) => sid);
  }
  lib.push([name, kindOf(name, m), inbound[i], fieldSubs]);
});
await writeFile(new URL('library.json', OUT), JSON.stringify({ fields: fieldNames, subs, pages: lib }));
console.log(`Library: ${lib.length} pages, ${subs.length} subject menus, ${lib.filter((x) => x[1] === 'p').length} people.`);

const names = pages.map((p) => p[1]).filter((n) => n !== 'HomePage' && !n.includes(' > ') && !/^Sandbox/i.test(n));
await mkdir(OUT, { recursive: true });
await writeFile(new URL('nlab-index.json', OUT), JSON.stringify({ commit, committed, pages }));
await writeFile(new URL('pages.json', OUT), JSON.stringify(names));
console.log(`Index: ${pages.length} pages, ${pages.reduce((s, p) => s + p.length - 2, 0)} redirects (mirror ${commit.slice(0, 8)}, ${committed}).`);
