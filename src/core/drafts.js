// Drafts of edited pages. Always kept in this browser (localStorage), so writing works offline and
// instantly; when you are signed in they are also saved to the site's database, so they follow you
// to every device. On sign-in the two are merged: the newer version of each draft wins.
import { dbEnabled, currentUser, fetchDrafts, saveDraft, deleteDraft } from './db.js';

const PREFIX = 'nlab-draft:';
const draftKey = (name) => `${PREFIX}${name}`;
const local = {
  get(name) { try { return JSON.parse(localStorage.getItem(draftKey(name))); } catch { return null; } },
  set(name, d) { try { localStorage.setItem(draftKey(name), JSON.stringify(d)); return true; } catch { return false; } },
  clear(name) { try { localStorage.removeItem(draftKey(name)); } catch { /* ignore */ } },
  all() {
    try { return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).map((k) => ({ name: k.slice(PREFIX.length), ...JSON.parse(localStorage.getItem(k)) })); } catch { return []; }
  },
};

// The editor saves every few hundred milliseconds while you type; the database gets one write per
// draft every couple of seconds.
const pending = new Map();
const pushLater = (name) => {
  if (!dbEnabled || !currentUser()) return;
  clearTimeout(pending.get(name));
  pending.set(name, setTimeout(() => {
    pending.delete(name);
    const d = local.get(name);
    (d ? saveDraft(name, d) : deleteDraft(name)).catch(() => { /* stays local; synced on next sign-in */ });
  }, 1500));
};

export const drafts = {
  get: (name) => local.get(name),
  set(name, d) { const ok = local.set(name, d); pushLater(name); return ok; },
  clear(name) { local.clear(name); pushLater(name); },
  list: () => local.all().sort((a, b) => b.savedAt - a.savedAt),
};
export const draftsSynced = () => dbEnabled && !!currentUser();

async function sync() {
  if (!dbEnabled || !currentUser()) return;
  try {
    const remote = new Map((await fetchDrafts()).map((d) => [d.name, d]));
    for (const [name, r] of remote) {
      const l = local.get(name);
      if (!l || l.savedAt < r.savedAt) local.set(name, { source: r.source, savedAt: r.savedAt, isNew: r.isNew });
    }
    await Promise.all(local.all().filter((l) => !remote.has(l.name) || remote.get(l.name).savedAt < l.savedAt)
      .map((l) => saveDraft(l.name, l)));
    dispatchEvent(new CustomEvent('drafts-synced'));
  } catch { /* offline or not set up yet: drafts stay in this browser */ }
}
addEventListener('account-change', sync);
