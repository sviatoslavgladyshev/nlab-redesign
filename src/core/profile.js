import { currentUser, db, dbEnabled } from './db.js';

const COLUMNS = 'display_name, affiliation, bio, theme, focus_read';
const cacheKey = (id) => `nlab-profile-v1:${id}`;
const pending = new Map();

// The signed-in user's own profile is kept on this device, so the profile shows instantly in every tab;
// it is refreshed from the database in the background.
function readCache(id) {
  try { return JSON.parse(localStorage.getItem(cacheKey(id)) || sessionStorage.getItem(cacheKey(id))); }
  catch { return null; }
}

function writeCache(id, profile) {
  try { localStorage.setItem(cacheKey(id), JSON.stringify({ profile, time: Date.now() })); }
  catch { /* Storage may be unavailable. */ }
}
export const forgetProfileCache = (id) => { try { localStorage.removeItem(cacheKey(id)); sessionStorage.removeItem(cacheKey(id)); } catch { /* ignore */ } };

export const cachedProfile = (user = currentUser()) => user ? readCache(user.id)?.profile : null;

export async function loadProfile(user = currentUser(), { fresh = false } = {}) {
  if (!dbEnabled || !user) return null;
  const cached = readCache(user.id);
  if (!fresh && cached && Date.now() - cached.time < 60_000) return cached.profile;
  if (!pending.has(user.id)) {
    const request = (async () => {
      const client = await db();
      const { data, error } = await client.from('profiles').select(COLUMNS).eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (currentUser()?.id === user.id) writeCache(user.id, data);
      return data;
    })().finally(() => pending.delete(user.id));
    pending.set(user.id, request);
  }
  return pending.get(user.id);
}

export async function saveProfile(user, details) {
  const client = await db();
  if (currentUser()?.id !== user.id) throw new Error('Sign in again to save your profile.');
  const { data, error } = await client.from('profiles')
    .upsert({ ...details, user_id: user.id }).select(COLUMNS).single();
  if (error) throw error;
  if (currentUser()?.id === user.id) {
    writeCache(user.id, data);
    applyProfilePreferences(data, user.id, true);
    dispatchEvent(new CustomEvent('profile-change'));
  }
  return data;
}

export async function deleteAccount(user, confirmation) {
  const client = await db();
  if (currentUser()?.id !== user.id) throw new Error('Sign in again to delete your account.');
  const { error } = await client.rpc('delete_my_account', {
    p_expected_user: user.id,
    p_confirmation: confirmation,
  });
  if (error) throw error;
  try { sessionStorage.removeItem(cacheKey(user.id)); }
  catch { /* Storage may be unavailable. */ }
  if (currentUser()?.id === user.id) {
    // The account is already gone even if the logout request fails.
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
  }
}

export function applyProfilePreferences(profile, userId, force = false) {
  if (!profile) return;
  const signature = JSON.stringify([userId, profile.theme, profile.focus_read]);
  try {
    if (!force && sessionStorage.getItem('nlab-applied-profile-prefs') === signature) return;
    sessionStorage.setItem('nlab-applied-profile-prefs', signature);
  } catch { /* Storage may be unavailable. */ }
  if (profile.theme) {
    const mode = profile.theme === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : profile.theme;
    try {
      if (profile.theme === 'system') localStorage.removeItem('nlab-mode');
      else localStorage.setItem('nlab-mode', mode);
    } catch { /* Storage may be unavailable. */ }
    if (document.documentElement.dataset.mode !== mode) {
      document.documentElement.dataset.mode = mode;
      dispatchEvent(new CustomEvent('modechange', { detail: mode }));
    }
  }
  if (typeof profile.focus_read === 'boolean') {
    try { localStorage.setItem('nlab-focus-read', profile.focus_read ? '1' : '0'); }
    catch { /* Storage may be unavailable. */ }
    dispatchEvent(new CustomEvent('reading-preference-change', { detail: profile.focus_read }));
  }
}

// signing out leaves no copy of the profile on this device
addEventListener('account-change', () => {
  if (currentUser()) return;
  try { Object.keys(localStorage).filter((k) => k.startsWith('nlab-profile-v1:') || k.startsWith('nlab-publications:')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
});
