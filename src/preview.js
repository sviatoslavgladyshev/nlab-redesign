// Short previews of pages (first sentences of their "Idea"), for cards in articles and the library.
import { fetchSource } from './nlab.js';
import { renderSource } from './markup.js';

const excerpts = new Map();
export function excerptFor(name) {
  if (!excerpts.has(name)) {
    excerpts.set(name, (async () => {
      try { const c = sessionStorage.getItem(`nlab-ex:${name}`); if (c != null) return c; } catch { /* ignore */ }
      const { source } = await fetchSource(name);
      const body = source.replace(/^\s*\+--[^\n]*rightHandSide[\s\S]*?\n=--\s*\n=--\s*\n=--/m, '');
      const part = body.split(/^#{2,3}\s+(?:Idea|Definition|Statement)\b.*$/m)[1] || body;
      const para = part.split(/\n\s*\n/).map((x) => x.trim())
        .find((x) => x.length > 50 && !/^([+#*{=<|>\-]|\$\$|\\\[|\[\[!)/.test(x) && !/^\s*\{:/.test(x)) || '';
      // split into sentences without breaking inside formulas or after "cor.", "def.", "e.g."…
      const math = [];
      const flat = para.replace(/\s+/g, ' ').replace(/\$[^$]*\$/g, (m) => `\u0001${math.push(m) - 1}\u0002`);
      const sentences = flat.split(/(?<=[.!?])\s+(?=[A-Z_*[])/);
      let out = '';
      for (const t of sentences) { if ((out + t).length > 230 && out) break; out += `${t} `; }
      out = out.replace(/\u0001(\d+)\u0002/g, (_, i) => math[+i]);
      const html = out ? renderSource(out.trim()) : '';
      try { sessionStorage.setItem(`nlab-ex:${name}`, html); } catch { /* full */ }
      return html;
    })().catch(() => ''));
  }
  return excerpts.get(name);
}

// Fill a preview box; `missing` pages get an invitation instead
export async function fillPreview(box, name, missing = false) {
  if (!box) return;
  if (missing) { box.innerHTML = '<em>Not written yet. Be the first to write it.</em>'; return; }
  const html = await excerptFor(name);
  if (!html) { box.remove(); return; }
  box.innerHTML = html;
  box.querySelectorAll('a').forEach((x) => x.replaceWith(...x.childNodes));
  box.querySelectorAll('p').forEach((x) => x.replaceWith(...x.childNodes, ' '));
  box.classList.add('in');
}
