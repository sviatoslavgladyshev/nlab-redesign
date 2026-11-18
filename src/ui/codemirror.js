// CodeMirror 6 setup for nLab source (Markdown + itex/LaTeX):
// syntax highlighting, line numbers, search, and autocomplete for
//   \commands (with a rendered preview), \begin{environments}, and [[page links]].
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippet } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import katex from 'katex';
import { loadNames } from './suggest.js';

/* ---------- nLab source tokenizer ---------- */
const nlab = StreamLanguage.define({
  name: 'nlab',
  startState: () => ({ math: null }),
  token(stream, s) {
    if (s.math) {
      if (s.math === '$$' && stream.match('$$')) { s.math = null; return 'keyword'; }
      if (s.math === '\\]' && stream.match('\\]')) { s.math = null; return 'keyword'; }
      if (s.math === '$' && stream.match('$')) { s.math = null; return 'keyword'; }
      if (stream.match(/^\\[A-Za-z]+/)) return 'atom';
      if (stream.match(/^[{}^_&]/)) return 'operator';
      stream.next();
      return 'string';
    }
    if (stream.sol()) {
      if (stream.match(/^\s*(\+--.*|=--)\s*$/)) return 'meta';
      if (stream.match(/^#{1,6}\s.*$/)) return 'heading';
      if (stream.match(/^\s*([*+-]|\d+\.)\s/)) return 'list';
    }
    if (stream.match('$$')) { s.math = '$$'; return 'keyword'; }
    if (stream.match('\\[')) { s.math = '\\]'; return 'keyword'; }
    if (stream.match(/^\$(?=\S)/)) { s.math = '$'; return 'keyword'; }
    if (stream.match(/^\[\[[^\]\n]*\]\]/)) return 'link';
    if (stream.match(/^\[[^\]\n]*\]\([^)\n]*\)/)) return 'link';
    if (stream.match(/^\*\*[^*\n]+\*\*/)) return 'strong';
    if (stream.match(/^_[^_\s][^_\n]*_/)) return 'emphasis';
    if (stream.match(/^`[^`\n]*`/)) return 'monospace';
    if (stream.match(/^\{[:#][^}\n]*\}/)) return 'meta';
    if (stream.match(/^\\(begin|end)\{[^}]*\}/)) return 'meta';
    if (stream.match(/^<\/?[a-zA-Z][^>\n]*>/)) return 'comment';
    stream.next();
    return null;
  },
  tokenTable: { list: t.list },
});

const style = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700', color: 'var(--cm-heading)' },
  { tag: t.keyword, color: 'var(--cm-math-delim)', fontWeight: '600' },
  { tag: t.string, color: 'var(--cm-math)' },
  { tag: t.atom, color: 'var(--cm-command)' },
  { tag: t.operator, color: 'var(--cm-op)' },
  { tag: t.link, color: 'var(--cm-link)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.monospace, color: 'var(--cm-code)' },
  { tag: t.meta, color: 'var(--cm-meta)' },
  { tag: t.comment, color: 'var(--cm-meta)' },
  { tag: t.list, color: 'var(--cm-meta)' },
]);

/* ---------- Completions ---------- */
// [command, CodeMirror snippet (or null = plain), description]
export const CMDS = [
  ...'alpha beta gamma delta epsilon varepsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega'.split(' ').map((c) => [c, null, 'Greek letter']),
  ['mathbb', '\\mathbb{${1:Z}}', 'blackboard bold ℕ ℤ ℝ ℂ'], ['mathcal', '\\mathcal{${1:C}}', 'calligraphic: categories'],
  ['mathbf', '\\mathbf{${1:H}}', 'bold'], ['mathfrak', '\\mathfrak{${1:g}}', 'fraktur: Lie algebras'], ['mathrm', '\\mathrm{${1:Set}}', 'upright'],
  ['text', '\\text{${1:text}}', 'text inside math'], ['frac', '\\frac{${1:a}}{${2:b}}', 'fraction'], ['sqrt', '\\sqrt{${1:x}}', 'square root'],
  ['to', null, 'arrow, morphism'], ['mapsto', null, 'maps to'], ['longrightarrow', null, 'long arrow'], ['hookrightarrow', null, 'inclusion'],
  ['twoheadrightarrow', null, 'surjection'], ['leftarrow', null, ''], ['Rightarrow', null, 'implies, 2-morphism'], ['Leftrightarrow', null, 'iff'],
  ['rightleftarrows', null, 'pair of arrows'], ['xrightarrow', '\\xrightarrow{${1:f}}', 'labelled arrow'],
  ['stackrel', '\\stackrel{${1:f}}{\\to}', 'symbol over an arrow'], ['overset', '\\overset{${1:a}}{${2:b}}', ''], ['underset', '\\underset{${1:a}}{${2:b}}', ''],
  ['dashv', null, 'adjunction L ⊣ R'], ['vdash', null, 'entails'], ['top', null, ''], ['bot', null, ''],
  ['simeq', null, 'equivalence'], ['cong', null, 'isomorphism'], ['equiv', null, ''], ['sim', null, ''], ['approx', null, ''],
  ['neq', null, ''], ['leq', null, ''], ['geq', null, ''], ['coloneqq', null, 'definition :='],
  ['otimes', null, 'tensor product'], ['oplus', null, 'direct sum'], ['times', null, 'product'], ['circ', null, 'composition'], ['cdot', null, ''],
  ['wedge', null, ''], ['vee', null, ''], ['coprod', null, 'coproduct'], ['prod', null, ''], ['sum', null, ''], ['int', null, 'integral'],
  ['partial', null, ''], ['nabla', null, ''], ['infty', null, 'infinity'], ['in', null, ''], ['notin', null, ''], ['subset', null, ''],
  ['subseteq', null, ''], ['cup', null, ''], ['cap', null, ''], ['emptyset', null, ''], ['forall', null, ''], ['exists', null, ''], ['neg', null, ''],
  ['langle', '\\langle ${1:x} \\rangle', 'angle brackets'], ['vert', null, ''], ['ldots', null, ''], ['cdots', null, ''],
  ['hat', '\\hat{${1:x}}', ''], ['tilde', '\\tilde{${1:x}}', ''], ['bar', '\\bar{${1:x}}', ''], ['overline', '\\overline{${1:x}}', ''],
  ['left(', '\\left( ${1:x} \\right)', 'growing parentheses'],
  ['array', '\\array{\n  ${1:A} &\\overset{f}{\\to}& ${2:B}\n  \\\\\n  \\downarrow && \\downarrow\n  \\\\\n  C &\\underset{g}{\\to}& D\n}', 'commutative square (itex)'],
  ['begin{aligned}', '\\begin{aligned}\n  ${1:a} &= ${2:b}\n\\end{aligned}', 'aligned equations'],
  ['quad', null, 'space'], ['qquad', null, 'wide space'], ['lim', '\\lim_{${1:i}}', 'limit'],
  ['Hom', '\\mathrm{Hom}(${1:X}, ${2:Y})', 'hom-set'],
];
export const ENVS = [
  ['definition', 'defn', 'Definition'], ['proposition', 'prop', 'Proposition'], ['theorem', 'theorem', 'Theorem'],
  ['lemma', 'lemma', 'Lemma'], ['corollary', 'cor', 'Corollary'], ['example', 'example', 'Example'],
  ['remark', 'remark', 'Remark'], ['proof', 'proof', 'Proof'],
];
export const envSource = (cls, label, body = '') => (cls === 'proof'
  ? `+-- {: .proof}\n###### Proof\n\n${body}\n\n=--`
  : `+-- {: .num_${cls} #${label}${Date.now().toString(36).slice(-4)}}\n###### ${label}\n\n${body}\n\n=--`);

const texPreview = (cmd, snip) => {
  if (snip && /\n/.test(snip)) return '';
  const tex = (snip ?? `\\${cmd}`).replace(/\$\{\d+:([^}]*)\}/g, '$1');
  try { return katex.renderToString(tex, { throwOnError: true, strict: 'ignore' }); } catch { return ''; }
};

async function completions(ctx) {
  let m = ctx.matchBefore(/\\begin\{\w*/);
  if (m) {
    return {
      from: m.from,
      options: ENVS.map(([n, cls, label]) => ({
        label: `\\begin{${n}}`, detail: cls === 'proof' ? 'proof' : 'numbered', type: 'class',
        apply: snippet(envSource(cls, label, '${1:…}')),
      })),
    };
  }
  m = ctx.matchBefore(/\[\[[^\]\n|]*/);
  if (m) {
    const q = m.text.slice(2).toLowerCase();
    if (!q && !ctx.explicit) return null;
    const names = await loadNames();
    const hits = [];
    for (const n of names) {
      const i = n.toLowerCase().indexOf(q);
      if (i >= 0) hits.push([(i === 0 ? 0 : 1) * 1000 + n.length, n]);
      if (hits.length > 4000) break;
    }
    return {
      from: m.from + 2, filter: false,
      options: hits.sort((a, b) => a[0] - b[0]).slice(0, 30).map(([, n]) => ({ label: n, type: 'text', detail: 'nLab page', apply: `${n}]]` })),
    };
  }
  m = ctx.matchBefore(/\\[A-Za-z(]*/);
  if (m && (m.to - m.from > 1 || ctx.explicit)) {
    return {
      from: m.from,
      options: CMDS.map(([c, snip, note]) => ({
        label: `\\${c}`, detail: note || undefined, type: 'keyword', tex: texPreview(c, snip),
        apply: snip ? snippet(snip) : `\\${c}`,
      })),
    };
  }
  return null;
}

/* ---------- Formatting commands ---------- */
export function wrapSel(view, before, after, ph = '') {
  const { from, to } = view.state.selection.main;
  const sel = view.state.sliceDoc(from, to) || ph;
  view.dispatch({ changes: { from, to, insert: before + sel + after }, selection: { anchor: from + before.length, head: from + before.length + sel.length } });
  view.focus();
  return true;
}
export function prefixLines(view, fn) {
  const { from, to } = view.state.selection.main;
  const a = view.state.doc.lineAt(from), b = view.state.doc.lineAt(to);
  const changes = [];
  for (let n = a.number, i = 0; n <= b.number; n++, i++) {
    const line = view.state.doc.line(n);
    const next = fn(line.text, i);
    changes.push({ from: line.from, to: line.to, insert: next });
  }
  view.dispatch({ changes });
  view.focus();
  return true;
}
export function insertBlock(view, text, selectFrom, selectTo) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const at = line.to;
  const pre = line.text.trim() ? '\n\n' : '\n';
  const insert = `${pre}${text}\n`;
  const base = at + pre.length;
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: base + (selectFrom ?? text.length), head: base + (selectTo ?? selectFrom ?? text.length) }, scrollIntoView: true });
  view.focus();
  return true;
}
export const FORMAT = {
  bold: (v) => wrapSel(v, '**', '**', 'bold text'),
  italic: (v) => wrapSel(v, '_', '_', 'emphasis'),
  code: (v) => wrapSel(v, '`', '`', 'code'),
  math: (v) => wrapSel(v, '$', '$', 'x'),
  display: (v) => insertBlock(v, '$$\n  a \\otimes b\n$$', 5, 17),
  link: (v) => wrapSel(v, '[[', ']]', 'page name'),
  heading: (v) => prefixLines(v, (l) => (/^#{2,5}\s/.test(l) ? l.replace(/^(#+)/, '$1#') : /^#{6}\s/.test(l) ? l.replace(/^#+\s/, '') : `## ${l}`)),
  list: (v) => prefixLines(v, (l) => (/^\* /.test(l) ? l.slice(2) : `* ${l}`)),
  olist: (v) => prefixLines(v, (l, i) => (/^\d+\. /.test(l) ? l.replace(/^\d+\. /, '') : `${i + 1}. ${l}`)),
  quote: (v) => prefixLines(v, (l) => (/^> /.test(l) ? l.slice(2) : `> ${l}`)),
  env: (v, cls, label) => { const s = envSource(cls, label, '…'); const i = s.indexOf('…'); return insertBlock(v, s, i, i + 1); },
};

/* ---------- Editor factory ---------- */
export function createSourceEditor({ parent, doc = '', onChange, onSave, compact = false, placeholder = '' }) {
  const exts = [
    history(), drawSelection(), indentOnInput(), bracketMatching(), closeBrackets(), highlightSelectionMatches(),
    nlab, syntaxHighlighting(style), EditorView.lineWrapping,
    autocompletion({
      override: [completions], activateOnTyping: true, icons: false,
      addToOptions: [{ render: (c) => { const s = document.createElement('span'); s.className = 'cm-tex'; s.innerHTML = c.tex || ''; return s; }, position: 20 }],
    }),
    keymap.of([
      { key: 'Mod-b', run: FORMAT.bold }, { key: 'Mod-i', run: FORMAT.italic }, { key: 'Mod-m', run: FORMAT.math },
      { key: 'Mod-k', run: FORMAT.link }, { key: 'Mod-s', run: () => { onSave?.(); return true; } },
      ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab,
    ]),
    EditorView.updateListener.of((u) => { if (u.docChanged) onChange?.(u.state.doc.toString()); }),
  ];
  if (!compact) exts.push(lineNumbers(), highlightActiveLine(), highlightActiveLineGutter());
  if (placeholder) exts.push(cmPlaceholder(placeholder));
  const view = new EditorView({ parent, state: EditorState.create({ doc, extensions: exts }) });
  view.dom.classList.add(compact ? 'cm-compact' : 'cm-full');
  return view;
}
export const setDoc = (view, text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
