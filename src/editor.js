// Editing workspace: full-screen, two ways of writing.
//   Visual — type into the page as normal text (formatting bar, formula box, symbol palette)
//   LaTeX  — the page source with highlighting, line numbers and autocomplete, beside a live preview
// Drafts save automatically in this browser; "Publish" walks through sending them to the nLab.
import { icons } from './main.js';
import { esc, clean, ORIGIN, encodeName } from './nlab.js';
import { renderSource, diffLines, resolveRefs } from './markup.js';
import { createSourceEditor, setDoc, FORMAT, envSource, ENVS } from './cm.js';
import { VisualDoc } from './visual.js';
import { loadNames } from './suggest.js';
import katex from 'katex';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const draftKey = (name) => `nlab-draft:${name}`;
export const drafts = {
  get(name) { try { return JSON.parse(localStorage.getItem(draftKey(name))); } catch { return null; } },
  set(name, d) { try { localStorage.setItem(draftKey(name), JSON.stringify(d)); return true; } catch { return false; } },
  clear(name) { try { localStorage.removeItem(draftKey(name)); } catch { /* ignore */ } },
};
const MODE_KEY = 'nlab-editor-mode';

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

let ws; // the single workspace instance

export function openWorkspace({ name, original, start, isNew = false, onExit }) {
  ws?.destroy();
  ws = new Workspace({ name, original, start, isNew, onExit });
  return ws;
}

class Workspace {
  constructor({ name, original, start, isNew, onExit }) {
    Object.assign(this, { name, original, isNew, onExit });
    this.source = start;
    this.el = $('#ws');
    this.el.hidden = false;
    document.body.classList.add('ws-open');
    $('#ws-name').textContent = name;
    $('#ws-new').hidden = !isNew;
    this.mode = localStorage.getItem(MODE_KEY) === 'latex' ? 'latex' : 'visual';
    this.ac = new AbortController();
    const on = (target, ev, fn, opts = {}) => target.addEventListener(ev, fn, { ...opts, signal: this.ac.signal });

    // Visual
    this.visual = new VisualDoc($('#ws-visual-doc'), {
      onChange: (src) => this.update(src, 'visual'),
      onActive: (type) => { const l = $('#ws-block-label'); const m = BLOCKS.find((x) => x[0] === type); if (l && m) l.textContent = m[1]; },
    });
    // LaTeX
    $('#ws-cm').replaceChildren();
    this.cm = createSourceEditor({ parent: $('#ws-cm'), doc: start, onChange: (src) => this.update(src, 'latex'), onSave: () => this.saveNow(true) });
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
      else if (a === 'changes') this.toggleDrawer();
      else if (a === 'publish') this.openPublish();
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
    on(window, 'resize', () => this.fitPages());

    this.setMode(this.mode, true);
    this.update(start, null);
    this.saveState('idle');
    icons();
  }

  /* ----- modes ----- */
  setMode(mode, first = false) {
    if (!first && mode === this.mode) return;
    if (!first) this.source = this.mode === 'visual' ? this.visual.getSource() : this.cm.state.doc.toString();
    this.mode = mode;
    localStorage.setItem(MODE_KEY, mode);
    $$('[data-ws="mode"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    this.el.dataset.mode = mode;
    $('#ws-visual').hidden = mode !== 'visual';
    $('#ws-latex').hidden = mode !== 'latex';
    if (mode === 'visual') this.visual.load(this.source);
    else { if (this.cm.state.doc.toString() !== this.source) setDoc(this.cm, this.source); this.renderPreview(); requestAnimationFrame(() => this.cm.focus()); }
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
  renderPreview() {
    const prev = $('#ws-prev');
    const flow = document.createElement('div');
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    flow.innerHTML = `<div class="pdf-title"><h1>${esc(this.name)}</h1><p>nLab</p><p>${date}</p></div>${renderSource(this.source)}`;
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
  }
  fitPages() {
    const prev = $('#ws-prev');
    const w = prev.clientWidth - 48;
    prev.style.setProperty('--pdf-zoom', String(Math.min(1, Math.max(0.35, w / 794))));
  }
  printPdf() {
    if (this.mode !== 'latex') this.setMode('latex');
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
    const words = this.source.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\+--.*|=--|\[\[!.*?\]\]|[#*_>`]/g, ' ').split(/\s+/).filter(Boolean).length;
    const formulas = (this.source.match(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g) || []).length;
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
    if (this.source === this.original && !this.isNew) { drafts.clear(this.name); this.saveState('clean'); return; }
    const ok = drafts.set(this.name, { source: this.source, savedAt: Date.now(), isNew: this.isNew });
    this.saveState(ok ? 'saved' : 'error', new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
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
  command(cmd, btn, arg) {
    if (this.mode === 'latex') {
      const v = this.cm;
      if (cmd === 'undo' || cmd === 'redo') { import('@codemirror/commands').then((m) => (cmd === 'undo' ? m.undo : m.redo)(v)); return; }
      if (cmd === 'block') { FORMAT.heading(v); return; }
      if (cmd === 'symbols') { this.symbolPop(btn, (tex) => { v.dispatch(v.state.replaceSelection(tex)); v.focus(); }); return; }
      if (cmd === 'env') { const [cls, label] = arg.split('|'); FORMAT.env(v, cls, label); return; }
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
    else d.exec(cmd, arg);
  }

  // Styled dropdown menus (paragraph style, environments)
  openMenu(btn) {
    document.querySelector('.ws-menu')?.remove();
    const kind = btn.dataset.menu;
    const items = kind === 'block' ? BLOCKS : ENV_MENU;
    const menu = document.createElement('div');
    menu.className = 'ws-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map(([v, label, note, icon], i) => `<button type="button" role="menuitem" data-v="${v}" tabindex="${i ? -1 : 0}"><i data-lucide="${icon}"></i><span><b>${label}</b><small>${note}</small></span></button>`).join('');
    document.body.append(menu);
    icons();
    const r = btn.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, innerWidth - 280) + scrollX}px`;
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
      if (kind === 'block') this.command('block', null, b.dataset.v); else this.command('env', null, b.dataset.v);
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
    const dlg = $('#pub-dlg');
    const { added, removed } = diffLines(this.original, this.source);
    $('#pub-sum').textContent = this.isNew ? `New page · ${this.source.split('\n').length} lines` : `${added} line${added === 1 ? '' : 's'} added, ${removed} removed`;
    $('#pub-open').href = `${ORIGIN}/nlab/${this.isNew ? 'new' : 'edit'}/${encodeName(this.name)}`;
    $('#pub-forum').href = `forum.html?new=${encodeURIComponent(this.name)}`;
    $('#pub-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(this.source); $('#pub-copy span').textContent = 'Copied'; } catch { $('#pub-copy span').textContent = 'Copy failed: select the source in LaTeX mode'; }
    };
    $('#pub-done').onclick = () => { drafts.clear(this.name); dlg.close(); this.destroy(); this.onExit?.('published'); };
    $('#pub-copy span').textContent = 'Copy page source';
    dlg.showModal();
  }
}

// small helper so the formula preview in the symbol palette isn't empty in LaTeX mode
export const texToHtml = (tex) => katex.renderToString(tex, { throwOnError: false });
export { ENVS };
