// Drafts of edited pages, kept in this browser (localStorage)
const draftKey = (name) => `nlab-draft:${name}`;
export const drafts = {
  get(name) { try { return JSON.parse(localStorage.getItem(draftKey(name))); } catch { return null; } },
  set(name, d) { try { localStorage.setItem(draftKey(name), JSON.stringify(d)); return true; } catch { return false; } },
  clear(name) { try { localStorage.removeItem(draftKey(name)); } catch { /* ignore */ } },
};
