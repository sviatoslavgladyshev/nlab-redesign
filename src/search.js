// Full-text page search over the build-time index (snapshot/search.json):
// every page's name, aliases, kind, fields, how often it is linked to, and a short summary.
// Loaded once, lazily, the first time someone searches.
//
// Query language (like a library catalogue):
//   adjoint functor          all words, ranked (AND is implied)
//   "exact phrase"           the words in this order
//   sheaf OR stack           either
//   topos NOT elementary     exclude (also: -elementary)
//   ( … )                    grouping
//   homot*                   any word starting with “homot”
//   title:monad              only in titles and alternative names
//   summary:spectral         only in the summary
//   kind:person              concept · theorem · person · reference

let idxP;
export const loadSearchIndex = () => (idxP ??= fetch('snapshot/search.json').then((r) => r.json()).then((rows) =>
  rows.map(([name, kind, inbound, summary, fields, ...aliases]) => ({
    name, kind, inbound, summary, fields, aliases,
    n: norm(name), a: aliases.map(norm), s: norm(summary),
  }))));

export const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-–—_]/g, ' ').replace(/[^\p{L}\p{N}∞ ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const stem = (w) => (w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '') : w);
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'for', 'to', 'is', 'what', 'how', 'with', 'by']);
const reEsc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, w) => text.includes(w) && new RegExp(`(^| )${reEsc(w)}`).test(text);
const KIND_WORDS = { concept: 'c', concepts: 'c', theorem: 't', theorems: 't', result: 't', person: 'p', people: 'p', author: 'p', reference: 'r', references: 'r', book: 'r', disambiguation: 'd' };

/* ---------- parsing ---------- */
function tokenize(q) {
  const out = [];
  const re = /\s*(?:(\()|(\))|(-)?(?:([a-z]+):)?"([^"]*)"?|(-)?(?:([a-z]+):)?([^\s()"]+))/giy;
  let m;
  while ((m = re.exec(q)) && m[0]) {
    if (m[1]) out.push({ t: '(' });
    else if (m[2]) out.push({ t: ')' });
    else if (m[5] != null) out.push({ t: 'atom', neg: !!m[3], field: (m[4] || '').toLowerCase(), phrase: true, v: m[5] });
    else {
      const v = m[8];
      if (/^(AND|&&)$/.test(v)) out.push({ t: 'and' });
      else if (/^(OR|\|\|)$/.test(v)) out.push({ t: 'or' });
      else if (/^(NOT|!)$/.test(v)) out.push({ t: 'not' });
      else out.push({ t: 'atom', neg: !!m[6] && v.length > 0, field: (m[7] || '').toLowerCase(), v });
    }
  }
  return out;
}
export function parse(q) {
  const toks = tokenize(q);
  let i = 0;
  const peek = () => toks[i];
  const orE = () => {
    const parts = [andE()];
    while (peek()?.t === 'or') { i++; parts.push(andE()); }
    return parts.length > 1 ? { op: 'or', parts } : parts[0];
  };
  const andE = () => {
    const parts = [];
    while (peek() && peek().t !== ')' && peek().t !== 'or') {
      if (peek().t === 'and') { i++; continue; }
      const u = unary();
      if (u) parts.push(u);
    }
    return parts.length === 1 ? parts[0] : { op: 'and', parts };
  };
  const unary = () => {
    const t = toks[i++];
    if (t.t === 'not') { const u = peek() ? unary() : null; return u && { op: 'not', part: u }; }
    if (t.t === '(') { const e = orE(); if (peek()?.t === ')') i++; return e; }
    if (t.t === ')') return null;
    const atom = makeAtom(t);
    return atom && (t.neg ? { op: 'not', part: atom } : atom);
  };
  return toks.length ? orE() : null;
}
function makeAtom({ field, v, phrase }) {
  if (field === 'kind' || field === 'type') {
    const k = KIND_WORDS[v.toLowerCase()] || v.toLowerCase()[0];
    return { op: 'kind', k };
  }
  const where = field === 'title' || field === 'name' || field === 'intitle' ? 'title' : field === 'summary' || field === 'text' || field === 'abstract' ? 'summary' : 'any';
  const prefix = !phrase && v.endsWith('*');
  const words = norm(v.replace(/\*$/, ''));
  if (!words) return null;
  if (!phrase && !field && STOP.has(words)) return null;
  return { op: 'term', where, phrase: phrase || words.includes(' '), prefix, w: phrase || words.includes(' ') ? words : prefix ? words : stem(words), raw: words };
}

