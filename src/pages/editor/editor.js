// Editing workspace: full-screen, two ways of writing.
//   Visual — type into the page as normal text (formatting bar, formula box, symbol palette)
//   LaTeX  — the page source with highlighting, line numbers and autocomplete, beside a live preview
// Drafts save automatically in this browser; "Publish" walks through sending them to the nLab.
import { icons } from '../../ui/app.js';
import { esc, clean, ORIGIN, encodeName } from '../../core/nlab.js';
import { renderSource, diffLines, resolveRefs, titleFields, hasLatexDocument, withLatexDocument, nlabSource } from '../../core/markup.js';
import { createSourceEditor, setDoc, FORMAT, envSource, ENVS } from '../../ui/codemirror.js';
import { VisualDoc } from './visual.js';
import { openBibliography } from './bibliography.js';
import { bibliographyBlock, bibliographySource, bibliographyText, citationSource, parseBibliography, withoutBibliography } from '../../core/bibliography.js';
import { loadNames } from '../../ui/suggest.js';
import { toast } from '../wiki/shell.js';
import katex from 'katex';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

import { drafts } from '../../core/drafts.js';
import { dbEnabled, currentUser, displayName, savePage, suggestEdit } from '../../core/db.js';
import { forgetPage, pageUrl, findExistingTitle } from '../../core/nlab.js';
import { openAccount } from '../../ui/account.js';
import { busy } from '../../ui/app.js';
export { drafts };
const MODE_KEY = 'nlab-editor-mode';
const ZOOM_KEY = 'nlab-editor-zoom';
const A4_WIDTH = 210 * 96 / 25.4;
const A4_HEIGHT = 297 * 96 / 25.4;

const SYMBOLS = [
  ['\\to', '→'], ['\\hookrightarrow', '↪'], ['\\twoheadrightarrow', '↠'], ['\\Rightarrow', '⇒'], ['\\mapsto', '↦'], ['\\dashv', '⊣'],
  ['\\simeq', '≃'], ['\\cong', '≅'], ['\\coloneqq', '≔'], ['\\otimes', '⊗'], ['\\oplus', '⊕'], ['\\times', '×'], ['\\circ', '∘'],
  ['\\in', '∈'], ['\\subset', '⊂'], ['\\forall', '∀'], ['\\exists', '∃'], ['\\infty', '∞'], ['\\partial', '∂'], ['\\int', '∫'],
  ['\\sum', '∑'], ['\\prod', '∏'], ['\\coprod', '∐'], ['\\mathbb{N}', 'ℕ'], ['\\mathbb{Z}', 'ℤ'], ['\\mathbb{Q}', 'ℚ'], ['\\mathbb{R}', 'ℝ'],
  ['\\mathbb{C}', 'ℂ'], ['\\alpha', 'α'], ['\\beta', 'β'], ['\\gamma', 'γ'], ['\\delta', 'δ'], ['\\epsilon', 'ε'], ['\\lambda', 'λ'],
  ['\\pi', 'π'], ['\\sigma', 'σ'], ['\\phi', 'φ'], ['\\omega', 'ω'], ['\\Omega', 'Ω'], ['\\mathcal{C}', '𝒞'],
];

const BLOCKS = [['p', 'Paragraph', 'Body text', 'pilcrow'], ['h2', 'Section', 'Numbered 1, 2, 3…', 'heading-2'], ['h3', 'Subsection', 'Numbered 1.1, 1.2…', 'heading-3'], ['h4', 'Sub-subsection', 'Unnumbered heading', 'heading-4']];
const ENV_MENU = [['defn|Definition', 'Definition', 'Introduce a notion', 'book-open'], ['prop|Proposition', 'Proposition', 'A statement with proof', 'sigma'],
  ['theorem|Theorem', 'Theorem', 'A main result', 'radical'], ['lemma|Lemma', 'Lemma', 'A helper result', 'git-compare'],
  ['cor|Corollary', 'Corollary', 'Follows from a result', 'arrow-right'], ['example|Example', 'Example', 'A worked instance', 'lightbulb'],
  ['remark|Remark', 'Remark', 'A side comment', 'info'], ['proof|Proof', 'Proof', 'Ends with ∎', 'check']];
const ALIGN_MENU = [['left', 'Align left', '', 'align-left'], ['center', 'Center', '', 'align-center'],
  ['right', 'Align right', '', 'align-right'], ['justify', 'Justify', '', 'align-justify']];
const BREAK_MENU = [['line-break', 'Line break', 'Continue within the paragraph', 'corner-down-left'],
  ['page-break', 'Page break', 'Start a new page in the PDF preview', 'file-plus-2']];
const ZOOM_MENU = [['width', 'Fit width', 'The page fills the width', 'move-horizontal'], ['page', 'Fit page', 'See the whole page', 'scan'],
  ['.5', '50%', '', 'zoom-out'], ['.75', '75%', '', 'zoom-out'], ['1', '100%', 'Actual size', 'square'], ['1.25', '125%', '', 'zoom-in'],
  ['1.5', '150%', '', 'zoom-in'], ['2', '200%', '', 'zoom-in']];
const INSERT_MENU = [['table', 'Table', 'A grid you type into, cell by cell', 'table'],
  ['square', 'Commutative square', 'Four objects and four arrows', 'square'], ['triangle', 'Commutative triangle', 'Three objects and three arrows', 'triangle'],
  ['arrows', 'Chain of arrows', 'A → B → C', 'move-right'], ['image', 'Image', 'From a web address', 'image'], ['rule', 'Divider', 'A horizontal line', 'minus']];
