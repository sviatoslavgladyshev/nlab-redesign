// A small persistent cache for public, read-only data (related pages, backlinks…): a saved copy is
// returned at once, and if it is more than a few minutes old a fresh one is fetched in the background
// for next time ("stale-while-revalidate"). Same requests made at the same time share one fetch.
const PREFIX = 'nlab:swr:v1:';
const inflight = new Map();

export function swr(key, fetcher, { maxAge = 24 * 3600e3, fresh = 5 * 60e3 } = {}) {
  const k = PREFIX + key;
  let entry = null;
  try { entry = JSON.parse(localStorage.getItem(k)); } catch { /* storage unavailable */ }
  const age = entry ? Date.now() - entry.t : Infinity;
  const load = () => {
    if (!inflight.has(k)) {
      inflight.set(k, Promise.resolve().then(fetcher).then((value) => {
        save(k, value);
        return value;
      }).finally(() => inflight.delete(k)));
    }
    return inflight.get(k);
  };
  if (entry && age < maxAge) {
    if (age > fresh) load().catch(() => {}); // refresh quietly for next time
    return Promise.resolve(entry.v);
  }
  return load();
}

function save(k, value) {
  const text = JSON.stringify({ t: Date.now(), v: value });
  try { localStorage.setItem(k, text); return; } catch { /* full: make room */ }
  try {
    const keys = Object.keys(localStorage).filter((x) => x.startsWith(PREFIX))
      .map((x) => [x, JSON.parse(localStorage.getItem(x))?.t || 0]).sort((a, b) => a[1] - b[1]);
    keys.slice(0, Math.ceil(keys.length / 2)).forEach(([x]) => localStorage.removeItem(x));
    localStorage.setItem(k, text);
  } catch { /* works without the cache */ }
}
