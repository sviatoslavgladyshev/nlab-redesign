// Client-side renderer for nLab source (Instiki "Markdown+itex"): Markdown, itex/LaTeX math,
// [[wiki links]], Maruku-style `+-- {: .class #id} … =--` blocks and `{#anchor}` attributes.
// Used for the live preview in the editor and for showing locally saved edits.
// It approximates nLab's server-side renderer closely enough for drafting; the published
// page is still rendered by nLab itself.
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { pageUrl, esc } from './nlab.js';
import { hashSource, TIKZ_RE } from './hash.js';
import { referenceAuthors, referenceLink, referenceTitle, withoutBibliography } from './bibliography.js';

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
md.inline.ruler.before('escape', 'bibliography_cite', (state, silent) => {
  if (!state.env.citations && !state.env.editableCitations) return false;
  if (!state.src.startsWith('\\cite{', state.pos)) return false;
  const match = state.src.slice(state.pos).match(/^\\cite\{([^{}\n]+)\}/);
  if (!match) return false;
  const keys = match[1].split(',').map((key) => key.trim()).filter(Boolean);
  if (!keys.length) return false;
  if (!silent) state.push('bibliography_cite', '', 0).meta = keys;
  state.pos += match[0].length;
  return true;
});
md.renderer.rules.bibliography_cite = (tokens, index, _options, { citations, editableCitations }) => {
  const keys = tokens[index].meta;
  if (editableCitations) return citationChip(keys);
  return '[' + keys.map((key) => {
    const number = citations.get(key);
    return number ? '<a class="bib-cite" href="#nlab-bib-' + number + '">' + number + '</a>' : esc(key);
  }).join(', ') + ']';
};

export function citationChip(keys) {
  return '<span class="bib-cite-chip" contenteditable="false" data-citation="' + esc(keys.join(',')) + '">[' + esc(keys.join(', ')) + ']</span>';
}

function renderBibliography(entries) {
  const items = entries.map((entry, index) => {
    const { fields } = entry;
    const publication = fields.journaltitle || fields.journal || fields.booktitle || fields.publisher || fields.institution;
    const detail = [referenceAuthors(entry), publication, fields.year || fields.date, fields.pages && 'pp. ' + fields.pages]
      .filter(Boolean).map(esc).join(' · ');
    const title = esc(referenceTitle(entry));
    const link = referenceLink(entry);
    return '<li id="nlab-bib-' + (index + 1) + '">' + (link ? '<a href="' + esc(link) + '">' + title + '</a>' : title)
      + (detail ? '<span class="bib-details">' + detail + '</span>' : '') + '</li>';
  }).join('');
  return '<h2 id="nlab-bibliography">Bibliography</h2><ol class="bib-references">' + items + '</ol>';
}

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
    .replace(/\\label\{[^}]*\}/g, '').replace(/\\arrayopts\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
    .replace(/\\coloneq(?!q)/g, '\\coloneqq')
    .replace(/\\tensor\b/g, '\\otimes')
    .replace(/\\mathbf\{\\(alpha|beta|gamma|delta|phi|psi|omega|Omega|Gamma|Delta|Phi|Psi)\}/g, '\\boldsymbol{\\$1}');
}

