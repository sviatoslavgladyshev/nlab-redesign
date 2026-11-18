// Pages deliberately excluded from this site's nLab mirror.
const excluded = new Set(['test']);

export const isExcludedPage = (name) => excluded.has(String(name ?? '').trim().toLowerCase());
