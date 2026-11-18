// Client-side renderer for nLab source (Instiki "Markdown+itex"): Markdown, itex/LaTeX math,
// [[wiki links]], Maruku-style `+-- {: .class #id} … =--` blocks and `{#anchor}` attributes.
// Used for the live preview in the editor and for showing locally saved edits.
// It approximates nLab's server-side renderer closely enough for drafting; the published
// page is still rendered by nLab itself.
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { pageUrl, esc } from './nlab.js';

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

// Placeholders survive Markdown untouched (private-use code points).
// Each store gets its own marker letter so math and link placeholders cannot collide.
const A = String.fromCharCode(0xE000), Z = String.fromCharCode(0xE001);
const ph = (store, html) => `${A}${store.mark}${store.push(html) - 1}${Z}`;
const unph = (s, store) => s.replace(new RegExp(`${A}${store.mark}(\\d+)${Z}`, 'g'), (_, i) => store[+i]);
const newStore = (mark) => Object.assign([], { mark });

// itex's `\array{ a & b \\ c & d }` → `\begin{array}{cc} … \end{array}` (KaTeX has no \array{})
function itexToKatex(tex) {
  let out = tex, i;
  while ((i = out.indexOf('\\array{')) >= 0) {
    let depth = 0, j = i + 6;
    for (; j < out.length; j++) {
      if (out[j] === '{') depth++;
      else if (out[j] === '}' && --depth === 0) break;
    }
    const body = out.slice(i + 7, j);
    const cols = Math.max(1, ...body.split(/\\\\/).map((row) => row.split('&').length));
    out = `${out.slice(0, i)}\\begin{array}{${'c'.repeat(cols)}}${body}\\end{array}${out.slice(j + 1)}`;
  }
  return out
    .replace(/\\coloneq(?!q)/g, '\\coloneqq')
    .replace(/\\tensor\b/g, '\\otimes')
    .replace(/\\mathbf\{\\(alpha|beta|gamma|delta|phi|psi|omega|Omega|Gamma|Delta|Phi|Psi)\}/g, '\\boldsymbol{\\$1}');
}

const MACROS = { '\\N': '\\mathbb{N}', '\\Z': '\\mathbb{Z}', '\\Q': '\\mathbb{Q}', '\\R': '\\mathbb{R}', '\\C': '\\mathbb{C}', '\\Set': '\\mathrm{Set}', '\\Grpd': '\\mathrm{Grpd}' };
const renderMath = (tex, displayMode) => {
  try {
    return katex.renderToString(itexToKatex(tex.trim()), { displayMode, throwOnError: false, strict: 'ignore', trust: false, macros: { ...MACROS } });
  } catch {
    return `<code class="math-error">${esc(tex)}</code>`;
  }
};

const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'section';