// itex / nLab commands that KaTeX doesn't know (found by scanning all nLab formulas)
const MACROS = {
  '\\N': '\\mathbb{N}', '\\Z': '\\mathbb{Z}', '\\Q': '\\mathbb{Q}', '\\R': '\\mathbb{R}', '\\C': '\\mathbb{C}',
  '\\Set': '\\mathrm{Set}', '\\Grpd': '\\mathrm{Grpd}', '\\Cat': '\\mathrm{Cat}', '\\Top': '\\mathrm{Top}', '\\Vect': '\\mathrm{Vect}',
  '\\Simp': '\\mathrm{Simp}', '\\Sm': '\\mathrm{Sm}', '\\GL': '\\mathrm{GL}', '\\Hom': '\\mathrm{Hom}',
  '\\underoverset': '\\underset{#1}{\\overset{#2}{#3}}', '\\sslash': '\\mathbin{/\\mkern-6mu/}',
  '\\op': '\\mathrm{op}', '\\esh': '\\int', '\\parr': '\\mathbin{\\text{⅋}}', '\\invamp': '\\mathbin{\\text{⅋}}',
  '\\id': '\\mathrm{id}', '\\Id': '\\mathrm{Id}', '\\widebar': '\\overline{#1}', '\\im': '\\mathrm{im}',
  '\\colim': '\\operatorname*{colim}', '\\qed': '\\blacksquare', '\\ess': '\\mathrm{ess}', '\\dom': '\\mathrm{dom}',
  '\\infinity': '\\infty', '\\tr': '\\mathrm{tr}', '\\Vee': '\\bigvee', '\\bottom': '\\bot', '\\Del': '\\nabla',
  '\\root': '\\sqrt[#1]{#2}', '\\vol': '\\mathrm{vol}', '\\arrayopts': '', '\\cod': '\\mathrm{cod}', '\\Ker': '\\mathrm{Ker}',
  '\\coker': '\\mathrm{coker}', '\\Aut': '\\mathrm{Aut}', '\\End': '\\mathrm{End}', '\\Spec': '\\mathrm{Spec}',
};
// itex allows "\widetilde \widetilde {x}"; KaTeX needs "\widetilde{\widetilde{x}}"
const ACC = '(?:widetilde|widehat|tilde|hat|bar|overline|underline|vec|dot|ddot)';
const ACC_RE = new RegExp(`\\\\${ACC}\\s*(?=\\\\${ACC})`);
function nestAccents(t) {
  const m = t.match(ACC_RE);
  if (!m) return t;
  let i = m.index + m[0].length; // start of the inner accent
  const inner = t.slice(i).match(new RegExp(`^\\\\${ACC}\\s*`));
  let j = i + inner[0].length;
  if (t[j] === '{') { let d = 0; for (; j < t.length; j++) { if (t[j] === '{') d++; else if (t[j] === '}' && --d === 0) { j++; break; } } } else j += 1;
  return `${t.slice(0, m.index)}${m[0].trimEnd()}{${t.slice(i, j)}}${t.slice(j)}`;
}
const decodeEntities = (t) => t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&nbsp;/g, ' ');
// Typeset with KaTeX; on failure retry with fixes for common itex habits, and as a last resort
// show the formula's source quietly (never as a red error).
const renderMath = (tex, displayMode) => {
  let t = decodeEntities(itexToKatex(tex.trim()));
  const macros = { ...MACROS };
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return katex.renderToString(t, { displayMode, throwOnError: true, strict: 'ignore', trust: false, macros });
    } catch (e) {
      const msg = String(e.message || e);
      const undef = msg.match(/Undefined control sequence: \\([A-Za-z]+)/);
      if (undef) { macros[`\\${undef[1]}`] = `\\operatorname{${undef[1]}}`; continue; }
      if (/with no arguments as (sub|super)script/.test(msg)) { t = t.replace(/([_^])\s*(\\[A-Za-z]+)/g, '$1{$2}'); continue; }
      if (/Unexpected end of input in a macro argument/.test(msg) && ACC_RE.test(t)) { t = nestAccents(t); continue; }
      break;
    }
  }
  return `<code class="math-fallback" title="This formula uses notation that can’t be typeset here yet">${esc(tex.trim())}</code>`;
};

const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'section';