// what each Insert item puts in the page (nLab Markdown + LaTeX; diagrams are drawn live by KaTeX)
const INSERTS = {
  table: () => '| Column 1 | Column 2 | Column 3 |\n|---|---|---|\n|  |  |  |\n|  |  |  |',
  square: () => '$$\n\\begin{CD}\nA @>{f}>> B \\\\\n@V{g}VV @VV{h}V \\\\\nC @>>{k}> D\n\\end{CD}\n$$',
  triangle: () => '$$\n\\begin{array}{ccc}\nA & \\xrightarrow{f} & B \\\\\n & {}_{h}\\searrow & \\downarrow{\\scriptstyle g} \\\\\n & & C\n\\end{array}\n$$',
  arrows: () => '$$\nA \\xrightarrow{f} B \\xrightarrow{g} C\n$$',
  rule: () => '***',
};
const TOOL_MENUS = { block: BLOCKS, env: ENV_MENU, align: ALIGN_MENU, break: BREAK_MENU, zoom: ZOOM_MENU, insert: INSERT_MENU };

let ws; // the single workspace instance

export function openWorkspace({ name, original, start, starter = '', isNew = false, suggestion = false, onExit }) {
  ws?.destroy();
  ws = new Workspace({ name, original, start, starter, isNew, suggestion, onExit });
  return ws;
}

