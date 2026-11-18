const bibBlock = /^(~{3,})bibtex bibliography[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*(?=\r?$)/m;
export const bibliographyBlock = (source) => source.match(bibBlock)?.[0] || '';
export const bibliographyText = (source) => source.match(bibBlock)?.[2] || '';
export const withoutBibliography = (source) => source.replace(bibBlock, '');
export function bibliographySource(bib) {
  let longest = 2;
  for (const [run] of bib.matchAll(/^~+/gm)) longest = Math.max(longest, run.length);
  const fence = '~'.repeat(longest + 1);
  return `${fence}bibtex bibliography\n${bib}\n${fence}`;
}

let parser;
let cached;
export function parseBibliography(text) {
  if (!text) return Promise.resolve({ entries: [], errors: [] });
  if (text === cached?.text) return cached.result;
  parser ??= Promise.all([import('@retorquere/bibtex-parser'), import('@retorquere/bibtex-parser/bibtex_parser_bg.wasm?url')])
    .then(async ([{ default: init, parseAsync }, { default: url }]) => {
      await init({ module_or_path: url });
      return parseAsync;
    }).catch((error) => { parser = null; throw error; });
  const result = parser.then((parse) => parse(text, { english: [], caseProtection: 'off', unsupported: 'ignore' }));
  cached = { text, result };
  result.catch(() => { if (cached?.result === result) cached = null; });
  return result;
}

export const citationSource = (keys) => `\\cite{${keys.join(',')}}`;
export const referenceTitle = ({ key, fields }) => fields.title || key;
export const referenceAuthors = ({ fields }) => (fields.author || fields.editor || [])
  .map((person) => person.name || [person.firstName, person.prefix, person.lastName, person.suffix].filter(Boolean).join(' '))
  .join(', ');

export function referenceLink({ fields }) {
  const doi = fields.doi?.trim().replace(/^https?:\/\/doi\.org\//i, '');
  if (doi && /^10\.\d+\/\S+$/.test(doi)) return `https://doi.org/${encodeURI(doi)}`;
  try {
    const url = new URL(fields.url);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch { /* This reference may not have an external link. */ }
  return '';
}