// Parse `{: .a .b #id key="v"}` into attributes
function ial(attr) {
  const classes = [...attr.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const id = (attr.match(/#([\w-]+)/) || [])[1];
  return { classes, id };
}

export function renderSource(src) {
  const math = newStore('m');
  const links = newStore('l');
  let s = src.replace(/\r\n?/g, '\n');

  // 1. Math first, so nothing below touches TeX. Order: display, then inline.
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => `${ph(math, `<div class="eq">${renderMath(t, true)}</div>`)}`);
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => `${ph(math, `<div class="eq">${renderMath(t, true)}</div>`)}`);
  s = s.replace(/\\begin\{(equation\*?|align\*?)\}([\s\S]+?)\\end\{\1\}/g, (_, env, t) =>
    `${ph(math, `<div class="eq">${renderMath(env.startsWith('align') ? `\\begin{aligned}${t}\\end{aligned}` : t, true)}</div>`)}`);
  s = s.replace(/(^|[^\\$])\$(?!\s)((?:\\\$|[^$\n])+?)\$/g, (_, pre, t) => pre + ph(math, renderMath(t, false)));

  // 2. Wiki links and directives
  s = s.replace(/^\s*\[\[!redirects [^\]]*\]\]\s*$/gm, '');
  s = s.replace(/\[\[!include ([^\]|]+)\]\]/g, (_, p) => ph(links, `<p class="included">Included from <a href="${esc(pageUrl(p.trim()))}">${esc(p.trim())}</a></p>`));
  s = s.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, target, text) => {
    const [name, anchor] = target.trim().split('#');
    return ph(links, `<a href="${esc(pageUrl(name))}${anchor ? `#${esc(anchor)}` : ''}">${esc((text || target).trim())}</a>`);
  });

  // 3. Line-level structure: +-- blocks, {#id} anchors, tables of contents
  const lines = s.split('\n');
  const out = [];
  const stack = [];
  let skip = 0; // depth inside a block we drop (the context sidebar)
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const open = line.match(/^\s*\+--\s*(\{:?([^}]*)\})?\s*$/);
    if (open) {
      const { classes, id } = ial(open[2] || '');
      const drop = skip > 0 || classes.includes('rightHandSide') || classes.includes('hide');
      stack.push(drop);
      if (drop) { skip++; continue; }
      out.push('', `<div${classes.length ? ` class="${classes.join(' ')}"` : ''}${id ? ` id="${id}"` : ''}>`, '');
      continue;
    }
    if (/^\s*=--\s*$/.test(line)) {
      const drop = stack.pop();
      if (drop) { skip--; continue; }
      out.push('', '</div>', '');
      continue;
    }
    if (skip) continue;
    if (/^\s*#+\s*Contents\s*#*\s*$/i.test(line) || /^\s*\*\s*table of contents\s*$/i.test(line) || /^\s*\{:\s*toc\s*\}\s*$/.test(line)) continue;
    const anchor = line.match(/^\s*\{#([\w-]+)\}\s*$/);
    if (anchor) {
      // attach to the preceding heading, otherwise leave an anchor
      let p = out.length - 1;
      while (p >= 0 && !out[p].trim()) p--;
      if (p >= 0 && /^#{1,6}\s/.test(out[p])) out[p] += ` \uE002${anchor[1]}\uE003`;
      else out.push(`<a id="${anchor[1]}"></a>`);
      continue;
    }
    if (/^\s*\{:[^}]*\}\s*$/.test(line)) continue; // other Maruku attribute lists
    // `## Heading ##` and `## Heading {#id}`
    out.push(line.replace(/^(#{1,6}\s.*?)\s*\{#([\w-]+)\}\s*$/, '$1 \uE002$2\uE003').replace(/^(#{1,6}\s.*?)\s+#+\s*$/, '$1'));
  }

  // 4. Markdown, then restore placeholders and heading ids
  let html = md.render(out.join('\n'));
  html = html.replace(new RegExp(`<p>\\s*(${A}[ml]\\d+${Z})\\s*</p>`, 'g'), '$1'); // display math / includes not wrapped in <p>
  html = html.replace(/<(h[1-6])>([\s\S]*?)<\/\1>/g, (_, h, inner) => {
    const m = inner.match(/\s*\uE002([\w-]+)\uE003\s*$/);
    const text = inner.replace(/\s*\uE002[\w-]+\uE003\s*$/, '');
    return `<${h} id="${m ? m[1] : slug(text)}">${text}</${h}>`;
  });
  html = unph(unph(html, links), math);
  return html;
}

/* ---------- Line diff (for "Changes") ---------- */
export function diffLines(a, b) {
  const A = a.replace(/\r\n?/g, '\n').split('\n');
  const B = b.replace(/\r\n?/g, '\n').split('\n');
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf), b2 = B.slice(pre, B.length - suf);
  const n = a2.length, m = b2.length;
  const ops = [];
  if (n * m > 4e6) { // too large for LCS: show as replace
    a2.forEach((l) => ops.push(['-', l]));
    b2.forEach((l) => ops.push(['+', l]));
  } else {
    const L = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      L[i * (m + 1) + j] = a2[i] === b2[j] ? L[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(L[(i + 1) * (m + 1) + j], L[i * (m + 1) + j + 1]);
    }
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a2[i] === b2[j]) { ops.push([' ', a2[i]]); i++; j++; }
      else if (j < m && (i === n || L[i * (m + 1) + j + 1] >= L[(i + 1) * (m + 1) + j])) { ops.push(['+', b2[j]]); j++; }
      else { ops.push(['-', a2[i]]); i++; }
    }
  }
  return { ops, offset: pre, added: ops.filter((o) => o[0] === '+').length, removed: ops.filter((o) => o[0] === '-').length };
}