/* ---------- evaluation ---------- */
const termIn = (text, t) => (t.phrase ? text.includes(t.w) : t.prefix ? hasWord(text, t.w) : hasWord(text, t.w));
function evalNode(node, r) {
  switch (node.op) {
    case 'and': return node.parts.every((p) => evalNode(p, r));
    case 'or': return node.parts.some((p) => evalNode(p, r));
    case 'not': return !evalNode(node.part, r);
    case 'kind': return r.kind === node.k;
    default: {
      const inTitle = termIn(r.n, node) || r.a.some((a) => termIn(a, node));
      if (node.where === 'title') return inTitle;
      if (node.where === 'summary') return termIn(r.s, node);
      return inTitle || termIn(r.s, node);
    }
  }
}
const positives = (node, out = []) => {
  if (!node) return out;
  if (node.op === 'term') out.push(node);
  else if (node.parts) node.parts.forEach((p) => positives(p, out));
  return out; // terms under NOT are skipped on purpose
};
export const isAdvanced = (q) => /["()*:]|(^|\s)-\S|\b(AND|OR|NOT)\b/.test(q);

/* ---------- ranking ---------- */
function relevance(r, phrase, terms) {
  let score = 0, via = null;
  if (phrase) {
    if (r.n === phrase) score = 1000;
    else if (r.a.includes(phrase)) { score = r.kind === 'p' && !phrase.includes(' ') ? 480 : 850; via = r.aliases[r.a.indexOf(phrase)]; }
    else if (r.n.startsWith(phrase)) score = 600;
    else if (hasWord(r.n, phrase)) score = 480;
    else if (r.n.includes(phrase)) score = 380;
    else { const ai = r.a.findIndex((a) => hasWord(a, phrase)); if (ai >= 0) { score = 330; via = r.aliases[ai]; } }
  }
  let inName = 0, inSum = 0;
  for (const t of terms) {
    if (!phrase && (r.n === t.w || r.n === t.raw || r.a.includes(t.raw))) score += 520; // a page named exactly after a term
    else if (!phrase && r.n.startsWith(t.raw)) score += 120;
    if (termIn(r.n, t) || r.a.some((a) => termIn(a, t))) inName++;
    else if (termIn(r.s, t)) inSum++;
  }
  if (score < 330) {
    score += terms.length && inName === terms.length ? 260 : 60 + inName * 60 + inSum * 18;
    if (phrase && phrase.includes(' ') && r.s.includes(phrase)) score += 70;
  } else if (phrase && r.s.includes(phrase)) score += 20;
  score += 55 * Math.log10(1 + r.inbound) - Math.min(40, r.name.length * 0.6);
  if (r.kind === 'd') score -= 30;
  return { score, via };
}

// opts: { where: 'any'|'title', field: index|null }
export async function searchAll(q, opts = {}) {
  const rows = await loadSearchIndex();
  const tree = parse(q);
  if (!tree) return { hits: [], tree: null };
  const advanced = isAdvanced(q);
  const terms = positives(tree);
  if (opts.where === 'title') terms.forEach((t) => { if (t.where === 'any') t.where = 'title'; });
  // plain queries rank a whole-phrase title match first
  const phrase = advanced ? (terms.length === 1 && terms[0].phrase ? terms[0].w : '') : norm(q);
  const fieldBit = opts.field != null ? 1 << opts.field : 0;
  const out = [];
  for (const r of rows) {
    if (fieldBit && !(r.fields & fieldBit)) continue;
    if (!evalNode(tree, r)) {
      // plain queries also accept an exact alias/phrase match in the title
      if (advanced || !phrase || !(r.n.includes(phrase) || r.a.some((a) => a.includes(phrase)))) continue;
      if (opts.where === 'title' && !(r.n.includes(phrase) || r.a.some((a) => a.includes(phrase)))) continue;
    }
    const { score, via } = relevance(r, phrase, terms);
    out.push({ ...r, score, via });
  }
  if (opts.sort === 'linked') out.sort((a, b) => b.inbound - a.inbound);
  else if (opts.sort === 'az') out.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  else out.sort((a, b) => b.score - a.score);
  return { hits: out, tree, advanced };
}

// Plain words of a query (for highlighting and the forum match)
export function terms(q) {
  const t = positives(parse(q)).map((x) => x.w);
  return t.length ? t : norm(q).split(' ').filter(Boolean).map(stem);
}

// Explain a parsed query in words ("title contains “monad” and not …")
export function explain(node) {
  if (!node) return '';
  const q = (t) => `“${t.raw}${t.prefix ? '…' : ''}”`;
  switch (node.op) {
    case 'and': return node.parts.map(explain).join(' <b>and</b> ');
    case 'or': return `(${node.parts.map(explain).join(' <b>or</b> ')})`;
    case 'not': return `<b>not</b> ${explain(node.part)}`;
    case 'kind': return `kind is <i>${({ c: 'concept', t: 'theorem', p: 'person', r: 'reference', d: 'disambiguation' })[node.k] || node.k}</i>`;
    default: return node.where === 'title' ? `title has ${q(node)}` : node.where === 'summary' ? `summary has ${q(node)}` : q(node);
  }
}

// Escape and highlight the query terms in a piece of text
const escH = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function highlight(text, q) {
  const words = terms(q).filter((w) => w.length > 1).sort((a, b) => b.length - a.length);
  if (!words.length) return escH(text);
  const re = new RegExp(`\\b(${words.map((w) => reEsc(w).replace(/ /g, '[\\s-]+')).join('|')})\\w*`, 'gi');
  return escH(text).replace(re, '<mark>$&</mark>');
}
