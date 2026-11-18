// The site's database (Supabase): accounts, drafts synced across devices, and the updates list.
// Configured by VITE_SUPABASE_URL and VITE_SUPABASE_KEY (the *publishable* key, which is meant to be
// public; what each visitor may read or write is decided by the row-level security rules in
// supabase/schema.sql). Without them, everything keeps working and stays in this browser.
const URL_ = import.meta.env.VITE_SUPABASE_URL || '';
const KEY = import.meta.env.VITE_SUPABASE_KEY || '';
export const dbEnabled = !!(URL_ && KEY);

let clientP;
// the client library is loaded only when it is first needed
export const db = () => (clientP ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL_, KEY)));

let session = null;
export const currentUser = () => session?.user || null;
export const displayName = (u = currentUser()) => u?.user_metadata?.name || u?.email?.split('@')[0] || '';

// Restore the session (kept by Supabase in this browser) and announce every sign-in / sign-out
// as an `account-change` event, which the account menu, drafts and forum listen to.
export async function initAuth() {
  if (!dbEnabled) return;
  const c = await db();
  session = (await c.auth.getSession()).data.session;
  if (session) dispatchEvent(new CustomEvent('account-change'));
  c.auth.onAuthStateChange((_event, s) => {
    const changed = (s?.user?.id || null) !== (session?.user?.id || null);
    session = s;
    if (changed) dispatchEvent(new CustomEvent('account-change'));
  });
}

export async function signUp(email, password, name) {
  const c = await db();
  const { data, error } = await c.auth.signUp({
    email, password,
    options: { data: { name }, emailRedirectTo: new URL('./', document.baseURI).href },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}
export async function signIn(email, password) {
  const c = await db();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signOut() {
  const c = await db();
  await c.auth.signOut();
}
export async function resetPassword(email) {
  const c = await db();
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: new URL('./', document.baseURI).href });
  if (error) throw error;
}

/* ---------- drafts ---------- */
export async function fetchDrafts() {
  const c = await db();
  const { data, error } = await c.from('drafts').select('name, source, is_new, saved_at');
  if (error) throw error;
  return data.map((r) => ({ name: r.name, source: r.source, isNew: r.is_new, savedAt: Date.parse(r.saved_at) }));
}
export async function saveDraft(name, d) {
  const u = currentUser();
  if (!u) return;
  const c = await db();
  const { error } = await c.from('drafts').upsert({ user_id: u.id, name, source: d.source, is_new: !!d.isNew, saved_at: new Date(d.savedAt).toISOString() });
  if (error) throw error;
}
export async function deleteDraft(name) {
  const u = currentUser();
  if (!u) return;
  const c = await db();
  const { error } = await c.from('drafts').delete().eq('user_id', u.id).eq('name', name);
  if (error) throw error;
}

/* ---------- updates list ---------- */
export async function subscribe(email, topics) {
  const c = await db();
  const { error } = await c.from('subscribers').insert({ email, topics });
  if (error && error.code !== '23505') throw error; // 23505: already subscribed, which is fine
}

/* ---------- nLab content (supabase/content.sql) ---------- */
const rpc = async (fn, args) => {
  const c = await db();
  const { data, error } = await c.rpc(fn, args);
  if (error) throw error;
  return data;
};
// a page by name or alternative name; null if the database doesn't have it
export const getPage = async (name) => (await rpc('get_page', { p_name: name }))?.[0] || null;
// full-text search through every page's text (web-search syntax: words, "phrases", OR, -word)
export const searchText = (q, { kind = null, field = null, limit = 30, offset = 0 } = {}) =>
  rpc('search_pages', { q, p_kind: kind, p_field: field, p_limit: limit, p_offset: offset });
export const backlinks = (name, limit = 60) => rpc('backlinks', { p_name: name, p_limit: limit });
export const similarPages = (name, limit = 8) => rpc('similar_pages', { p_name: name, p_limit: limit });
export const pageHistory = (name) => rpc('page_history', { p_name: name });
export const pagesExist = async (names) => new Set((await rpc('pages_exist', { p_names: names })).map((n) => n.toLowerCase()));
// publish (new pages, sandboxes, pages started here) or suggest an edit (other nLab pages)
export const savePage = (name, source, { summary = '', links = [], note = '' } = {}) =>
  rpc('save_page', { p_name: name, p_source: source, p_summary: summary, p_links: links, p_note: note });
export const suggestEdit = (name, source, note = '') => rpc('suggest_edit', { p_name: name, p_source: source, p_note: note });

/* ---------- smart search (supabase/rag.sql + functions/search) ---------- */
// Meaning + words. Falls back to word-only full-text search if the search function isn't deployed.
export async function smartSearch(q, { kind = null, field = null, limit = 40 } = {}) {
  try {
    const res = await fetch(`${URL_}/functions/v1/search`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, kind, field, limit }),
    });
    if (!res.ok) throw new Error(`search ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(rows?.error || 'search failed');
    return rows;
  } catch {
    return (await searchText(q, { kind, field, limit })).map((r) => ({ ...r, by_words: true, by_meaning: false }));
  }
}
// pages closest in meaning to this one
export const relatedPages = (name, limit = 8) => rpc('related_pages', { p_name: name, p_limit: limit });
