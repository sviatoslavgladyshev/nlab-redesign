import { defineConfig } from 'vite';
import { resolve } from 'node:path';

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
};

export default defineConfig({
  base: './', // relative URLs, so the build works under any path (e.g. username.github.io/repo/)
  server: { port: 5173, open: true, proxy: nlabProxy },
  preview: { port: 4173, proxy: nlabProxy },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        page: resolve(import.meta.dirname, 'page.html'),
        cqts: resolve(import.meta.dirname, 'cqts.html'),
      },
    },
  },
});
