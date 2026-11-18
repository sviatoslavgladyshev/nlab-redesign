// Visual editing of nLab source.
// The page is one contenteditable document: paragraphs, headings and lists are edited as
// normal text; complex blocks (theorem environments, displayed equations, tables, HTML, the
// context sidebar…) are embedded cards that open a LaTeX editor in place. Blocks that are not
// touched keep their exact original source, so visual editing never rewrites unrelated text.
import katex from 'katex';
import { renderSource } from '../../core/markup.js';
import { clean, esc, pageUrl, decodeName } from '../../core/nlab.js';
import { createSourceEditor } from '../../ui/codemirror.js';
import { icons } from '../../ui/app.js';

/* ---------- Splitting source into blocks ---------- */
const pageBreak = /^\\(?:newpage|clearpage)$/;
export function splitBlocks(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let cur = [], depth = 0, inMath = false, gap = '';
  const flush = () => { if (cur.length) { blocks.push({ src: cur.join('\n'), sep: '' }); cur = []; } };
  for (const line of lines) {
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
      if (/^(aligned|array|matrix|pmatrix|bmatrix|cases|split|gathered)$/.test(m[2])) continue;
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
    this.lead = (source.match(/^\s*\n/) || [''])[0];
    this.trail = (source.match(/\s*$/) || [''])[0];
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
      el.append(btn);
      return [el];
    };
    const aligned = b.src.match(alignmentBlock);
    const source = aligned?.[2] ?? b.src;
    const meta = metaLabel(source);
    const html = meta ? '' : renderSource(source);
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
    return (this.lead || '') + joinBlocks(out).replace(/\s*$/, '') + (this.trail ?? '\n');
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

  handleKey(e) {
    // Leave a trailing empty paragraph so there is always somewhere to type after a card
    if (e.key === 'Enter' && !this.root.querySelector(':scope > p.v-tail')) {
      this.root.insertAdjacentHTML('beforeend', '<p class="v-tail"><br></p>');
    }
  }

  handleClick(e) {
    const chip = e.target.closest('.m');
    if (chip && this.root.contains(chip)) { e.preventDefault(); this.editMath(chip); return; }
    const a = e.target.closest('a[href]');
    if (a && this.root.contains(a)) { e.preventDefault(); if (e.metaKey || e.ctrlKey) window.open(a.href, '_blank'); return; }
    const island = e.target.closest('.v-island');
    if (island && (e.target.closest('.v-edit') || !island.querySelector('.cm-editor'))) this.editIsland(island);
  }

  /* ----- islands: complex blocks edited as LaTeX in place ----- */
  editIsland(island) {
    if (island.classList.contains('editing')) return;
    island.classList.add('editing');
    const i = +island.dataset.b;
    const block = this.blocks[i];
    island.innerHTML = `<div class="v-isl-head"><span>LaTeX / Markdown source</span><button type="button" class="tbtn sm v-done">Done</button></div><div class="v-cm"></div><div class="v-live a-body"></div>`;
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
