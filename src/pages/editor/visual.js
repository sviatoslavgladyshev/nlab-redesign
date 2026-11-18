// Visual editing of nLab source.
// The page is one contenteditable document: paragraphs, headings and lists are edited as
// normal text; complex blocks (theorem environments, displayed equations, tables, HTML, the
// context sidebar…) are embedded cards that open a LaTeX editor in place. Blocks that are not
// touched keep their exact original source, so visual editing never rewrites unrelated text.
import katex from 'katex';
import { citationChip, renderSource, titleFields } from '../../core/markup.js';
import { bibliographyBlock, citationSource, withoutBibliography } from '../../core/bibliography.js';
import { clean, esc, pageUrl, decodeName } from '../../core/nlab.js';
import { createSourceEditor } from '../../ui/codemirror.js';
import { icons } from '../../ui/app.js';

/* ---------- Markdown tables ---------- */
const isTable = (src) => {
  const lines = src.trim().split('\n');
  return lines.length >= 2 && lines.every((l) => /^\s*\|.*\|\s*$/.test(l)) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[1]);
};
const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
function parseTable(src) {
  const lines = src.trim().split('\n');
  const rows = [lines[0], ...lines.slice(2)].map(splitRow);
  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(width - r.length).fill('')]);
}
const tableSource = (rows) => {
  const cell = (c) => ` ${c.replace(/\|/g, '\\|') || ' '} `.replace(/^ {2,}| {2,}$/g, ' ');
  return [rows[0], rows[0].map(() => '---'), ...rows.slice(1)].map((r, i) => (i === 1 ? `|${r.join('|')}|` : `|${r.map(cell).join('|')}|`)).join('\n');
};

