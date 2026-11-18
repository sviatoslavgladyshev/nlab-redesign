// Small stable hash (FNV-1a, 2×32 bit) shared by the build scripts and the browser,
// used to name pre-rendered diagrams after their TikZ source.
export function hashSource(src) {
  const s = src.replace(/\s+/g, ' ').trim();
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
export const TIKZ_RE = /\\begin\{(tikzcd|tikzpicture|xymatrix)\}[\s\S]*?\\end\{\1\}/g;
