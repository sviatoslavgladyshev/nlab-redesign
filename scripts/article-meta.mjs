// Per-article link-preview data (title, description, image), shared by the dev server
// (vite.config.js), the static page generator (scripts/seo.mjs) and the preview-image renderer
// (scripts/og-articles.mjs). Reads public/snapshot/search.json, written by mirror-index.mjs.
import { readFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
let rows;
const load = () => {
  if (rows) return rows;
  rows = new Map();
  let fields = [];
  try { fields = JSON.parse(readFileSync(new URL('public/snapshot/graph.json', ROOT), 'utf8')).fields; } catch { /* no graph yet */ }
  try {
    for (const [name, kind, inbound, summary, mask, ...aliases] of JSON.parse(readFileSync(new URL('public/snapshot/search.json', ROOT), 'utf8'))) {
      const e = { name, kind, inbound, summary, fields: fields.filter((_, i) => mask & (1 << i)) };
      rows.set(name.toLowerCase(), e);
      for (const a of aliases) if (!rows.has(a.toLowerCase())) rows.set(a.toLowerCase(), e);
    }
  } catch { /* no index yet */ }
  return rows;
};

// same rules as the site's displayTitle (title case; name particles stay lower case)
const SMALL = new Set('a an and as at but by for from in into nor of on onto or over per the to under via vs with without'.split(' '));
const PARTICLES = new Set('ibn bin bint ben bar al el de da di del della dei der den des du dos das van von vom zu zur ter ten te af av la le lo y e'.split(' '));
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
export function displayTitle(name, person) {
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

// a stable, URL-safe file name for a page's preview image
export function ogSlug(name) {
  let h = 2166136261;
  for (const c of name) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${base || 'page'}-${h.toString(36)}`;
}

const KIND = { c: 'Concept', t: 'Theorem', p: 'Person', r: 'Reference', d: 'Disambiguation', s: 'Sandbox' };
export function articleMeta(rawName) {
  const name = rawName.replace(/\+/g, ' ').trim();
  const e = load().get(name.toLowerCase());
  const real = e?.name || name;
  const title = displayTitle(real, e?.kind === 'p');
  let description = e?.summary || '';
  if (description.length > 200) description = `${description.slice(0, 197).replace(/\s+\S*$/, '')}…`;
  if (!description) description = e?.kind === 'p' ? `${title} — on the nLab, the open wiki for mathematics and physics.` : `${title} on the nLab, the open wiki for mathematics and physics.`;
  const slug = ogSlug(real);
  const image = existsSync(new URL(`public/og/wiki/${slug}.jpg`, ROOT)) ? `og/wiki/${slug}.jpg` : 'og/article.png';
  return { name: real, title, description, kind: e?.kind || 'c', kindLabel: KIND[e?.kind] || 'Article', fields: e?.fields || [], inbound: e?.inbound || 0, image, slug, known: !!e };
}
export const allArticles = () => [...new Set(load().values())];
