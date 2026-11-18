import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { articleMeta } from './scripts/article-meta.mjs';

// Live nLab content is fetched through this proxy, so the browser never hits CORS.
const nlabProxy = {
  '/nlab-api': {
    target: 'https://ncatlab.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/nlab-api/, ''),
    headers: { 'User-Agent': 'Mozilla/5.0 (nLab redesign prototype)' },
    // Keep nLab's redirects (e.g. "anyon" → "braid group statistics") inside the proxy
    configure: (proxy) => proxy.on('proxyRes', (res) => {
      const loc = res.headers.location;
      if (loc) res.headers.location = loc.replace(/^https?:\/\/ncatlab\.org/, '/nlab-api');
    }),
  },
  // nForum (Zulip): anonymous read access to its public channels
  '/nforum-api': {
    target: 'https://nforum.ncatlab.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/nforum-api/, ''),
  },
};

// Clean URLs. Real folders: library/, forum/, cqts/, wiki/. Everything else (wiki/<Page>, search,
// recent, all, write, old *.html links) is handled by the wiki app — in production as the site's
// 404 page (plus pre-generated pages, see scripts/seo.mjs), in dev through this rewrite.
const APP_ROUTES = /^\/(wiki\/.+|search|recent|all|write|suggestions|profile(?:\/settings)?|page\.html)(\/)?(\?.*)?$/;
// ---------- SEO: titles, descriptions, link previews, structured data ----------
export const SITE = 'https://sviatoslavgladyshev.github.io/nlab-redesign/';
const PAGES = {
  'index.html': { path: '', image: 'og/home.png',
    title: 'nLab — the open wiki for mathematics and physics',
    description: 'Read and write the nLab: 20,000+ pages on mathematics and physics from the higher-structures point of view. Search, browse by field and author, discuss in the forum, and edit with LaTeX.' },
  'library/index.html': { path: 'library/', image: 'og/library.png',
    title: 'Library — every nLab page by field, kind and author',
    description: 'Browse all 20,000+ pages of the nLab: concepts, theorems, people and references, filtered by field (category theory, homotopy theory, geometry, physics…) and sorted by how often they are cited.' },
  'forum/index.html': { path: 'forum/', image: 'og/forum.png',
    title: 'Forum — discussion of and around the nLab',
    description: 'Questions about nLab pages, corrections, new results and announcements of every edit, in the nForum community.' },
  'cqts/index.html': { path: 'cqts/', image: 'og/cqts.png',
    title: 'Center for Quantum and Topological Systems (CQTS) — NYU Abu Dhabi',
    description: 'CQTS at NYU Abu Dhabi studies fundamental questions of quantum systems with a focus on topological stabilization: topological order, quantum materials, sensing and computing. Research Symposium 2026, Quantum Colloquium and seminars.' },
  'wiki/index.html': { path: 'wiki/', image: 'og/article.png',
    title: 'nLab', description: 'An article on the nLab, the open wiki for mathematics and physics.' },
};
const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function seoTags({ title, description, url, image, type = 'website', jsonld }) {
  return [
    `<title>${attr(title)}</title>`,
    `<meta name="description" content="${attr(description)}">`,
    `<link rel="canonical" href="${attr(url)}">`,
    '<meta name="theme-color" content="#1d4f91">',
    `<meta property="og:type" content="${type}">`,
    '<meta property="og:site_name" content="nLab">',
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:url" content="${attr(url)}">`,
    `<meta property="og:image" content="${attr(SITE + image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${attr(title)}">`,
    `<meta name="twitter:description" content="${attr(description)}">`,
    `<meta name="twitter:image" content="${attr(SITE + image)}">`,
    jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n');
}
const JSONLD = {
  'index.html': { '@context': 'https://schema.org', '@type': 'WebSite', name: 'nLab', url: SITE,
    potentialAction: { '@type': 'SearchAction', target: `${SITE}search?q={query}`, 'query-input': 'required name=query' } },
  'cqts/index.html': { '@context': 'https://schema.org', '@type': 'ResearchOrganization', name: 'Center for Quantum and Topological Systems',
    alternateName: 'CQTS', url: `${SITE}cqts/`, logo: `${SITE}brand/cqts-logo.png`, foundingDate: '2021',
    parentOrganization: { '@type': 'CollegeOrUniversity', name: 'New York University Abu Dhabi' } },
};

export const articleJsonld = (m) => {
  const url = `${SITE}wiki/${encodeURIComponent(m.name).replace(/%20/g, '+')}/`;
  return m.kind === 'p'
    ? { '@context': 'https://schema.org', '@type': 'ProfilePage', name: `${m.title} — nLab`, url, description: m.description, mainEntity: { '@type': 'Person', name: m.title } }
    : { '@context': 'https://schema.org', '@type': 'Article', headline: m.title, name: m.title, url, description: m.description, image: SITE + m.image, about: m.fields, inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: 'nLab', url: SITE } };
};
const cleanUrls = (base) => ({
  name: 'clean-urls',
  transformIndexHtml(html, ctx) {
    const key = Object.keys(PAGES).find((k) => ctx.filename.endsWith(`/${k}`) && (k !== 'index.html' || !/\/(wiki|library|forum|cqts)\/index\.html$/.test(ctx.filename)));
    let out = html.replace('<head>', `<head>\n<base href="${base}">`);
    // an article (dev server): its own title, summary and preview image
    const art = key === 'wiki/index.html' && decodeURIComponent((ctx.originalUrl || '').split('?')[0]).match(/^\/wiki\/(.+?)\/?$/);
    if (art) {
      const m = articleMeta(art[1]);
      out = out.replace(/<title>[\s\S]*?<\/title>\n?/, '').replace(/<meta name="description"[^>]*>\n?/, '');
      return out.replace('</head>', `${seoTags({ title: `${m.title} — nLab`, description: m.description, url: `${SITE}wiki/${encodeURIComponent(m.name).replace(/%20/g, '+')}/`, image: m.image, type: 'article', jsonld: articleJsonld(m) })}\n</head>`);
    }
    if (key) {
      const pg = PAGES[key];
      out = out.replace(/<title>[\s\S]*?<\/title>\n?/, '').replace(/<meta name="description"[^>]*>\n?/, '');
      out = out.replace('</head>', `${seoTags({ ...pg, url: SITE + pg.path, jsonld: JSONLD[key] })}\n</head>`);
    }
    return out;
  },
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query = ''] = req.url.split('?');
      if (APP_ROUTES.test(path) && !/\.(js|css|svg|json|png|jpg|woff2?)$/.test(path)) req.url = `/wiki/index.html${query ? `?${query}` : ''}`;
      else if (/^\/(library|forum|cqts)$/.test(path)) req.url = `${path}/${query ? `?${query}` : ''}`;
      else if (/^\/cqts\/[a-z0-9-]+\/?$/.test(path)) req.url = `/cqts/index.html${query ? `?${query}` : ''}`;
      next();
    });
  },
});

export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/nlab-redesign/' : '/';
  return {
    base,
    plugins: [cleanUrls(base)],
    server: { port: 5173, open: true, proxy: nlabProxy },
    preview: { port: 4173, proxy: nlabProxy },
    build: {
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          wiki: resolve(import.meta.dirname, 'wiki/index.html'),
          cqts: resolve(import.meta.dirname, 'cqts/index.html'),
          forum: resolve(import.meta.dirname, 'forum/index.html'),
          library: resolve(import.meta.dirname, 'library/index.html'),
        },
      },
    },
  };
});