// Parse `{: .a .b #id key="v"}` into attributes
function ial(attr) {
  const classes = [...attr.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const id = (attr.match(/#([^\s}.]+)/) || [])[1];
  return { classes, id };
}

// LaTeX-style environments → nLab blocks: \begin{theorem} … \end{theorem}
const ENV_CLASS = {
  definition: 'defn', defn: 'defn', proposition: 'prop', prop: 'prop', theorem: 'theorem', thm: 'theorem', lemma: 'lemma', lem: 'lemma',
  corollary: 'cor', cor: 'cor', example: 'example', examples: 'example', remark: 'remark', rmk: 'remark', remarks: 'remark',
  conjecture: 'conjecture', notation: 'notation', note: 'note', claim: 'claim', assumption: 'assumption', exercise: 'exercise', proof: 'proof',
};
const ENV_LABEL = { defn: 'Definition', prop: 'Proposition', theorem: 'Theorem', lemma: 'Lemma', cor: 'Corollary', example: 'Example', remark: 'Remark',
  conjecture: 'Conjecture', notation: 'Notation', note: 'Note', claim: 'Claim', assumption: 'Assumption', exercise: 'Exercise', proof: 'Proof' };
const ENV_NAMES = Object.keys(ENV_CLASS).join('|');
function latexEnvs(s) {
  return s
    .replace(new RegExp(String.raw`^[ \t]*\\begin\{(${ENV_NAMES})\}(?:\[([^\]\n]*)\])?[ \t]*(?:\\label\{([^}\s]+)\})?[ \t]*$`, 'gm'), (_, env, title, label) => {
      const cls = ENV_CLASS[env];
      const head = `###### ${ENV_LABEL[cls]}${title ? ` (${title})` : ''}`;
      const id = label ? ` #${label}` : '';
      return cls === 'proof' ? `+-- {: .proof${id}}\n${head}\n` : `+-- {: .num_${cls}${id}}\n${head}\n`;
    })
    .replace(new RegExp(String.raw`[ \t]*\\end\{(${ENV_NAMES})\}[ \t]*$`, 'gm'), '\n\n=--')
    .replace(/^[ \t]*\\begin\{(center|centre)\}[ \t]*$/gm, '+-- {: .center}\n')
    .replace(/^[ \t]*\\end\{(center|centre)\}[ \t]*$/gm, '\n=--')
    .replace(/^[ \t]*\\(section|subsection|subsubsection)\*?\{([^}]*)\}[ \t]*(?:\\label\{([\w-]+)\})?[ \t]*$/gm, (_, lvl, title, label) =>
      `${{ section: '##', subsection: '###', subsubsection: '####' }[lvl]} ${title}${label ? `\n{#${label}}` : ''}`);
}

// Images: \begin{imagefromfile} "file_name": "x.png", "width": 300, … \end{imagefromfile}
function images(s, store) {
  return s.replace(/\\begin\{imagefromfile\}([\s\S]*?)\\end\{imagefromfile\}/g, (_, body) => {
    const get = (k) => (body.match(new RegExp(`"${k}"\\s*:\\s*"?([^",\\n}]+)"?`)) || [])[1]?.trim();
    const file = get('file_name');
    if (!file) return '';
    const width = get('width');
    const unit = get('unit') || 'px';
    const caption = get('caption');
    const float = get('float');
    return `\n\n${ph(store, `<figure class="nfig${float === 'right' || float === 'left' ? ` f-${float}` : ''}"><img src="https://ncatlab.org/nlab/files/${esc(encodeURIComponent(file))}" alt="${esc(caption || file)}" loading="lazy"${width ? ` style="max-width:${esc(width)}${esc(unit)}"` : ''}>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`)}\n\n`;
  });
}

// Diagrams (tikzcd / tikzpicture / xymatrix): the nLab's own rendering, saved at build time
function diagrams(s, store) {
  return s.replace(TIKZ_RE, (block) => `\n\n${ph(store, `<figure class="diagram"><img src="snapshot/tikz/${hashSource(block)}.svg" alt="Diagram" loading="lazy" data-diagram><details><summary>Diagram source</summary><pre>${esc(block)}</pre></details></figure>`)}\n\n`);
}

// Replace [[!include page]] by that page's source (two levels deep).
export async function expandIncludes(src, getSource, depth = 2) {
  const re = /^[ \t]*\[\[!include\s+([^\]|]+?)\s*\]\][ \t]*$/gm;
  const names = [...new Set([...src.matchAll(re)].map((m) => m[1]))];
  if (!names.length || depth <= 0) return src;
  const got = new Map(await Promise.all(names.map(async (n) => {
    try { return [n, await expandIncludes((await getSource(n)).replace(/^\s*\[\[!redirects [^\]]*\]\]\s*$/gm, ''), getSource, depth - 1)]; } catch { return [n, null]; }
  })));
  return src.replace(re, (line, n) => got.get(n) ?? line);
}

// The source of the context sidebar (`+-- {: .rightHandSide} … =--`), if any
export function contextSource(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^\s*\+--\s*\{:?[^}]*\.rightHandSide/.test(l));
  if (start < 0) return '';
  let depth = 0;
  for (let k = start; k < lines.length; k++) {
    if (/^\s*\+--/.test(lines[k])) depth++;
    else if (/^\s*=--\s*$/.test(lines[k]) && --depth === 0) return lines.slice(start + 1, k).join('\n');
  }
  return '';
}

/**
 * Render nLab source to HTML.
 *   context: true keeps `.hide` blocks (used for the context sidebar)
 * Inline math keeps its TeX in data-tex, wiki links their target in data-wiki,
 * so the visual editor can turn the HTML back into source.
 */
// The PDF title page, set in the source the LaTeX way: \title{…}, \author{…}, \date{…} (each on its own line).
// They only shape the PDF; the page itself never shows them.
const TITLE_LINE = /^[ \t]*\\(title|author|date)\{((?:[^{}]|\{[^{}]*\})*)\}[ \t]*$/gm;
export function titleFields(src) {
  const out = {};
  for (const [, field, value] of String(src).matchAll(TITLE_LINE)) if (!(field in out)) out[field] = value.trim();
  return out;
}
// A page may be written as a whole LaTeX document:
//   \documentclass{article} \usepackage… \title… \begin{document} \maketitle  …page…  \end{document}
// The preamble and the wrapper only shape the PDF; the page shows the body.
const DOC_START = /^[\s\S]*?\\begin\{document\}[ \t]*\n?/;
export const hasLatexDocument = (src) => /\\documentclass/.test(src) && /\\begin\{document\}/.test(src);
export function latexDocument(src) {
  const text = String(src);
  if (!hasLatexDocument(text)) return { preamble: '', body: text, end: '' };
  const start = text.match(DOC_START)[0];
  const rest = text.slice(start.length);
  const endAt = rest.search(/^[ \t]*\\end\{document\}/m);
  return { preamble: start, body: endAt < 0 ? rest : rest.slice(0, endAt), end: endAt < 0 ? '' : rest.slice(endAt) };
}
export function withLatexDocument(body, { title = '', author = '', date = '\\today' } = {}) {
  return `\\documentclass{article}\n\\usepackage{amsmath, amssymb, amsthm}\n\n\\title{${title}}\n\\author{${author}}\n\\date{${date}}\n\n\\begin{document}\n\\maketitle\n\n${(String(body).replace(/^\n+/, '').replace(/\s*$/, '') + '\n\n').replace(/^\n\n$/, '\n')}\\end{document}\n`;
}
export const withoutTitleFields = (src) => latexDocument(src).body.replace(TITLE_LINE, '').replace(/^[ \t]*\\maketitle[ \t]*$/gm, '');
// what goes to ncatlab.org: the page without the LaTeX document wrapper or title lines
export const nlabSource = (src) => withoutTitleFields(src).replace(/^\n+/, '');

export function renderSource(src, { context = false, bibliography, editableCitations = false } = {}) {
  src = withoutTitleFields(src);
  const math = newStore('m');
  const links = newStore('l');
  let s = latexEnvs(withoutBibliography(src).replace(/\r\n?/g, '\n'));
  s = diagrams(images(s, links), links);
  s = s.replace(/\\begin\{svg\}[\s\S]*?\\end\{svg\}/g, '');

  // 1. Math first, so nothing below touches TeX. Order: display, then inline.
  const display = (t) => ph(math, `<div class="eq" data-tex="${esc(t.trim())}">${renderMath(t, true)}</div>`);
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => display(t));
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => display(t));
  s = s.replace(/\\begin\{(equation\*?|align\*?)\}([\s\S]+?)\\end\{\1\}/g, (_, env, t) => display(env.startsWith('align') ? `\\begin{aligned}${t}\\end{aligned}` : t));
  s = s.replace(/(^|[^\\$])\$(?!\$)((?:\\\$|[^$\n])*?[^\s$](?:\\\$|[^$\n])*?)\$/g, (_, pre, t) => pre + ph(math, `<span class="m" data-tex="${esc(t)}">${renderMath(t, false)}</span>`));

  // Text-mode LaTeX (outside math): layout commands are dropped, formatting commands applied
  s = s.replace(/^[ \t]*\\(?:newpage|clearpage)[ \t]*$/gm, '\n<div class="page-break"></div>\n');
  s = s.replace(/^[ \t]*\\(tableofcontents|maketitle|linebreak|newline|noindent|par|medskip|bigskip|smallskip|vfill|hfill|centering)\b[ \t]*$/gm, '');
  s = s.replace(/\\(vspace|hspace)\*?\{[^}]*\}/g, '');
  s = s.replace(/\\(linebreak|newline)\b|\\\\(?=\s*$)/gm, '<br>');
  s = s.replace(/\\(noindent|medskip|bigskip|smallskip|par)\b\s*/g, '');
  s = s.replace(/\\(emph|textit)\{([^{}]*)\}/g, '_$2_');
  s = s.replace(/\\textbf\{([^{}]*)\}/g, '**$1**');
  s = s.replace(/\\texttt\{([^{}]*)\}/g, '`$1`');
  s = s.replace(/\\(?:textrm|text|mbox)\{([^{}]*)\}/g, '$1');

  // \label / \ref / \eqref outside math: anchors and links that show the referenced number
  s = s.replace(/\\label\{([^}\s]+)\}/g, (_, id) => ph(links, `<a id="${esc(id)}" class="label-anchor"></a>`));
  s = s.replace(/\\(eq)?ref\{([^}\s]+)\}/g, (_, eq, id) => ph(links, `${eq ? '(' : ''}<a class="ref" href="#${esc(id)}" data-ref="${esc(id)}">${esc(id)}</a>${eq ? ')' : ''}`));

  // 2. Wiki links and directives
  s = s.replace(/^\s*\[\[!redirects [^\]]*\]\]\s*$/gm, '');
  s = s.replace(/\[\[!include ([^\]|]+)\]\]/g, (_, p) => ph(links, `<p class="included">Included from <a href="${esc(pageUrl(p.trim()))}">${esc(p.trim())}</a></p>`));
  s = s.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, target, text) => {
    const [name, anchor] = target.trim().split('#');
    return ph(links, `<a href="${esc(pageUrl(name))}${anchor ? `#${esc(anchor)}` : ''}" data-wiki="${esc(target.trim())}">${esc((text || target).trim())}</a>`);
  });

  // 3. Line-level structure: +-- blocks, {#id} anchors, tables of contents
  const lines = s.split('\n');
  const out = [];
  const stack = [];
  let skip = 0; // depth inside a block we drop (the context sidebar)
  for (let k = 0; k < lines.length; k++) {
    let line = lines[k];
    const open = line.match(/^\s*\+--\s*(\{:?([^}]*)\})?\s*$/);
    if (open) {
      const { classes, id } = ial(open[2] || '');
      const drop = skip > 0 || classes.includes('rightHandSide') || (!context && classes.includes('hide'));
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
      if (p >= 0 && /^#{1,6}\s/.test(out[p])) out[p] += ` ${anchor[1]}`;
      else out.push(`<a id="${anchor[1]}"></a>`);
      continue;
    }
    if (/^\s*\{:[^}]*\}\s*$/.test(line)) continue; // other Maruku attribute lists
    line = line.replace(/^(#{1,6})(?=[^#\s])/, '$1 '); // "###Context###"
    line = line.replace(/^(#{1,6}\s.*?)\s*\{#([\w-]+)\}\s*$/, '$1 $2').replace(/^(#{1,6}\s.*?)\s*#+\s*$/, '$1');
    line = line.replace(/\{#([\w-]+)\}/g, '<a id="$1"></a>'); // inline anchors, e.g. in reference lists
    out.push(line);
  }

  // 4. Markdown, then restore placeholders and heading ids
  const citations = bibliography && new Map(bibliography.map(({ key }, i) => [key, i + 1]));
  let html = md.render(out.join('\n'), { citations, editableCitations });
  html = html.replace(new RegExp(`<p>\\s*(${A}[ml]\\d+${Z})\\s*</p>`, 'g'), '$1'); // display math / includes not wrapped in <p>
  html = html.replace(/<(h[1-6])>([\s\S]*?)<\/\1>/g, (_, h, inner) => {
    const m = inner.match(/\s*([\w-]+)\s*$/);
    const text = inner.replace(/\s*[\w-]+\s*$/, '');
    return `<${h} id="${m ? m[1] : slug(text)}"${m ? ` data-anchor="${m[1]}"` : ''}>${text}</${h}>`;
  });
  html = unph(unph(html, links), math);
  return bibliography?.length ? html + renderBibliography(bibliography) : html;
}

// After environments are numbered: show "3" instead of the label in \ref links
export function resolveRefs(root) {
  root.querySelectorAll('a.ref[data-ref]').forEach((a) => {
    let t = root.querySelector(`[id="${CSS.escape(a.dataset.ref)}"]`);
    t = t?.closest('[class*="num_"]') || t;
    const no = t?.querySelector(':scope > h6')?.textContent.match(/\d+/)?.[0];
    a.textContent = no || '↑';
  });
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