class Workspace {
  constructor({ name, original, start, starter, isNew, suggestion, onExit }) {
    Object.assign(this, { name, original, starter, isNew, suggestion, onExit });
    this.source = start;
    this.modeScroll = {};
    this.el = $('#ws');
    this.el.hidden = false;
    document.body.classList.add('ws-open');
    this.el.classList.toggle('ws-suggestion', suggestion);
    $('#ws-name').textContent = name;
    $('#ws-new').hidden = !isNew;
    this.setupTitle();
    $('[data-ws="publish"] span').textContent = suggestion ? 'Prepare suggestion' : 'Publish';
    this.mode = localStorage.getItem(MODE_KEY) === 'latex' ? 'latex' : 'visual';
    this.ac = new AbortController();
    const on = (target, ev, fn, opts = {}) => target.addEventListener(ev, fn, { ...opts, signal: this.ac.signal });

    // Visual
    this.visual = new VisualDoc($('#ws-visual-doc'), {
      signal: this.ac.signal,
      onChange: (src) => this.update(src, 'visual'),
      onActive: (type) => { const l = $('#ws-block-label'); const m = BLOCKS.find((x) => x[0] === type); if (l && m) l.textContent = m[1]; },
    });
    // LaTeX
    $('#ws-cm').replaceChildren();
    $('#ws-prev').replaceChildren();
    this.cm = createSourceEditor({ parent: $('#ws-cm'), doc: start, placeholder: 'Start writing…', onChange: (src) => this.update(src, 'latex'), onSave: () => this.saveNow(true) });
    on($('#ws-cm'), 'scroll', () => this.syncScroll(), { capture: true, passive: true });

    // Toolbar
    on($('#ws-tools'), 'mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // keep the caret
    on($('#ws-tools'), 'click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) this.command(b.dataset.cmd, b); });
    on($('#ws-tools'), 'click', (e) => { const b = e.target.closest('[data-menu]'); if (b) this.openMenu(b); });
    on(this.el, 'click', (e) => {
      const b = e.target.closest('[data-ws]');
      if (!b) return;
      const a = b.dataset.ws;
      if (a === 'mode') this.setMode(b.dataset.mode);
      else if (a === 'close') this.close();
      else if (a === 'titlepage') this.titlePage();
      else if (a === 'changes') this.toggleDrawer();
      else if (a === 'publish') this.openPublish();
      else if (a === 'bibliography') this.bibliographyDialog();
      else if (a === 'discard') this.discard();
      else if (a === 'pdf') this.printPdf();
      else if (a === 'help') $('#ws-help').hidden = !$('#ws-help').hidden;
      else if (a === 'outline') { const t = document.getElementById(b.dataset.id) || $(`#ws-prev [id="${b.dataset.id}"]`); t?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    on(document, 'keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.saveNow(true); }
      else if (this.mode === 'visual' && mod && e.key.toLowerCase() === 'm') { e.preventDefault(); this.visual.insertMath(); }
      else if (this.mode === 'visual' && mod && e.key.toLowerCase() === 'k') { e.preventDefault(); this.linkPrompt(); }
      else if (e.key === 'Escape' && !document.querySelector('.math-pop, .cm-tooltip-autocomplete, .link-pop, dialog[open]') && !$('#ws-drawer').hidden) this.toggleDrawer(false);
    });
    on(window, 'beforeunload', () => this.saveNow());
    const zoom = $('#ws-zoom');
    const savedZoom = localStorage.getItem(ZOOM_KEY);
    if (savedZoom && !Number.isNaN(Number(savedZoom)) && ![...zoom.options].some((option) => option.value === savedZoom)) {
      const custom = document.createElement('option'); custom.dataset.custom = ''; custom.value = savedZoom; custom.textContent = `${Math.round(Number(savedZoom) * 100)}%`; zoom.append(custom);
    }
    zoom.value = [...zoom.options].some((option) => option.value === savedZoom) ? savedZoom : 'width';
    $('#ws-zoom-label').textContent = zoom.selectedOptions[0]?.textContent.trim() || 'Fit width';
    on(zoom, 'change', () => {
      localStorage.setItem(ZOOM_KEY, zoom.value);
      this.fitPages();
    });
    on($('#ws-visual'), 'wheel', (e) => this.pinchZoom(e), { passive: false });
    on($('#ws-prev'), 'wheel', (e) => this.pinchZoom(e), { passive: false });
    this.resizeObserver = new ResizeObserver(() => this.fitPages());
    this.resizeObserver.observe($('#ws-visual'));
    this.resizeObserver.observe($('#ws-prev'));

    this.setMode(this.mode, true);
    this.update(start, null);
    this.saveState('idle');
    icons();
  }

  /* ----- modes ----- */
  setMode(mode, first = false) {
    if (!first && mode === this.mode) return;
    const visualView = $('#ws-visual');
    const preview = $('#ws-prev');
    if (!first) {
      clearTimeout(this.pt);
      const leavingVisual = this.mode === 'visual';
      const view = leavingVisual ? visualView : preview;
      this.modeScroll[this.mode] = [view.scrollLeft, view.scrollTop];
      if (leavingVisual) {
        const selection = getSelection();
        this.visualRange = selection.rangeCount && this.visual.root.contains(selection.getRangeAt(0).commonAncestorContainer)
          ? selection.getRangeAt(0).cloneRange() : null;
        this.visual.flushChange();
        this.visualSource = this.source;
      } else this.source = this.cm.state.doc.toString();
    }
    this.mode = mode;
    localStorage.setItem(MODE_KEY, mode);
    $$('[data-ws="mode"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    this.el.dataset.mode = mode;
    visualView.hidden = mode !== 'visual';
    $('#ws-latex').hidden = mode !== 'latex';
    this.fitPages();
    if (mode === 'visual') {
      if (this.visualSource !== this.source) {
        this.visual.load(this.source);
        this.visualSource = this.source;
        this.visualRange = null;
        this.visual.focusEmpty();
      } else if (this.visualRange) {
        this.visual.root.focus({ preventScroll: true });
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(this.visualRange);
      }
      visualView.scrollTo(...(this.modeScroll.visual || [0, 0]));
    } else {
      if (this.isNew && !this.suggestion && !hasLatexDocument(this.source)) this.source = this.documentFor(this.source);
      if (this.cm.state.doc.toString() !== this.source) { setDoc(this.cm, this.source); this.update(this.source); }
      this.renderPreview();
      requestAnimationFrame(() => {
        if (this.mode !== 'latex' || this.ac.signal.aborted) return;
        this.cm.focus();
        preview.scrollTo(...(this.modeScroll.latex || [0, 0]));
      });
    }
    $('#ws-hint').innerHTML = mode === 'visual'
      ? 'Type as normal text · <kbd>$x$</kbd> becomes a formula · <kbd>[[page]]</kbd> a link · <kbd>##</kbd>␣ a section · <kbd>⌘M</kbd> formula'
      : 'Type <kbd>\\</kbd> for LaTeX commands · <kbd>[[</kbd> for pages · <kbd>\\begin{</kbd> for environments · <kbd>⌘F</kbd> search';
    this.renderOutline();
  }

  update(src, from) {
    this.source = src;
    if (from === 'latex') { clearTimeout(this.pt); this.pt = setTimeout(() => this.renderPreview(), 350); }
    clearTimeout(this.ot); this.ot = setTimeout(() => { this.renderOutline(); this.renderStats(); if (!$('#ws-drawer').hidden) this.renderDiff(); }, 300);
    if (from) { this.saveState('saving'); clearTimeout(this.st); this.st = setTimeout(() => this.saveNow(), 700); }
  }

  // LaTeX mode: the preview is typeset as A4 pages, like the compiled PDF
  async renderPreview() {
    if (this.mode !== 'latex' || this.previewSource === this.source) return;
    const source = this.source;
    const bib = bibliographyText(source);
    const bibliography = bib ? (await parseBibliography(bib).catch(() => ({ entries: [] }))).entries : undefined;
    if (this.mode !== 'latex' || this.source !== source || this.previewSource === source || this.ac.signal.aborted) return;
    const prev = $('#ws-prev');
    const flow = document.createElement('div');
    // title page: \title, \author and \date from the source, or the page name, your name and today
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const fields = titleFields(source);
    const tex = (t) => esc(t).replace(/\\today/g, today).replace(/\\\\/g, '<br>').replace(/\\and\b/g, '<span class="pdf-and">and</span>')
      .replace(/\\(textbf|emph|textit)\{([^{}]*)\}/g, (_, c, x) => (c === 'textbf' ? `<b>${x}</b>` : `<i>${x}</i>`)).replace(/[{}]/g, '');
    const title = fields.title ?? this.name;
    const author = fields.author ?? (displayName(currentUser()) || 'nLab');
    const date = fields.date ?? '\\today';
    flow.innerHTML = `<div class="pdf-title" data-ws="titlepage" title="Edit the title, author and date">${title ? `<h1>${tex(title)}</h1>` : ''}${author ? `<p>${tex(author)}</p>` : ''}${date ? `<p>${tex(date)}</p>` : ''}</div>${renderSource(source, { bibliography })}`;
    const references = flow.querySelector('.bib-references');
    if (references) {
      references.replaceWith(...Array.from(references.children, (item, index) => {
        const entry = document.createElement('p');
        entry.className = 'bib-reference';
        entry.id = item.id;
        entry.append((index + 1) + '. ', ...item.childNodes);
        return entry;
      }));
    }
    clean(flow);
    let n = 0, s2 = 0, s3 = 0;
    flow.querySelectorAll('[class*="num_"] > h6').forEach((x) => { n += 1; if (!/\d/.test(x.textContent)) x.textContent += ` ${n}`; });
    flow.querySelectorAll('h2, h3').forEach((x) => {
      if (x.tagName === 'H2') { s2 += 1; s3 = 0; x.dataset.no = s2; } else { s3 += 1; x.dataset.no = `${s2}.${s3}`; }
    });
    flow.querySelectorAll('a[href]:not([href^="#"])').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
    resolveRefs(flow);
    const keep = prev.scrollTop;
    prev.replaceChildren();
    // Paginate: move top-level blocks onto A4 pages, starting a new page when one is full
    let page, body, count = 0;
    const newPage = () => {
      count += 1;
      page = document.createElement('section');
      page.className = 'pdf-page';
      page.innerHTML = `<div class="pdf-body"></div><div class="pdf-no">${count}</div>`;
      body = page.firstChild;
      prev.append(page);
    };
    newPage();
    for (const el of [...flow.childNodes]) {
      if (el.nodeType === 3 && !el.nodeValue.trim()) continue;
      if (el.classList?.contains('page-break')) { newPage(); continue; }
      body.append(el);
      if (body.scrollHeight > body.clientHeight + 1 && body.childNodes.length > 1) {
        el.remove();
        const lastHead = body.lastElementChild;
        newPage();
        // keep a heading together with what follows it
        if (lastHead && /^H[1-6]$/.test(lastHead.tagName)) body.append(lastHead);
        body.append(el);
      }
    }
    $('#pdf-count').textContent = `${count} page${count === 1 ? '' : 's'}`;
    this.fitPages();
    prev.scrollTop = keep;
    this.previewSource = source;
    if (bib) this.renderOutline();
  }
  fitPages() {
    const view = this.mode === 'visual' ? $('#ws-visual') : $('#ws-prev');
    if (!view.clientWidth || !view.clientHeight) return;
    const style = getComputedStyle(view);
    const width = view.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = view.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const value = $('#ws-zoom').value;
    const fitWidth = width / A4_WIDTH;
    const scale = value === 'width' ? Math.min(1, fitWidth)
      : value === 'page' ? Math.min(1, fitWidth, height / A4_HEIGHT)
      : Number(value);
    view.style.setProperty('--paper-zoom', String(Math.max(.05, scale)));
  }
  async printPdf() {
    if (this.mode !== 'latex') this.setMode('latex');
    await this.renderPreview();
    requestAnimationFrame(() => { document.title = this.name; window.print(); });
  }
  syncScroll() {
    const sc = $('#ws-cm .cm-scroller');
    const prev = $('#ws-prev');
    if (!sc) return;
    const r = sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight);
    prev.scrollTop = r * (prev.scrollHeight - prev.clientHeight);
  }

  renderOutline() {
    const heads = [...this.source.matchAll(/^(#{2,3})\s+(.+?)\s*#*\s*$/gm)].filter((m) => !/^contents$/i.test(m[2].trim()));
    const root = this.mode === 'visual' ? $('#ws-visual-doc') : $('#ws-prev');
    const hs = [...root.querySelectorAll('h2[id], h3[id]')];
    $('#ws-outline').innerHTML = hs.length
      ? hs.map((h) => `<button type="button" data-ws="outline" data-id="${esc(h.id)}" class="lvl-${h.tagName[1]}">${esc(h.textContent.trim())}</button>`).join('')
      : `<p class="ws-empty">${heads.length ? '' : 'Sections appear here. Start one with “## ”.'}</p>`;
  }

  renderStats() {
    const source = withoutBibliography(this.source);
    const words = source.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\+--.*|=--|\[\[!.*?\]\]|[#*_>`]/g, ' ').split(/\s+/).filter(Boolean).length;
    const formulas = (source.match(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g) || []).length;
    $('#ws-words').textContent = `${words.toLocaleString()} words · ${formulas.toLocaleString()} formulas`;
    const { added, removed } = diffLines(this.original, this.source);
    $('#ws-count').textContent = added || removed ? `+${added} −${removed}` : '';
  }

  /* ----- saving ----- */
  saveState(s, at) {
    const el = $('#ws-save');
    el.dataset.state = s;
    el.innerHTML = s === 'saving' ? '<i data-lucide="clock"></i>Saving…'
      : s === 'saved' ? `<i data-lucide="circle-check"></i>Draft saved in this browser${at ? ` · ${at}` : ''}`
      : s === 'clean' ? '<i data-lucide="circle-check"></i>No changes'
      : s === 'error' ? '<i data-lucide="info"></i>Could not save the draft' : '<i data-lucide="circle-check"></i>Draft saves automatically';
    icons();
  }
  saveNow(flash = false) {
    clearTimeout(this.st);
    if (this.mode === 'visual') this.source = this.visual.getSource();
    const draft = drafts.get(this.name);
    if (this.isNew && !draft && (!this.source.trim() || this.source.trim() === this.starter.trim())) {
      this.saveState('clean');
      return;
    }
    if (this.source === this.original && !this.isNew) { if (draft) drafts.clear(this.name); this.saveState('clean'); return; }
    const unchanged = draft?.source === this.source && draft.isNew === this.isNew;
    const savedAt = unchanged ? draft.savedAt : Date.now();
    const ok = unchanged || drafts.set(this.name, { source: this.source, savedAt, isNew: this.isNew });
    this.saveState(ok ? 'saved' : 'error', new Date(savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    if (flash) $('#ws-save').animate([{ background: 'var(--tonal)' }, { background: 'transparent' }], 700);
  }
  discard() {
    if (!confirm('Discard all your changes to this page?')) return;
    drafts.clear(this.name);
    this.source = this.original;
    if (this.mode === 'visual') this.visual.load(this.source); else setDoc(this.cm, this.source);
    this.update(this.source, null);
    this.saveState('clean');
    this.renderDiff();
  }
  close() {
    this.saveNow();
    this.destroy();
    this.onExit?.();
  }
  destroy() {
    this.ac.abort();
    clearTimeout(this.pt);
    clearTimeout(this.ot);
    clearTimeout(this.st);
    clearTimeout(this.visual.timer);
    this.resizeObserver.disconnect();
    this.cm.destroy();
    document.querySelector('.math-pop')?.remove();
    document.querySelector('.link-pop')?.remove();
    this.el.hidden = true;
    document.body.classList.remove('ws-open');
    ws = null;
  }

  /* ----- changes ----- */
  toggleDrawer(force) {
    const d = $('#ws-drawer');
    d.hidden = force === undefined ? !d.hidden : !force;
    $('[data-ws="changes"]').setAttribute('aria-pressed', String(!d.hidden));
    if (!d.hidden) { if (this.mode === 'visual') this.source = this.visual.getSource(); this.renderDiff(); }
  }
  renderDiff() {
    const { ops, offset, added, removed } = diffLines(this.original, this.source);
    const box = $('#ws-diff');
    $('#ws-diff-sum').textContent = added || removed ? `${added} line${added === 1 ? '' : 's'} added, ${removed} removed` : 'No changes yet.';
    if (!added && !removed) { box.innerHTML = ''; return; }
    const keep = ops.map((o, i) => ops.slice(Math.max(0, i - 2), i + 3).some((x) => x[0] !== ' '));
    let html = '', ln = offset, gap = 0;
    ops.forEach(([op, line], i) => {
      if (op !== '+') ln += 1;
      if (!keep[i]) { gap += 1; return; }
      if (gap) { html += `<div class="d-gap">${gap} unchanged line${gap === 1 ? '' : 's'}</div>`; gap = 0; }
      html += `<div class="d-${op === '+' ? 'add' : op === '-' ? 'del' : 'ctx'}"><span class="d-ln">${op === '+' ? '' : ln}</span><code>${esc(line) || ' '}</code></div>`;
    });
    if (gap) html += `<div class="d-gap">${gap} unchanged line${gap === 1 ? '' : 's'}</div>`;
    box.innerHTML = html;
  }

  /* ----- commands ----- */
  bibliographyDialog() {
    const visual = this.mode === 'visual';
    const source = () => visual ? this.visual.getSource() : this.cm.state.doc.toString();
    const selection = getSelection();
    const range = visual && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    openBibliography({
      text: bibliographyText(source()),
      signal: this.ac.signal,
      onChange: (text) => {
        const current = source();
        const old = bibliographyBlock(current);
        const block = text ? bibliographySource(text) : '';
        const from = old ? current.indexOf(old) : current.length;
        const insert = block && !old && current.trim() ? '\n\n' + block : block;
        const updated = current.slice(0, from) + insert + current.slice(from + old.length);
        if (text && updated.length > 1_000_000 && [...updated].length > 1_000_000) {
          throw new Error('This bibliography would make the draft too large to save.');
        }
        if (visual) {
          this.visual.bibliography = block;
          this.update(this.visual.getSource(), 'visual');
        } else {
          this.cm.dispatch({ changes: { from, to: from + old.length, insert } });
        }
        this.saveNow();
      },
      onCite: (key) => {
        if (!visual) {
          this.cm.dispatch(this.cm.state.replaceSelection(citationSource([key])));
          this.cm.focus();
          return;
        }
        const root = this.visual.root;
        root.focus({ preventScroll: true });
        if (range && root.contains(range.commonAncestorContainer) && !range.startContainer.parentElement?.closest('.v-island')) {
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          selection.collapse(root.lastElementChild, 0);
        }
        this.visual.exec('cite', key);
      },
    });
  }

  command(cmd, btn, arg) {
    if (this.mode === 'latex') {
      const v = this.cm;
      if (cmd === 'undo' || cmd === 'redo') { import('@codemirror/commands').then((m) => (cmd === 'undo' ? m.undo : m.redo)(v)); return; }
      if (cmd === 'block') { FORMAT.heading(v); return; }
      if (cmd === 'symbols') { this.symbolPop(btn, (tex) => { v.dispatch(v.state.replaceSelection(tex)); v.focus(); }); return; }
      if (cmd === 'env') { const [cls, label] = arg.split('|'); FORMAT.env(v, cls, label); return; }
      if (cmd === 'insert') {
        const src = this.insertSource(arg);
        if (src) { const at = v.state.selection.main.from; const pre = at && v.state.doc.sliceString(at - 1, at) !== '\n' ? '\n\n' : ''; v.dispatch(v.state.replaceSelection(`${pre}${src}\n\n`)); v.focus(); }
        return;
      }
      FORMAT[cmd]?.(v);
      return;
    }
    const d = this.visual;
    if (cmd === 'math') d.insertMath();
    else if (cmd === 'display') d.insertIsland('$$\n  \n$$');
    else if (cmd === 'env') { const [cls, label] = arg.split('|'); d.insertIsland(envSource(cls, label, '…')); }
    else if (cmd === 'link') this.linkPrompt(btn);
    else if (cmd === 'symbols') this.symbolPop(btn, (tex) => d.insertMath(tex));
    else if (cmd === 'heading') d.exec('block', 'h2');
    else if (cmd === 'insert') { const src = this.insertSource(arg); if (src) d.insertIsland(src); }
    else d.exec(cmd, arg);
  }

  // Styled dropdown menus (paragraph style, environments)
  /* ----- the PDF title page: \title, \author, \date at the top of the source ----- */
  documentFor(body) {
    const fields = titleFields(body);
    return withLatexDocument(body.replace(/^[ \t]*\\(title|author|date)\{.*\}[ \t]*\n?/gm, ''), {
      title: fields.title ?? this.name, author: fields.author ?? (displayName(currentUser()) || ''), date: fields.date ?? '\\today' });
  }

  titlePage() {
    if (this.mode !== 'latex') this.setMode('latex');
    const v = this.cm;
    let doc = v.state.doc.toString();
    if (!hasLatexDocument(doc)) {
      const next = this.documentFor(doc);
      v.dispatch({ changes: { from: 0, to: doc.length, insert: next } });
      doc = next;
    }
    const at = doc.search(/^[ \t]*\\title\{/m);
    if (at >= 0) {
      const open = doc.indexOf('{', at) + 1;
      const close = doc.indexOf('}', open);
      v.dispatch({ selection: { anchor: open, head: close }, scrollIntoView: true });
    }
    v.focus();
  }

  /* ----- the title: click to rename a new page, like a document title (published pages keep theirs) ----- */
  setupTitle() {
    const title = $('#ws-name');
    const editable = this.isNew && !this.suggestion;
    title.contentEditable = editable ? 'plaintext-only' : 'false';
    title.classList.toggle('ws-name-edit', editable);
    title.spellcheck = false;
    title.setAttribute('role', editable ? 'textbox' : 'heading');
    title.setAttribute('aria-label', editable ? 'Page title (click to rename)' : 'Page title');
    title.title = editable ? 'Click to rename' : 'Published pages keep their title, so links to them keep working';
    if (!editable || title.dataset.wired) return;
    title.dataset.wired = '1';
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
      else if (e.key === 'Escape') { title.textContent = this.name; title.blur(); }
    });
    title.addEventListener('focus', () => {
      const r = document.createRange();
      r.selectNodeContents(title);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    title.addEventListener('blur', () => this.rename(title.textContent));
  }

  async rename(raw) {
    const title = $('#ws-name');
    const name = raw.replace(/\s+/g, ' ').trim();
    const revert = (message) => {
      title.textContent = this.name;
      if (message) this.titleNote(message);
    };
    if (!name) return revert('A page needs a title.');
    if (name === this.name) return revert();
    if (name.length > 300) return revert('That title is too long.');
    if (/[[\]|#]/.test(name)) return revert('Titles can’t contain [ ] | or #.');
    title.classList.add('ws-name-busy');
    try {
      const existing = name.toLowerCase() === this.name.toLowerCase() ? null : await findExistingTitle(name).catch(() => null);
      if (existing) return revert(`“${existing.name || name}” already exists. Choose another title.`);
      this.saveNow();
      const from = this.name;
      const draft = drafts.get(from);
      if (draft) drafts.set(name, draft);
      drafts.clear(from);
      this.name = name;
      title.textContent = name;
      document.title = `${name} — nLab`;
      const u = new URL(location.href);
      u.pathname = new URL(pageUrl(name), document.baseURI).pathname;
      history.replaceState(history.state, '', u);
      dispatchEvent(new CustomEvent('ws-rename', { detail: { from, to: name } }));
      this.titleNote('Renamed.', true);
    } finally {
      title.classList.remove('ws-name-busy');
    }
  }

  titleNote(message, ok = false) {
    let note = $('.ws-title-note');
    if (!note) {
      note = document.createElement('span');
      note.className = 'ws-title-note';
      note.setAttribute('role', 'status');
      $('.ws-title').append(note);
    }
    note.textContent = message;
    note.classList.toggle('ok', ok);
    note.hidden = false;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => { note.hidden = true; }, ok ? 1600 : 4000);
  }

  insertSource(kind) {
    if (kind !== 'image') return INSERTS[kind]?.();
    const url = prompt('Image address (https://…)');
    if (!url || !/^https?:\/\//i.test(url.trim())) return null;
    const alt = prompt('Short description of the image (for screen readers)') || '';
    return `![${alt.replace(/[\[\]]/g, '')}](${url.trim()})`;
  }

  // pinch on a trackpad (a wheel event with Ctrl) zooms the page smoothly, like in a document app
  pinchZoom(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const view = e.currentTarget;
    const current = parseFloat(getComputedStyle(view).getPropertyValue('--paper-zoom')) || 1;
    const next = Math.min(3, Math.max(0.25, current * Math.exp(-e.deltaY * 0.006)));
    this.pendingZoom = Math.round(next * 100) / 100;
    if (this.zoomFrame) return;
    this.zoomFrame = requestAnimationFrame(() => {
      this.zoomFrame = 0;
      this.setZoom(String(this.pendingZoom));
    });
  }

  // the paper zoom, chosen from the Fit width menu (or set by pinching)
  setZoom(value) {
    const zoom = $('#ws-zoom');
    if (![...zoom.options].some((o) => o.value === value)) {
      // a pinched zoom like 137%: one extra option holds it
      let custom = zoom.querySelector('option[data-custom]');
      if (!custom) { custom = document.createElement('option'); custom.dataset.custom = ''; zoom.append(custom); }
      custom.value = value;
      custom.textContent = `${Math.round(Number(value) * 100)}%`;
    }
    zoom.value = value;
    $('#ws-zoom-label').textContent = zoom.selectedOptions[0]?.textContent.trim() || 'Fit width';
    zoom.dispatchEvent(new Event('change'));
  }

  openMenu(btn) {
    document.querySelector('.ws-menu')?.remove();
    const kind = btn.dataset.menu;
    const items = TOOL_MENUS[kind];
    const menu = document.createElement('div');
    menu.className = 'ws-menu';
    menu.setAttribute('role', 'menu');
    const current = kind === 'zoom' ? $('#ws-zoom').value : null;
    menu.classList.toggle('ws-menu-compact', kind === 'zoom');
    menu.innerHTML = items.map(([v, label, note, icon], i) => `<button type="button" role="${current ? 'menuitemradio' : 'menuitem'}"${current ? ` aria-checked="${v === current}"` : ''} data-v="${v}" tabindex="${i ? -1 : 0}"><i data-lucide="${icon}"></i><span><b>${label}</b>${note ? `<small>${note}</small>` : ''}</span>${v === current ? '<i data-lucide="check" class="ws-menu-check"></i>' : ''}</button>`).join('');
    document.body.append(menu);
    icons();
    const r = btn.getBoundingClientRect();
    // open under the button; near the right edge, line up with the button's right side instead
    const left = r.left + menu.offsetWidth > innerWidth - 8 ? r.right - menu.offsetWidth : r.left;
    menu.style.left = `${Math.max(8, left) + scrollX}px`;
    menu.style.top = `${r.bottom + 6 + scrollY}px`;
    btn.setAttribute('aria-expanded', 'true');
    const btns = [...menu.querySelectorAll('button')];
    const close = () => { menu.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', off, true); };
    const off = (ev) => { if (!menu.contains(ev.target) && ev.target !== btn) close(); };
    setTimeout(() => document.addEventListener('mousedown', off, true));
    menu.addEventListener('mousedown', (ev) => ev.preventDefault());
    menu.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-v]');
      if (!b) return;
      close();
      if (kind === 'zoom') { this.setZoom(b.dataset.v); btn.focus(); return; }
      this.command(kind === 'break' ? b.dataset.v : kind, null, b.dataset.v);
    });
    menu.addEventListener('keydown', (ev) => {
      const i = btns.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); btns[(i + 1) % btns.length].focus(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
      else if (ev.key === 'Escape') { close(); btn.focus(); }
    });
    if (document.activeElement === btn) btns[0].focus();
  }

  symbolPop(btn, onPick) {
    document.querySelector('.sym-pop')?.remove();
    const pop = document.createElement('div');
    pop.className = 'sym-pop';
    pop.innerHTML = SYMBOLS.map(([tex, glyph]) => `<button type="button" data-tex="${esc(tex)}" title="${esc(tex)}">${glyph}</button>`).join('');
    document.body.append(pop);
    const r = (btn || $('#ws-tools')).getBoundingClientRect();
    pop.style.left = `${Math.min(r.left, innerWidth - 330) + scrollX}px`;
    pop.style.top = `${r.bottom + 6 + scrollY}px`;
    pop.addEventListener('mousedown', (e) => e.preventDefault());
    pop.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { pop.remove(); onPick(b.dataset.tex); } });
    setTimeout(() => document.addEventListener('mousedown', function off(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', off); } }));
  }

  linkPrompt(btn) {
    document.querySelector('.link-pop')?.remove();
    const sel = getSelection();
    const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const pop = document.createElement('div');
    pop.className = 'link-pop';
    pop.innerHTML = `<label>Link to an nLab page<input type="text" placeholder="Page name" autocomplete="off"></label><div class="lp-list" role="listbox"></div>`;
    document.body.append(pop);
    const r = (btn || $('#ws-tools')).getBoundingClientRect();
    pop.style.left = `${Math.min(r.left, innerWidth - 360) + scrollX}px`;
    pop.style.top = `${r.bottom + 6 + scrollY}px`;
    const input = $('input', pop);
    const list = $('.lp-list', pop);
    input.value = range?.toString() || '';
    let items = [], act = 0;
    const draw = async () => {
      const q = input.value.trim().toLowerCase();
      const names = await loadNames();
      items = q ? names.filter((n) => n.toLowerCase().includes(q)).sort((a, b) => (b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q)) || a.length - b.length).slice(0, 7) : [];
      if (q && !items.some((n) => n.toLowerCase() === q)) items.push(input.value.trim());
      act = 0;
      list.innerHTML = items.map((n, i) => `<div role="option" data-i="${i}" aria-selected="${i === 0}">${esc(n)}${i === items.length - 1 && !names.some((x) => x.toLowerCase() === n.toLowerCase()) ? ' <em>new page</em>' : ''}</div>`).join('');
    };
    const pick = (i) => {
      const name = items[i];
      pop.remove();
      if (!name) return;
      this.visual.root.focus();
      if (range) { sel.removeAllRanges(); sel.addRange(range); }
      this.visual.exec('link', name);
    };
    input.addEventListener('input', draw);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        act = (act + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length);
        $$('[role="option"]', list).forEach((o, i) => o.setAttribute('aria-selected', String(i === act)));
      } else if (e.key === 'Enter') { e.preventDefault(); pick(act); } else if (e.key === 'Escape') pop.remove();
    });
    list.addEventListener('mousedown', (e) => { e.preventDefault(); const o = e.target.closest('[data-i]'); if (o) pick(+o.dataset.i); });
    setTimeout(() => document.addEventListener('mousedown', function off(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', off); } }));
    input.focus();
    draw();
  }

  /* ----- publishing ----- */
  openPublish() {
    this.saveNow();
    if (this.isNew && !this.source.trim()) {
      toast('Write something before publishing this page.');
      return;
    }
    const dlg = $('#pub-dlg');
    const { added, removed } = diffLines(this.original, this.source);
    $('#pub-title').textContent = this.suggestion ? 'Suggest an edit' : this.isNew ? 'Publish new page' : 'Publish to the nLab';
    $('#pub-intro').textContent = this.suggestion
      ? 'Share your proposed source with the page authors. Suggestions are reviewed before they become part of the article.'
      : 'The nLab stores every page on ncatlab.org. Publishing takes three short steps:';
    $('#pub-step-paste').textContent = this.suggestion ? 'Share the proposed source with the page author.' : 'Paste it into the nLab editor and press “Submit”.';
    $('#pub-step-forum').textContent = this.suggestion
      ? 'Explain what you would change and why in the forum.'
      : this.isNew ? 'Introduce your new page in the forum.' : 'For anything beyond a typo, say what you changed in the forum.';
    $('#pub-open').hidden = this.suggestion;
    $('#pub-sum').textContent = this.suggestion ? `${added} line${added === 1 ? '' : 's'} added, ${removed} removed · suggestion only` : (this.isNew ? `New page · ${this.source.split('\n').length} lines` : `${added} line${added === 1 ? '' : 's'} added, ${removed} removed`);
    $('#pub-open').href = `${ORIGIN}/nlab/${this.isNew ? 'new' : 'edit'}/${encodeName(this.name)}`;
    $('#pub-forum').href = `forum/?new=${encodeURIComponent(this.name)}`;
    $('#pub-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(nlabSource(this.source)); $('#pub-copy span').textContent = 'Copied'; } catch { $('#pub-copy span').textContent = 'Copy failed: select the source in LaTeX mode'; }
    };
    $('#pub-copy span').textContent = 'Copy page source';
    const done = (how) => { drafts.clear(this.name); dlg.close(); this.destroy(); this.onExit?.(how); };

    // With the site's database: publish (or suggest) right here, live at once for everyone.
    // Sending the page to ncatlab.org as well stays available, folded away.
    const viaDb = dbEnabled;
    const signedIn = !!currentUser();
    $('#pub-db').hidden = !viaDb;
    $('#pub-nlab').open = !viaDb;
    $('#pub-nlab').classList.toggle('plain', !viaDb);
    $('#pub-err').textContent = '';
    $('#pub-note').value = '';
    if (viaDb) {
      $('#pub-title').textContent = this.suggestion ? 'Suggest an edit' : this.isNew ? 'Publish new page' : 'Publish changes';
      $('#pub-db-intro').textContent = !signedIn
        ? `Sign in to ${this.suggestion ? 'send your suggestion' : 'publish'}: your name goes with your contribution.`
        : this.suggestion ? 'Your suggestion is saved with the page, where its authors can review it.' : 'Your page goes live on this site straight away, with your name in its history.';
      $('#pub-note').closest('label').hidden = !signedIn || (this.isNew && !this.suggestion);
      $('#pub-nlab-sum').textContent = this.suggestion ? 'Or send it to the nLab yourself' : 'Also send it to ncatlab.org';
    }
    const primary = $('#pub-done');
    const label = !viaDb ? (this.suggestion ? 'I’ve sent the suggestion' : 'I’ve published it')
      : !signedIn ? 'Sign in' : this.suggestion ? 'Send suggestion' : this.isNew ? 'Publish page' : 'Publish changes';
    primary.innerHTML = `<i data-lucide="${!viaDb ? 'check' : !signedIn ? 'log-in' : this.suggestion ? 'send' : 'cloud-upload'}"></i><span>${label}</span>`;
    icons();
    primary.onclick = async () => {
      if (!viaDb) return done(this.suggestion ? 'suggested' : 'published');
      if (!currentUser()) { dlg.close(); openAccount('in'); return; }
      const stop = busy(primary);
      $('#pub-err').textContent = '';
      try {
        const note = $('#pub-note').value.trim();
        if (this.suggestion) await suggestEdit(this.name, this.source, note, this.original);
        else await savePage(this.name, this.source, { summary: pageSummary(this.source), links: pageLinks(this.source), note });
        forgetPage(this.name);
        done(this.suggestion ? 'suggested-db' : 'published-db');
      } catch (ex) {
        $('#pub-err').textContent = ex.message || String(ex);
        stop();
      }
    };
    dlg.showModal();
  }
}

// small helper so the formula preview in the symbol palette isn't empty in LaTeX mode
export const texToHtml = (tex) => katex.renderToString(tex, { throwOnError: false });
export { ENVS };

// For the database: a page's summary (its first real paragraph) and the pages it links to
export function pageSummary(source) {
  const box = document.createElement('div');
  box.innerHTML = renderSource(source);
  const p = [...box.querySelectorAll('p')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).find((t) => t.length > 40) || '';
  return p.length > 230 ? `${p.slice(0, 230).replace(/\s+\S*$/, '')}…` : p;
}
export const pageLinks = (source) => [...new Set([...withoutBibliography(source).replace(/\[\[!include[^\]]*\]\]/g, '').matchAll(/\[\[([^\]|#!][^\]|#]*)/g)]
  .map((m) => m[1].trim().toLowerCase()).filter(Boolean))].slice(0, 2000);
