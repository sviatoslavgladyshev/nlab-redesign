// Collects the materials of the Center for Quantum and Topological Systems — slides, PDFs,
// videos, recordings and papers — from its record on the nLab (in the content mirror) into
// public/snapshot/cqts-materials.json, for the CQTS materials page.
//
//   node scripts/cqts-materials.mjs [path-to-mirror-clone]
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = process.argv[2] || join(tmpdir(), 'nlab-content');
const OUT = new URL('../public/snapshot/cqts-materials.json', import.meta.url);
const PAGE = 'Center for Quantum and Topological Systems';

async function findPage(rel = 'pages') {
  const entries = await readdir(join(dir, rel), { withFileTypes: true });
  if (entries.some((e) => e.name === 'name')) {
    return (await readFile(join(dir, rel, 'name'), 'utf8')).trim() === PAGE ? join(dir, rel, 'content.md') : null;
  }
  for (const e of entries) if (e.isDirectory()) { const f = await findPage(`${rel}/${e.name}`); if (f) return f; }
  return null;
}
const file = await findPage();
if (!file) throw new Error(`"${PAGE}" not found in ${dir}`);
const src = await readFile(file, 'utf8');

const SERIES = { 'Conferences & Workshops': 'Conferences & workshops', 'Quantum Colloquium': 'Quantum Colloquium',
  'Geometry, Topology': 'Geometry, Topology & Physics Seminar', 'External presentations': 'External presentations' };
const plain = (s) => s.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, a, b) => (b || a).replace(/^schreiber:/, ''))
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\\linebreak/g, '').replace(/\s+/g, ' ').trim();
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

function linkType(label, url, context) {
  if (/youtube\.com|youtu\.be|kaltura|vimeo/i.test(url) || /^(yt|kt|video)/i.test(label)) return 'Video';
  if (/zoom\.us\/rec|zoom\.us\/.*share/i.test(url) || /^(rec|zm|zoom)$/i.test(label)) return /video|rec/i.test(context) ? 'Video' : null;
  if (/arxiv\.org|doi\.org|doi:/i.test(url)) return 'Paper';
  if (/\.pdf($|\?)/i.test(url)) return /notes/i.test(context) ? 'Notes' : /poster/i.test(context) ? 'Poster' : 'Slides';
  if (/ncatlab\.org\/schreiber\//.test(url)) return /slides/i.test(context) ? 'Slides' : null;
  return null;
}

const items = [];
let series = null, month = null;
const lines = src.split('\n');
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const h2 = l.match(/^##\s+(.+?)\s*#*\s*$/);
  if (h2) { series = Object.keys(SERIES).find((k) => h2[1].startsWith(k)) ? SERIES[Object.keys(SERIES).find((k) => h2[1].startsWith(k))] : null; continue; }
  const h3 = l.match(/^###\s+([A-Za-z]+)\.?\s+(\d{4})/);
  if (h3) { month = `${h3[1].slice(0, 3)} ${h3[2]}`; continue; }
  if (!series || !/^\* /.test(l)) continue;
  // the item runs until the next top-level bullet or heading
  let j = i + 1;
  while (j < lines.length && !/^(\* |#)/.test(lines[j])) j++;
  const block = lines.slice(i, j).join('\n');
  i = j - 1;
  const title = (block.match(/\*\*(.+?)\*\*/) || [])[1];
  if (!title) continue;
  const date = (block.match(/\b(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/) || []);
  const head = block.split(/\*\*/)[0];
  const speakers = [...new Set([
    ...[...head.matchAll(/\[\[([^\]|:]+?)(?:\|([^\]]+))?\]\]/g)].map((m) => (m[2] || m[1]).trim()),
    ...[...head.matchAll(/\[([A-Z][^\]]{2,60})\]\(https?:[^)]+\)/g)].map((m) => m[1].trim()),
  ])].filter((n) => !/^(CQTS|NYU|New York University|Abu Dhabi|GST|UTC|Zoom)/i.test(n) && !/^\d/.test(n)).slice(0, 4);
  const links = [];
  const seen = new Set();
  for (const bl of block.split('\n')) {
    const ctx = (bl.match(/^\s*([a-z][a-z ]*\d?)\s*:/i) || [])[1] || '';
    for (const m of bl.matchAll(/\[\[([^\]|]+?):file(?:\|([^\]]+))?\]\]/g)) {
      const url = `https://ncatlab.org/nlab/files/${encodeURIComponent(m[1].trim())}`;
      const type = linkType('pdf', url, ctx || 'slides');
      if (type && !seen.has(url)) { seen.add(url); links.push({ type, url, label: m[2] || type }); }
    }
    for (const m of bl.matchAll(/\[([^\]]{1,80})\]\((https?:\/\/[^)\s]+)\)/g)) {
      const type = linkType(m[1].trim(), m[2], ctx);
      if (type && !seen.has(m[2])) { seen.add(m[2]); links.push({ type, url: m[2], label: m[1].trim() }); }
    }
    for (const m of bl.matchAll(/\[\[schreiber:([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
      const url = `https://ncatlab.org/schreiber/show/${encodeURIComponent(m[1].trim()).replace(/%20/g, '+')}`;
      const type = linkType('', url, ctx);
      if (type && !seen.has(url)) { seen.add(url); links.push({ type, url, label: 'Slides (web)' }); }
    }
  }
  const d = date.length ? `${date[1]} ${date[2]} ${date[3]}` : month;
  const sortKey = (() => { const [mm, yy] = (d || '').split(' ').slice(-2); const dd = date.length ? +date[1] : 1; return `${yy}-${String(MONTHS.indexOf(mm) + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`; })();
  items.push({ series, date: d, sort: sortKey, year: (d || '').slice(-4), title: plain(title), speakers, links });
}
items.sort((a, b) => b.sort.localeCompare(a.sort));
const withMaterials = items.filter((x) => x.links.length);
await writeFile(OUT, JSON.stringify({ source: PAGE, talks: items.length, items: withMaterials }));
const count = (t) => withMaterials.reduce((s, x) => s + x.links.filter((l) => l.type === t).length, 0);
console.log(`CQTS materials: ${withMaterials.length} of ${items.length} talks have materials — ${count('Slides')} slides, ${count('Video')} videos, ${count('Paper')} papers, ${count('Notes')} notes.`);
