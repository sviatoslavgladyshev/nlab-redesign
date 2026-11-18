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
