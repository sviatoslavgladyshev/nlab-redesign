// After `vite build`: makes the site findable and shareable.
//  • dist/wiki/<Page>/index.html for the most-linked articles — real pages (HTTP 200) with their own
//    title, description, canonical URL, link-preview tags and structured data
//  • dist/cqts/<section>/index.html for every CQTS page
//  • dist/404.html — the app shell that serves every other article and old .html links
//  • dist/sitemap.xml and dist/robots.txt
//
//   node scripts/seo.mjs [path-to-mirror-clone] [number-of-articles]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SITE, seoTags, articleJsonld } from '../vite.config.js';
import { isExcludedPage } from '../src/core/page-visibility.js';
import { articleMeta } from './article-meta.mjs';

const mirror = process.argv[2] || join(tmpdir(), 'nlab-content');
const LIMIT = +(process.argv[3] || 3000);
const DIST = new URL('../dist/', import.meta.url);
const read = (rel) => readFile(new URL(rel, DIST), 'utf8');
const write = async (rel, text) => { const u = new URL(rel, DIST); await mkdir(new URL('.', u), { recursive: true }); await writeFile(u, text); };

// strip the generic SEO tags the build put in, so a page can get its own
const stripSeo = (html) => html
  .replace(/<title>[\s\S]*?<\/title>\n?/, '')
  .replace(/<meta (name="description"|property="og:[^"]+"|name="twitter:[^"]+"|name="theme-color")[^>]*>\n?/g, '')
  .replace(/<link rel="canonical"[^>]*>\n?/, '')
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');
const withSeo = (shell, tags) => stripSeo(shell).replace('</head>', `${tags}\n</head>`);