/* ---------- Splitting source into blocks ---------- */
const pageBreak = /^\\(?:newpage|clearpage)$/;
export function splitBlocks(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let cur = [], depth = 0, inMath = false, gap = '';
  // a whole LaTeX document: everything up to \begin{document} (and \maketitle) is one setup block
  let preamble = /\\documentclass/.test(src) && /\\begin\{document\}/.test(src) ? 'head' : '';
  const flush = () => { if (cur.length) { blocks.push({ src: cur.join('\n'), sep: '' }); cur = []; } };
  for (const line of lines) {
    if (preamble === 'head') {
      cur.push(line);
      if (/^\s*\\begin\{document\}/.test(line)) preamble = 'title';
      continue;
    }
    if (preamble === 'title') {
      preamble = '';
      if (/^\s*\\maketitle\s*$/.test(line)) { cur.push(line); flush(); gap = ''; continue; }
      flush();
    }
    if (depth === 0 && !inMath && pageBreak.test(line.trim())) {
      flush();
      blocks.push({ src: line, sep: '\n' });
      gap = '';
      continue;
    }
    if (!line.trim() && depth === 0 && !inMath) {
      if (cur.length) { flush(); gap = '\n'; } else gap += '\n';
      if (blocks.length) blocks[blocks.length - 1].sep = `\n${gap}`;
      continue;
    }
    // indented continuation (e.g. a list item's second paragraph) stays with the previous block
    if (!cur.length && blocks.length && /^ {2,}\S/.test(line) && /^\s*([*+-]|\d+\.)\s/m.test(blocks[blocks.length - 1].src)) {
      const prev = blocks.pop();
      cur = [prev.src + prev.sep.replace(/\n$/, '')];
    }
    // a lone {#anchor} line belongs to the block before it
    if (!cur.length && blocks.length && /^\s*\{#[\w-]+\}\s*$/.test(line)) {
      const prev = blocks.pop();
      cur = [prev.src];
    }
    cur.push(line);
    gap = '';
    if (/^\s*\+--/.test(line)) depth++;
    else if (/^\s*=--\s*$/.test(line)) depth = Math.max(0, depth - 1);
    // LaTeX environments (other than inline math ones) keep their blank lines inside one block
    for (const m of line.matchAll(/\\(begin|end)\{(\w+\*?)\}/g)) {
      if (/^(aligned|array|matrix|pmatrix|bmatrix|cases|split|gathered|document)$/.test(m[2])) continue;
      depth = m[1] === 'begin' ? depth + 1 : Math.max(0, depth - 1);
    }
    if (((line.match(/\$\$/g) || []).length % 2) === 1) inMath = !inMath;
  }
  flush();
  if (blocks.length) blocks[blocks.length - 1].sep = '\n';
  return blocks;
}
export const joinBlocks = (blocks) => blocks.map((b, i) => b.src + (i < blocks.length - 1 ? (b.sep && b.sep.length >= 2 ? b.sep : '\n\n') : (b.sep || '\n'))).join('');

// Which blocks can be edited as plain text
const COMPLEX = /^\s*\+--|^\s*=--|\$\$|\\\[|\\begin\{|^\s*\||<\/?[a-zA-Z]|^ {4}|^\t|\[\[!|^\s*\{:|^\s*```|^\s*\*\s*table of contents|^#+\s*Contents\s*#*\s*$|^ {2,}[*+-]\s|^\s*\[\^|\{:/m;
const isText = (src) => !COMPLEX.test(src);

function metaLabel(src) {
  if (/\.rightHandSide/.test(src)) return ['panel-right', 'Context sidebar', 'The navigation shown beside the page.'];
  if (/\\documentclass/.test(src)) {
    const cls = src.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]*)\}/)?.[1] || 'article';
    const t = src.match(/\\title\{([^}]*)\}/)?.[1];
    return ['file-code', 'LaTeX document setup', [cls, t && `“${t}”`, 'edit the class, packages, title, author and date'].filter(Boolean).join(' · ')];
  }
  if (/^\s*\\(title|author|date)\{/m.test(src) && !src.replace(/^[ \t]*\\(title|author|date|maketitle)(\{(?:[^{}]|\{[^{}]*\})*\})?[ \t]*$/gm, '').trim()) {
    const t = src.match(/\\title\{([^}]*)\}/)?.[1];
    return ['type', 'PDF title page', t ? `“${t}”, with author and date` : 'Title, author and date for the PDF'];
  }
  if (/table of contents|^#+\s*Contents/im.test(src)) return ['list-tree', 'Table of contents', 'Generated automatically.'];
  const r = [...src.matchAll(/\[\[!redirects\s+([^\]]+)\]\]/g)].map((m) => m[1].trim());
  if (r.length && r.join('').length >= src.replace(/\s|\[\[!redirects[^\]]*\]\]/g, '').length) return ['link', 'Other names for this page', r.join(' · ')];
  return null;
}

/* ---------- HTML → source ---------- */
function inline(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/ /g, ' ').replace(/​/g, ''); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName;
    if (n.classList.contains('bib-cite-chip') && n.dataset.citation) { out += citationSource(n.dataset.citation.split(',')); continue; }
    if (n.classList.contains('m')) { out += `$${n.dataset.tex || ''}$`; continue; }
    if (n.classList.contains('katex')) continue;
    if (tag === 'BR') { if (n.nextSibling) out += '<br>'; continue; }
    const inner = inline(n);
    if (tag === 'B' || tag === 'STRONG') out += inner.trim() ? `**${inner}**` : inner;
    else if (tag === 'I' || tag === 'EM') out += inner.trim() ? `_${inner}_` : inner;
    else if (tag === 'CODE') out += `\`${n.textContent}\``;
    else if (tag === 'A') {
      const href = n.getAttribute('href') || '';
      if (!href && n.id) { out += `{#${n.id}}`; continue; }
      const wiki = n.dataset.wiki || (href.startsWith('wiki/') ? decodeName(href.slice(5).split(/[#?]/)[0].replace(/\/$/, '')) : null);
      if (wiki) out += inner.trim() === wiki ? `[[${wiki}]]` : `[[${wiki}|${inner.trim()}]]`;
      else out += `[${inner}](${href})`;
    } else if (tag === 'SUP' || tag === 'SUB') out += `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`;
    else out += inner;
  }
  return out;
}
function listToSource(list, indent = '') {
  let k = 0;
  return [...list.children].filter((li) => li.tagName === 'LI').map((li) => {
    k += 1;
    const sub = [...li.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
    const clone = li.cloneNode(true);
    clone.querySelectorAll(':scope > ul, :scope > ol').forEach((x) => x.remove());
    const paras = clone.querySelectorAll(':scope > p');
    const text = paras.length ? [...paras].map(inline).join(' ') : inline(clone);
    const bullet = list.tagName === 'OL' ? `${k}. ` : '* ';
    return `${indent}${bullet}${text.trim()}${sub.map((s) => `\n${listToSource(s, `${indent}    `)}`).join('')}`;
  }).join('\n');
}
function blockToSource(el) {
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag)) {
    const text = inline(el).trim();
    return `${'#'.repeat(+tag[1])} ${text}${el.dataset.anchor ? `\n {#${el.dataset.anchor}}` : ''}`;
  }
  if (tag === 'UL' || tag === 'OL') return listToSource(el);
  if (tag === 'BLOCKQUOTE') return [...el.children].map(elementToSource).join('\n\n').split('\n').map((l) => `> ${l}`).join('\n');
  if (tag === 'HR') return '* * *';
  return inline(el).trim();
}

const alignments = ['left', 'center', 'right', 'justify'];
const blockAlignment = (el) => el.style.textAlign || el.getAttribute('align');
const alignmentBlock = /^\+-- \{: \.align-(left|center|right|justify)\}\n([\s\S]*?)\n=--$/;
function elementToSource(el) {
  const source = blockToSource(el);
  const alignment = blockAlignment(el);
  return source && alignments.includes(alignment) ? `+-- {: .align-${alignment}}\n${source}\n=--` : source;
}

const fp = (els) => els.map((el) => el.outerHTML).join('');

/* ---------- The visual document ---------- */
export class VisualDoc {
  constructor(root, { onChange, onActive, signal } = {}) {
    this.root = root;
    this.onChange = onChange;
    this.onActive = onActive;
    this.blocks = [];
    this.timer = 0;
    root.classList.add('vdoc', 'a-body');
    root.contentEditable = 'true';
    root.dataset.placeholder = 'Start writing…';
    root.spellcheck = true;
    document.execCommand?.('defaultParagraphSeparator', false, 'p');
    root.addEventListener('input', (e) => this.handleInput(e), { signal });
    root.addEventListener('paste', (e) => {
      if (e.target.closest?.('.v-island')) return;
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    }, { signal });
    root.addEventListener('click', (e) => this.handleClick(e), { signal });
    root.addEventListener('keydown', (e) => this.handleKey(e), { signal });
    document.addEventListener('selectionchange', () => { if (this.root.contains(document.activeElement)) this.onActive?.(this.currentBlockType()); }, { signal });
  }

  load(source) {
    this.bibliography = bibliographyBlock(source);
    this.trail = (source.match(/\s*$/) || [''])[0];
    source = withoutBibliography(source);
    this.lead = (source.match(/^\s*\n/) || [''])[0];
    this.blocks = splitBlocks(source);
    this.render();
  }

  render() {
    // Each block is parsed on its own, so unbalanced HTML in one block can't swallow the next
    const frag = document.createDocumentFragment();
    this.blocks.forEach((b, i) => {
      frag.append(...this.blockNodes(b, i));
    });
    const tail = document.createElement('p');
    tail.className = 'v-tail';
    tail.innerHTML = '<br>';
    frag.append(tail);
    this.root.replaceChildren(frag);
    this.updatePlaceholder();
    clean(this.root);
    this.root.querySelectorAll('.m').forEach((m) => { m.contentEditable = 'false'; });
    icons();
    this.fingerprints = new Map();
    this.groups().forEach((els, i) => this.fingerprints.set(i, fp(els)));
  }

  // DOM nodes for one block. Rendered HTML is parsed inside its own container,
  // so unbalanced markup can never leak into the surrounding document.
  blockNodes(b, i) {
    if (pageBreak.test(b.src.trim())) {
      const marker = this.pageBreakNode(b.src);
      marker.dataset.b = String(i);
      return [marker];
    }
    const island = (cls, inner, button) => {
      const el = document.createElement('div');
      el.className = `v-island ${cls}`.trim();
      el.contentEditable = 'false';
      el.dataset.b = String(i);
      el.append(inner);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'v-edit';
      btn.textContent = button;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'v-del';
      del.title = 'Remove (or select it and press Delete)';
      del.setAttribute('aria-label', 'Remove this block');
      del.innerHTML = '<i data-lucide="trash-2"></i>';
      const tools = document.createElement('div');
      tools.className = 'v-tools';
      tools.append(btn, del);
      el.append(tools);
      return [el];
    };
    if (/^\s*\\end\{document\}\s*$/.test(b.src)) return island('v-quiet', document.createTextNode(''), ''); // kept, not shown
    // the document setup shows as the title page, like the top of a Word document
    if (/\\documentclass/.test(b.src)) {
      const f = titleFields(b.src);
      const tex = (t) => esc(t || '').replace(/\\today/g, new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })).replace(/\\\\|\\and\b/g, ' · ').replace(/[{}]/g, '');
      const page = document.createElement('div');
      page.className = 'v-titlepage';
      // title, author and date are typed straight into the page, like in a word processor
      const field = (tag, name, value, hint) => `<${tag} contenteditable="plaintext-only" spellcheck="${name !== 'date'}" data-field="${name}" data-placeholder="${hint}">${tex(value)}</${tag}>`;
      page.innerHTML = field('h1', 'title', f.title, 'Title') + field('p', 'author', f.author, 'Author') + field('p', 'date', f.date ?? '\\today', 'Date');
      const shown = { title: tex(f.title), author: tex(f.author), date: tex(f.date ?? '\\today') };
      page.addEventListener('input', (e) => {
        const el = e.target.closest('[data-field]');
        if (!el) return;
        const name = el.dataset.field;
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        // the date stays \today until you actually change it
        const value = name === 'date' && text === shown.date.replace(/&[a-z]+;/g, '') ? (f.date ?? '\\today') : text.replace(/[{}\\]/g, '');
        const line = new RegExp(`^([ \\t]*\\\\${name}\\{)((?:[^{}]|\\{[^{}]*\\})*)(\\}[ \\t]*)$`, 'm');
        b.src = line.test(b.src) ? b.src.replace(line, (_, a1, _v, a3) => a1 + value + a3)
          : b.src.replace(/^([ \t]*\\begin\{document\})/m, `\\${name}{${value}}\n$1`);
        this.changed();
      });
      page.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const fields = [...page.querySelectorAll('[data-field]')];
        const next = fields[fields.indexOf(e.target.closest('[data-field]')) + 1];
        if (next) next.focus();
        else { const p0 = el.nextElementSibling; if (p0) { const r = document.createRange(); r.selectNodeContents(p0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); this.root.focus(); } }
      });
      const [el] = island('v-title-island', page, 'Document setup');
      return [el];
    }
    // Markdown tables are edited cell by cell
    if (isTable(b.src)) return [this.tableIsland(b, i, island)];
    const aligned = b.src.match(alignmentBlock);
    const source = aligned?.[2] ?? b.src;
    const meta = metaLabel(source);
    const html = meta ? '' : renderSource(source, { editableCitations: true });
    const visible = html.replace(/<[^>]*>/g, '').trim() || /<(img|svg|span class="m"|div class="eq")/.test(html);
    if (meta || !visible) {
      const [icon, label, note] = meta || ['code', 'Hidden source', b.src.trim().split('\n')[0].slice(0, 80)];
      const row = document.createElement('div');
      row.className = 'v-meta-row';
      row.innerHTML = `<i data-lucide="${icon}"></i><b>${esc(label)}</b><span>${esc(note)}</span>`;
      return island('v-meta', row, 'Edit source');
    }
    const box = document.createElement('div');
    box.innerHTML = html;
    if (!isText(source.replaceAll('<br>', ''))) {
      box.className = 'v-render';
      return island('', box, 'Edit LaTeX');
    }
    const nodes = [...box.childNodes].filter((n) => n.nodeType === 1);
    nodes.forEach((c) => {
      c.dataset.b = String(i);
      if (aligned) c.style.textAlign = aligned[1];
    });
    return nodes;
  }

  // Top-level elements grouped by the block they came from
  groups() {
    const g = new Map();
    for (const el of this.root.children) {
      if (el.dataset.b == null) continue;
      const i = +el.dataset.b;
      if (!g.has(i)) g.set(i, []);
      g.get(i).push(el);
    }
    return g;
  }

  getSource() {
    const out = [];
    const done = new Set();
    const kids = [...this.root.children];
    for (const el of kids) {
      if (el.classList.contains('v-tail') && !el.textContent.replace(/\u200b/g, '').trim()) continue;
      if (el.classList.contains('ws-page-break')) { out.push({ src: el.dataset.src, sep: '\n\n' }); continue; }
      if (el.dataset.newIsland != null) { out.push({ src: el.dataset.src, sep: '\n\n' }); continue; }
      const b = el.dataset.b != null ? +el.dataset.b : null;
      if (b != null && this.blocks[b]) {
        if (done.has(b)) continue;
        const els = kids.filter((x) => x.dataset.b === String(b));
        if (el.classList.contains('v-island') || fp(els) === this.fingerprints.get(b)) {
          done.add(b);
          if (this.blocks[b].src.trim()) out.push({ ...this.blocks[b] });
          continue;
        }
      }
      const src = elementToSource(el); // edited or new text
      if (src.replace(/\u200b/g, '').trim()) out.push({ src, sep: '\n\n' });
    }
    // \end{document} always closes the document, whatever was typed below it
    const endAt = out.findIndex((x) => /^\s*\\end\{document\}\s*$/.test(x.src));
    if (endAt >= 0 && endAt < out.length - 1) out.push(...out.splice(endAt, 1));
    const source = (this.lead || '') + joinBlocks(out).replace(/\s*$/, '');
    return [source, this.bibliography].filter(Boolean).join('\n\n') + (this.trail ?? '\n');
  }

  updatePlaceholder() {
    const empty = this.root.childElementCount <= 1
      && !this.root.textContent.replace(/\u200b/g, '').trim()
      && !this.root.querySelector('img, svg, math, .m, .v-island, hr');
    this.root.classList.toggle('is-empty', empty);
  }

  focusEmpty() {
    if (!this.root.classList.contains('is-empty')) return;
    this.root.focus({ preventScroll: true });
    const selection = this.root.ownerDocument.getSelection();
    selection?.collapse(this.root.firstElementChild || this.root, 0);
  }

  changed() {
    this.updatePlaceholder();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flushChange(), 250);
  }

  flushChange() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = 0;
    this.onChange?.(this.getSource());
  }

  /* ----- typing helpers: markdown shortcuts, $math$ and [[links]] ----- */
  handleInput(e) {
    if (e.target.closest?.('.v-island') || getSelection().anchorNode?.parentElement?.closest('.v-island')) { this.changed(); return; }
    const sel = getSelection();
    const node = sel.anchorNode;
    if (node?.nodeType === 3 && (e.data === '$' || e.data === ']' || e.data === ' ')) {
      const text = node.nodeValue.slice(0, sel.anchorOffset);
      let m;
      if (e.data === '$' && (m = text.match(/(^|[^$\\])\$([^$\s][^$]*?)\$$/))) {
        this.replaceBefore(node, sel.anchorOffset, m[2].length + 2, this.mathChip(m[2]));
      } else if (e.data === ']' && (m = text.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/))) {
        const a = document.createElement('a');
        a.href = pageUrl(m[1].trim());
        a.dataset.wiki = m[1].trim();
        a.textContent = (m[2] || m[1]).trim();
        this.replaceBefore(node, sel.anchorOffset, m[0].length, a);
      } else if (e.data === ' ') {
        const blockEl = this.topOf(node);
        const before = blockEl && blockEl.tagName === 'P' ? blockEl.textContent : '';
        const sc = { '#': 'h2', '##': 'h2', '###': 'h3', '####': 'h4', '*': 'ul', '-': 'ul', '1.': 'ol', '>': 'blockquote' }[before.trim()];
        if (sc && before.replace(/ /g, ' ').trimStart() === `${before.trim()} ` && sel.anchorOffset === node.nodeValue.length) {
          node.nodeValue = '';
          if (sc === 'ul') document.execCommand('insertUnorderedList');
          else if (sc === 'ol') document.execCommand('insertOrderedList');
          else document.execCommand('formatBlock', false, sc);
        }
      }
    }
    this.changed();
  }

  replaceBefore(textNode, offset, len, el) {
    const r = document.createRange();
    r.setStart(textNode, offset - len);
    r.setEnd(textNode, offset);
    r.deleteContents();
    r.insertNode(el);
    const space = document.createTextNode('​');
    el.after(space);
    const s = getSelection();
    s.collapse(space, 1);
  }

  mathChip(tex) {
    const span = document.createElement('span');
    span.className = 'm';
    span.dataset.tex = tex;
    span.contentEditable = 'false';
    span.innerHTML = katex.renderToString(tex || '\\square', { throwOnError: false, strict: 'ignore' });
    return span;
  }

  topOf(node) {
    let n = node;
    while (n && n.parentNode !== this.root) n = n.parentNode;
    return n;
  }

  currentBlockType() {
    const n = this.topOf(getSelection().anchorNode);
    if (!n || n.nodeType !== 1) return 'p';
    return n.classList.contains('v-island') ? 'island' : n.tagName.toLowerCase();
  }

  pageBreakNode(source = '\\newpage') {
    const marker = document.createElement('div');
    marker.className = 'ws-page-break';
    marker.contentEditable = 'false';
    marker.dataset.src = source;
    marker.textContent = 'Page break';
    return marker;
  }

  /* ----- tables: type into cells; add or remove rows and columns ----- */
  tableIsland(b, i, island) {
    const rows = parseTable(b.src);
    const box = document.createElement('div');
    box.className = 'v-table-wrap';
    const table = document.createElement('table');
    table.className = 'v-table';
    const draw = () => {
      table.innerHTML = rows.map((r, ri) => `<tr>${r.map((c) => `<${ri ? 'td' : 'th'} contenteditable="true" spellcheck="true">${esc(c)}</${ri ? 'td' : 'th'}>`).join('')}</tr>`).join('');
    };
    draw();
    const tools = document.createElement('div');
    tools.className = 'v-table-tools';
    tools.innerHTML = '<button type="button" data-t="row"><i data-lucide="plus"></i>Row</button><button type="button" data-t="col"><i data-lucide="plus"></i>Column</button>'
      + '<button type="button" data-t="-row" title="Remove the row with the cursor"><i data-lucide="minus"></i>Row</button><button type="button" data-t="-col" title="Remove the column with the cursor"><i data-lucide="minus"></i>Column</button>';
    box.append(table, tools);
    const [el] = island('v-table-island', box, 'Edit source');
    let at = [1, 0]; // the cell with the cursor
    const save = () => { b.src = tableSource(rows); this.changed(); };
    table.addEventListener('focusin', (e) => { const c = e.target.closest('th, td'); if (c) at = [c.parentElement.rowIndex, c.cellIndex]; });
    table.addEventListener('input', (e) => {
      const c = e.target.closest('th, td');
      if (!c) return;
      rows[c.parentElement.rowIndex][c.cellIndex] = c.textContent.replace(/\s+/g, ' ').trim();
      save();
    });
    table.addEventListener('keydown', (e) => {
      const c = e.target.closest('th, td');
      if (!c) return;
      e.stopPropagation(); // keys in a cell stay in the cell
      const cells = [...table.querySelectorAll('th, td')];
      const k = cells.indexOf(c);
      const focus = (n) => { const t = cells[n]; if (!t) return; t.focus(); const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); };
      if (e.key === 'Tab') { e.preventDefault(); if (!e.shiftKey && k === cells.length - 1) { rows.push(rows[0].map(() => '')); draw(); save(); focus(cells.length); } else focus(k + (e.shiftKey ? -1 : 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); focus(k + rows[0].length); }
    });
    tools.addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor in its cell
    tools.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]')?.dataset.t;
      if (!t) return;
      e.stopPropagation();
      const [r, c] = at;
      if (t === 'row') rows.splice(Math.max(1, r) + 1, 0, rows[0].map(() => ''));
      else if (t === 'col') rows.forEach((row) => row.splice(c + 1, 0, ''));
      else if (t === '-row' && rows.length > 2 && r > 0) rows.splice(r, 1);
      else if (t === '-col' && rows[0].length > 1) rows.forEach((row) => row.splice(c, 1));
      draw(); save();
    });
    return el;
  }

  handleKey(e) {
    // Leave a trailing empty paragraph so there is always somewhere to type after a card
    if (e.key === 'Enter' && !this.root.querySelector(':scope > p.v-tail')) {
      this.root.insertAdjacentHTML('beforeend', '<p class="v-tail"><br></p>');
    }
    if (e.key === 'Backspace' || e.key === 'Delete') this.deleteAround(e);
    else if (!['Shift', 'Meta', 'Control', 'Alt'].includes(e.key)) this.unselectCard();
  }

  /* ----- removing cards (equations, theorems, tables…) and formulas with the keyboard -----
     Backspace at the start of a line after a card (or Delete at the end of a line before one) selects
     the card first; pressing again removes it. Formulas next to the caret are removed at once. */
  deleteAround(e) {
    if (getSelection().anchorNode?.parentElement?.closest?.('.v-island') || e.target.closest?.('.v-island')) return; // typing inside a card
    const selected = this.root.querySelector(':scope > .v-selected');
    if (selected) { e.preventDefault(); this.removeCard(selected); return; }
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const back = e.key === 'Backspace';
    const { startContainer: node, startOffset: offset } = sel.getRangeAt(0);
    // a formula right next to the caret
    const sibling = (n, o) => {
      if (n.nodeType === 3) {
        if (back ? o > 0 : o < n.length) return null;
        return back ? n.previousSibling : n.nextSibling;
      }
      return back ? n.childNodes[o - 1] : n.childNodes[o];
    };
    let near = sibling(node, offset);
    while (near && near.nodeType === 3 && !near.textContent.replace(/\u200b/g, '')) near = back ? near.previousSibling : near.nextSibling;
    if (near?.nodeType === 1 && near.classList.contains('m')) { e.preventDefault(); near.remove(); this.changed(); return; }
    // a card before/after the current line
    const top = this.topOf(node === this.root ? this.root.childNodes[offset] || this.root.lastChild : node);
    if (!top || top.parentNode !== this.root) return;
    const range = document.createRange();
    range.selectNodeContents(top);
    if (back) range.setEnd(node, offset); else range.setStart(node, offset);
    if (range.toString().replace(/\u200b/g, '') || range.cloneContents().querySelector('.m, img')) return; // not at the edge of the line
    const card = back ? top.previousElementSibling : top.nextElementSibling;
    if (!card || !card.matches('.v-island, .ws-page-break')) return;
    e.preventDefault();
    if (!top.textContent.replace(/\u200b/g, '').trim() && !top.querySelector('img, .m') && top.matches('p') && !top.classList.contains('v-tail')) {
      top.remove(); // an empty line next to a card just disappears
      this.changed();
    }
    this.selectCard(card);
  }

  selectCard(card) {
    this.unselectCard();
    card.classList.add('v-selected');
    card.setAttribute('aria-selected', 'true');
    card.scrollIntoView({ block: 'nearest' });
  }

  unselectCard() {
    this.root.querySelectorAll(':scope > .v-selected').forEach((c) => { c.classList.remove('v-selected'); c.removeAttribute('aria-selected'); });
  }

  removeCard(card) {
    const after = card.nextElementSibling;
    card.remove();
    if (!this.root.querySelector(':scope > p, :scope > h2, :scope > h3, :scope > h4, :scope > ul, :scope > ol')) {
      this.root.insertAdjacentHTML('beforeend', '<p class="v-tail"><br></p>');
    }
    // put the caret where the card was
    const target = after && after.isContentEditable !== false && after.matches('p, h2, h3, h4, li') ? after : this.root.querySelector(':scope > .v-tail');
    if (target) {
      const r = document.createRange();
      r.selectNodeContents(target);
      r.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    }
    this.changed();
  }

  handleClick(e) {
    const chip = e.target.closest('.m');
    if (chip && this.root.contains(chip)) { e.preventDefault(); this.editMath(chip); return; }
    const a = e.target.closest('a[href]');
    if (a && this.root.contains(a)) { e.preventDefault(); if (e.metaKey || e.ctrlKey) window.open(a.href, '_blank'); return; }
    const island = e.target.closest('.v-island');
    if (island && e.target.closest('.v-del')) { e.preventDefault(); this.removeCard(island); return; }
    if (e.target.closest('.v-table th, .v-table td, .v-table-tools, .v-titlepage [data-field]')) return; // edited in place
    const pageBreakCard = e.target.closest('.ws-page-break');
    if (pageBreakCard && this.root.contains(pageBreakCard)) { this.selectCard(pageBreakCard); return; }
    this.unselectCard();
    if (island && (e.target.closest('.v-edit') || !island.querySelector('.cm-editor'))) this.editIsland(island);
  }

  /* ----- islands: complex blocks edited as LaTeX in place ----- */
  editIsland(island) {
    if (island.classList.contains('editing')) return;
    island.classList.add('editing');
    const i = +island.dataset.b;
    const block = this.blocks[i];
    island.innerHTML = `<div class="v-isl-head"><span>LaTeX / Markdown source</span><span class="v-isl-actions"><button type="button" class="tbtn sm v-remove"><i data-lucide="trash-2"></i>Remove</button><button type="button" class="tbtn sm primary v-done">Done</button></span></div><div class="v-cm"></div><div class="v-live a-body"></div>`;
    icons();
    const live = island.querySelector('.v-live');
    const show = (src) => { live.innerHTML = renderSource(src); clean(live); };
    show(block.src);
    const view = createSourceEditor({ parent: island.querySelector('.v-cm'), doc: block.src, compact: true,
      onChange: (src) => { block.src = src; show(src); this.changed(); } });
    view.focus();
    const done = () => {
      view.destroy();
      this.replaceBlock();
    };
    island.querySelector('.v-done').addEventListener('click', (ev) => { ev.stopPropagation(); done(); });
    island.querySelector('.v-remove').addEventListener('click', (ev) => {
      ev.stopPropagation();
      view.destroy();
      this.removeCard(island);
      this.load(this.getSource());
    });
    view.dom.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); done(); } });
  }

  // Re-split everything after an embedded block was edited
  replaceBlock() {
    this.load(this.getSource());
    this.changed();
  }

  // Insert a complex block after the caret's block and open it for editing
  insertIsland(src) {
    const marker = document.createElement('div');
    marker.dataset.newIsland = '';
    marker.dataset.src = src;
    const top = this.topOf(getSelection().anchorNode);
    if (top && top.parentNode === this.root) top.after(marker); else this.root.append(marker);
    this.load(this.getSource());
    const idx = this.blocks.map((b) => b.src).lastIndexOf(src);
    const island = this.root.querySelector(`.v-island[data-b="${idx}"]`);
    if (island) { island.scrollIntoView({ block: 'center' }); this.editIsland(island); }
    this.changed();
  }

  /* ----- inline formulas ----- */
  insertMath(tex = '') {
    this.root.focus();
    const chip = this.mathChip(tex);
    const sel = getSelection();
    if (!sel.rangeCount || !this.root.contains(sel.anchorNode)) {
      (this.root.querySelector(':scope > p:last-of-type') || this.root).append(chip);
    } else {
      const r = sel.getRangeAt(0);
      r.deleteContents();
      r.insertNode(chip);
      const space = document.createTextNode('​');
      chip.after(space);
      sel.collapse(space, 1);
    }
    if (!tex) this.editMath(chip, true);
    this.changed();
  }

  editMath(chip, isNew = false) {
    document.querySelector('.math-pop')?.remove();
    const pop = document.createElement('div');
    pop.className = 'math-pop';
    pop.innerHTML = `<div class="mp-head"><b>Formula</b><span>LaTeX · type <kbd>\\</kbd> for suggestions</span></div><div class="mp-cm"></div>
      <div class="mp-prev"></div><div class="mp-actions"><button type="button" class="tbtn sm mp-del">Remove</button><button type="button" class="tbtn sm primary mp-ok">Done</button></div>`;
    document.body.append(pop);
    const r = chip.getBoundingClientRect();
    pop.style.left = `${Math.min(r.left, innerWidth - 400) + scrollX}px`;
    pop.style.top = `${r.bottom + 8 + scrollY}px`;
    const prev = pop.querySelector('.mp-prev');
    const show = (tex) => { prev.innerHTML = katex.renderToString(tex || '\\square', { throwOnError: false, displayMode: true, strict: 'ignore' }); };
    show(chip.dataset.tex);
    const view = createSourceEditor({ parent: pop.querySelector('.mp-cm'), doc: chip.dataset.tex || '', compact: true, placeholder: 'e.g. \\pi_3(S^2) \\simeq \\mathbb{Z}',
      onChange: (tex) => show(tex), onSave: () => close(true) });
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    view.focus();
    let closed = false;
    const close = (apply) => {
      if (closed) return;
      closed = true;
      const tex = view.state.doc.toString().trim();
      view.destroy();
      pop.remove();
      document.removeEventListener('mousedown', outside, true);
      if (apply && tex) {
        chip.dataset.tex = tex;
        chip.innerHTML = katex.renderToString(tex, { throwOnError: false, strict: 'ignore' });
      } else chip.remove();
      this.changed();
    };
    const outside = (ev) => { if (!pop.contains(ev.target) && !ev.target.closest('.cm-tooltip')) close(true); };
    setTimeout(() => document.addEventListener('mousedown', outside, true));
    pop.querySelector('.mp-ok').addEventListener('click', () => close(true));
    pop.querySelector('.mp-del').addEventListener('click', () => close(false));
    view.dom.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey && !document.querySelector('.cm-tooltip-autocomplete')) { ev.preventDefault(); close(true); }
      if (ev.key === 'Escape' && !document.querySelector('.cm-tooltip-autocomplete')) close(true);
    });
  }

  /* ----- toolbar commands ----- */
  exec(cmd, arg) {
    this.root.focus();
    switch (cmd) {
      case 'bold': document.execCommand('bold'); break;
      case 'italic': document.execCommand('italic'); break;
      case 'code': { const t = getSelection().toString() || 'code'; document.execCommand('insertHTML', false, `<code>${esc(t)}</code>&#8203;`); break; }
      case 'block': document.execCommand('formatBlock', false, arg); break;
      case 'list': document.execCommand('insertUnorderedList'); break;
      case 'olist': document.execCommand('insertOrderedList'); break;
      case 'quote': document.execCommand('formatBlock', false, 'blockquote'); break;
      case 'align': {
        const command = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' }[arg];
        if (command) document.execCommand(command);
        break;
      }
      case 'line-break': document.execCommand('insertLineBreak'); break;
      case 'cite': document.execCommand('insertHTML', false, citationChip([arg]) + '&#8203;'); break;
      case 'page-break': {
        const marker = this.pageBreakNode();
        document.execCommand('insertHTML', false, `</p>${marker.outerHTML}<p><br></p>`);
        break;
      }
      case 'undo': document.execCommand('undo'); break;
      case 'redo': document.execCommand('redo'); break;
      case 'link': {
        const text = getSelection().toString() || arg;
        document.execCommand('insertHTML', false, `<a href="${esc(pageUrl(arg))}" data-wiki="${esc(arg)}">${esc(text)}</a>&#8203;`);
        break;
      }
      default: break;
    }
    this.changed();
  }
}
