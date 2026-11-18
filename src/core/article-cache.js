// Public article source only. Drafts and account state have their own storage.
const PREFIX = 'nlab:article:v1:';
const MAX_AGE = 24 * 3600_000;   // shown from the saved copy for a day…
export const FRESH_FOR = 5 * 60_000; // …and refreshed in the background once it is older than this
const MAX_ENTRIES = 60;
const MAX_SOURCE_LENGTH = 200_000;
const keyFor = (name) => PREFIX + name.trim().toLowerCase();

export function readArticleCache(name) {
  try {
    const entry = JSON.parse(localStorage.getItem(keyFor(name)));
    if (entry && Date.now() - entry.savedAt < MAX_AGE
        && typeof entry.page?.name === 'string' && typeof entry.page.source === 'string') return { ...entry.page, cachedAt: entry.savedAt };
  } catch { /* Storage may be unavailable. */ }
  return null;
}

export function cacheArticle(name, page) {
  if (page.source.length > MAX_SOURCE_LENGTH) return;
  const { cachedAt, ...clean } = page; // eslint-disable-line no-unused-vars
  page = clean;
  try {
    const key = keyFor(name);
    const keys = Object.keys(localStorage).filter((entry) => entry.startsWith(PREFIX) && entry !== key);
    if (keys.length >= MAX_ENTRIES) {
      const entries = keys.map((entry) => ({ key: entry, savedAt: JSON.parse(localStorage.getItem(entry))?.savedAt || 0 }))
        .sort((a, b) => b.savedAt - a.savedAt);
      for (const entry of entries.slice(MAX_ENTRIES - 1)) localStorage.removeItem(entry.key);
    }
    localStorage.setItem(key, JSON.stringify({ page, savedAt: Date.now() }));
  } catch { /* Reading works without persistent caching. */ }
}

export function invalidateArticleCache(name) {
  const key = keyFor(name);
  try {
    for (const entry of Object.keys(localStorage)) {
      if (!entry.startsWith(PREFIX)) continue;
      const canonical = JSON.parse(localStorage.getItem(entry))?.page?.name;
      if (entry === key || (canonical && keyFor(canonical) === key)) localStorage.removeItem(entry);
    }
  } catch { /* Storage may be unavailable. */ }
}