// same rules as the site's displayTitle (title case; name particles stay lower case)
const SMALL = new Set('a an and as at but by for from in into nor of on onto or over per the to under via vs with without'.split(' '));
const PARTICLES = new Set('ibn bin bint ben bar al el de da di del della dei der den des du dos das van von vom zu zur ter ten te af av la le lo y e'.split(' '));
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
function displayTitle(name, person) {
  let k = -1;
  return name.split(/(\s+)/).map((w) => {
    if (!w || /^\s+$/.test(w)) return w; k += 1;
    if (/[A-Z]/.test(w) || !/^[a-z]/.test(w)) return w;
    if (person) return PARTICLES.has(w) ? w : w.split('-').map(cap).join('-');
    if (k > 0 && SMALL.has(w)) return w;
    if (/^[a-z](-|$)/.test(w)) return w;
    return cap(w);
  }).join('');
}
// a plain-text description from the page source: the first real sentences of its "Idea"
function describe(src, title) {
  const body = src.replace(/^\s*\+--[^\n]*rightHandSide[\s\S]*?\n=--\s*\n=--\s*\n=--/m, '');
  const part = body.split(/^#{2,3}\s+(?:Idea|Definition|Statement)\b.*$/m)[1] || body;
  const para = part.split(/\n\s*\n/).map((x) => x.trim()).find((x) => x.length > 60 && !/^([+#*{=<|>\\-]|\$\$|\[\[!)/.test(x)) || '';
  let text = para.replace(/&lbrack;/g, '[').replace(/&rbrack;/g, ']').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\$\$?([^$]*)\$\$?/g, (_, m) => m.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}^_\\]/g, '')).replace(/[*_`>]/g, '')
    .replace(/\{#[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  if (text.length > 158) text = `${text.slice(0, 155).replace(/\s+\S*$/, '')}…`;
  return text || `${title} on the nLab, the open wiki for mathematics and physics.`;
}

const shell = await read('wiki/index.html');
const lib = JSON.parse(await readFile(new URL('../public/snapshot/library.json', import.meta.url), 'utf8'));
const idx = JSON.parse(await readFile(new URL('../public/snapshot/nlab-index.json', import.meta.url), 'utf8'));
const dirOf = new Map(idx.pages.map(([d, n]) => [n, d]));
const ranked = lib.pages.filter(([name]) => !isExcludedPage(name)).sort((a, b) => b[2] - a[2]).slice(0, LIMIT);
if (!ranked.some((p) => p[0] === 'Center for Quantum and Topological Systems')) ranked.push(lib.pages.find((p) => p[0] === 'Center for Quantum and Topological Systems'));

const urls = [];
const taken = new Set();
let made = 0;
for (const [name, kind] of ranked.filter(Boolean)) {
  if (/[/?#%+\\]/.test(name) || taken.has(name.toLowerCase())) continue; // unsafe as a folder name, or a case clash
  taken.add(name.toLowerCase());
  const folder = name.replace(/ /g, '+');
  const src = existsSync(join(mirror, 'pages', dirOf.get(name) || '', 'content.md')) ? await readFile(join(mirror, 'pages', dirOf.get(name), 'content.md'), 'utf8') : '';
  const m = articleMeta(name);
  if (!m.known) m.description = describe(src, m.title);
  const url = `${SITE}wiki/${encodeURIComponent(name).replace(/%20/g, '+')}/`;
  await write(`wiki/${folder}/index.html`, withSeo(shell, seoTags({ title: `${m.title} — nLab`, description: m.description, url, image: m.image, type: 'article', jsonld: articleJsonld(m) })));
  urls.push(url);
  made += 1;
}

// CQTS pages
const CQTS = {
  research: ['Research', 'Topological order, quantum materials, sensing and computing: the two research directions of the Center for Quantum and Topological Systems at NYU Abu Dhabi.'],
  people: ['People', 'The director, principal investigators, investigators, researchers and alumni of the Center for Quantum and Topological Systems at NYU Abu Dhabi.'],
  'symposium-2026': ['Research Symposium 2026', 'Talks, slides and papers from the CQTS Research Symposium 2026, led by Urs Schreiber on new pathways to topological order.'],
  materials: ['Materials', 'Slides, videos and papers from every CQTS series: conferences and workshops, the Quantum Colloquium and the Geometry, Topology & Physics Seminar.'],
  activities: ['Activities', 'The recurring series of the Center for Quantum and Topological Systems: Quantum Colloquium, GTP Seminar, conferences and external presentations.'],
  colloquium: ['Quantum Colloquium', 'Recent speakers of the CQTS Quantum Colloquium at NYU Abu Dhabi, on quantum light, matter and computation.'],
  events: ['Events', 'Conferences, workshops and training programs of the Center for Quantum and Topological Systems at NYU Abu Dhabi.'],
  'get-involved': ['Get involved', 'Attend CQTS talks, join the Summer Training Program, or contribute to the nLab.'],
  archive: ['Archive', 'The complete record of every CQTS series, kept on the nLab.'],
};
const cqShell = await read('cqts/index.html');
urls.push(`${SITE}cqts/`);
for (const [slug, [title, description]] of Object.entries(CQTS)) {
  const url = `${SITE}cqts/${slug}/`;
  await write(`cqts/${slug}/index.html`, withSeo(cqShell, seoTags({ title: `${title} — CQTS, NYU Abu Dhabi`, description, url, image: 'og/cqts.png' })));
  urls.push(url);
}
const CQTS_PEOPLE = [
  ['hisham-sati', 'Hisham Sati'], ['muhammad-shafique', 'Muhammad Shafique'], ['tim-byrnes', 'Tim Byrnes'],
  ['asif-equbal', 'Asif Equbal'], ['maryam-alnahyan', 'Maryam AlNahyan'], ['riyadh-baghdadi', 'Riyadh Baghdadi'],
  ['safiya-khalil-alhashmi', 'Safiya Khalil Alhashmi'], ['bing-qi', 'Bing Qi'], ['saurabh-ray', 'Saurabh Ray'],
  ['qiang-zhang', 'Qiang Zhang'], ['urs-schreiber', 'Urs Schreiber'], ['grigorios-giotopoulos', 'Grigorios Giotopoulos'],
  ['nouhaila-innan', 'Nouhaila Innan'], ['amaria-javed', 'Amaria Javed'], ['muhammad-kashif', 'Muhammad Kashif'],
  ['marwa-mannai', 'Marwa Mannai'], ['alberto-marchisio', 'Alberto Marchisio'], ['vivek-singh', 'Vivek Kumar Singh'],
  ['venkata-subbarao-redrouthu', 'Venkata SubbaRao Redrouthu'], ['rashed-al-jasmi', 'Rashed Al Jasmi'],
  ['maryem-ahmed-almheiri', 'Maryem Ahmed Almheiri'], ['mayur-jhamnani', 'Mayur Jhamnani'],
];
for (const [slug, name] of CQTS_PEOPLE) {
  const url = `${SITE}cqts/${slug}/`;
  await write(`cqts/${slug}/index.html`, withSeo(cqShell, seoTags({
    title: `${name} — CQTS, NYU Abu Dhabi`,
    description: `${name} — profile, research interests and contact details at the Center for Quantum and Topological Systems, NYU Abu Dhabi.`,
    url, image: 'og/cqts.png', type: 'profile',
    jsonld: { '@context': 'https://schema.org', '@type': 'ProfilePage', name: `${name} — CQTS`, url, mainEntity: { '@type': 'Person', name }, isPartOf: { '@type': 'ResearchOrganization', name: 'Center for Quantum and Topological Systems' } },
  })));
  urls.push(url);
}

// 404: the app shell (serves every other article and old .html links), not indexed itself
await write('404.html', withSeo(shell, `<title>nLab</title>\n<meta name="robots" content="noindex">`));
await write('suggestions/index.html', withSeo(shell, `<title>Suggestions — nLab</title>\n<meta name="robots" content="noindex">`));
await write('profile/index.html', withSeo(shell, `<title>My profile — nLab</title>\n<meta name="robots" content="noindex">`));
await write('profile/settings/index.html', withSeo(shell, `<title>Profile settings — nLab</title>\n<meta name="robots" content="noindex">`));

const today = new Date().toISOString().slice(0, 10);
const top = [SITE, `${SITE}library/`, `${SITE}forum/`, `${SITE}recent`];
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...top, ...urls].map((u) => `  <url><loc>${u.replace(/&/g, '&amp;')}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
console.log(`SEO: ${made} article pages, ${Object.keys(CQTS).length} CQTS pages, sitemap with ${top.length + urls.length} URLs.`);
