// Accounts.
//  • Site account (top bar): email + password in the site's database (core/db.js). Keeps your drafts
//    on every device. If the database isn't configured, the top bar falls back to the nForum account.
//  • nForum account (Forum page): signing in talks directly to nforum.ncatlab.org and keeps only an
//    API key in this browser; it is what lets you post in the forum.
import { auth as forumAuth, signIn as forumSignIn, signOut as forumSignOut } from '../core/forum-data.js';
import { dbEnabled, currentUser, displayName, initAuth, signUp, signIn, signOut, resetPassword } from '../core/db.js';
import { drafts } from '../core/drafts.js';
import { esc, FORUM } from '../core/nlab.js';
import { icons, busy } from './app.js';

const initials = (n) => n.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const changed = () => dispatchEvent(new CustomEvent('account-change'));

function makeDialog(html, onReady) {
  const d = document.createElement('dialog');
  d.className = 'modal acct-dlg';
  d.innerHTML = html;
  document.body.append(d);
  const tab = (t) => {
    d.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    d.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
    const tabs = d.querySelector('.acct-tabs');
    if (tabs) tabs.hidden = !['in', 'up'].includes(t); // only the sign-in / create-account panes have tabs
    d.querySelector(`[data-pane="${t}"] input`)?.focus();
  };
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-tab]')) tab(e.target.closest('[data-tab]').dataset.tab);
    if (e.target.closest('[data-close]') || e.target === d) d.close();
  });
  d.tab = tab;
  onReady(d);
  return d;
}
// run a form submit with a busy button and an error line
const submitting = (form, fn) => form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = form.querySelector('.si-err'), btn = form.querySelector('[type="submit"]');
  if (err) err.textContent = '';
  const stop = busy(btn);
  try { await fn(form); } catch (ex) { if (err) err.textContent = ex.friendly || ex.message || String(ex); } finally { stop(); }
});

/* ---------- site account (database) ---------- */
let siteDlg;
const siteDialog = () => (siteDlg ??= makeDialog(`
  <div class="acct-tabs" role="tablist">
    <button type="button" role="tab" data-tab="in" aria-selected="true">Sign in</button>
    <button type="button" role="tab" data-tab="up" aria-selected="false">Create account</button>
  </div>
  <form class="acct-pane" data-pane="in">
    <h2>Welcome back</h2>
    <p>Sign in to keep your drafts on every device.</p>
    <label>Email<input name="email" type="email" autocomplete="username" required></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <p class="si-err" role="alert"></p>
    <div class="modal-actions"><button class="tbtn" type="button" data-tab="reset">Forgot password?</button><button class="tbtn primary" type="submit">Sign in</button></div>
  </form>
  <form class="acct-pane" data-pane="up" hidden>
    <h2>Join the nLab community</h2>
    <ul class="acct-perks">
      <li><b>Write and edit</b> articles, with drafts saved to your account</li>
      <li><b>Pick up where you left off</b> on any device</li>
      <li><b>Get credit</b>: your name appears on your contributions</li>
    </ul>
    <label>Name<input name="name" type="text" autocomplete="name" required maxlength="80"></label>
    <label>Email<input name="email" type="email" autocomplete="email" required></label>
    <label>Password<input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
    <p class="si-err" role="alert"></p>
    <div class="modal-actions"><button class="tbtn" type="button" data-close>Cancel</button><button class="tbtn primary" type="submit">Create account</button></div>
    <p class="acct-fine">To post in the forum, connect your nForum account on the Forum page.</p>
  </form>
  <form class="acct-pane" data-pane="reset" hidden>
    <h2>Reset your password</h2>
    <p>We’ll email you a link to choose a new password.</p>
    <label>Email<input name="email" type="email" autocomplete="email" required></label>
    <p class="si-err" role="alert"></p>
    <div class="modal-actions"><button class="tbtn" type="button" data-tab="in">Back</button><button class="tbtn primary" type="submit">Send link</button></div>
  </form>
  <form class="acct-pane acct-done" data-pane="sent" method="dialog" hidden>
    <span class="acct-done-ic"><i data-lucide="mail-check"></i></span>
    <h2>Check your email</h2>
    <p class="acct-sent"></p>
    <div class="modal-actions"><button class="tbtn primary" type="submit">Got it</button></div>
  </form>`, (d) => {
  const sent = (msg) => { d.querySelector('.acct-sent').textContent = msg; d.tab('sent'); icons(); };
  submitting(d.querySelector('[data-pane="in"]'), async (f) => {
    try { await signIn(f.email.value.trim(), f.password.value); } catch (ex) {
      ex.friendly = /confirm/i.test(ex.message) ? 'Please confirm your email address first (check your inbox).' : /invalid|credential/i.test(ex.message) ? 'Email or password is not correct.' : `Could not sign in (${ex.message}).`;
      throw ex;
    }
    f.password.value = ''; d.close();
  });
  submitting(d.querySelector('[data-pane="up"]'), async (f) => {
    const email = f.email.value.trim();
    const { needsConfirmation } = await signUp(email, f.password.value, f.name.value.trim());
    f.password.value = '';
    if (needsConfirmation) sent(`We sent a confirmation link to ${email}. Open it, then sign in.`); else d.close();
  });
  submitting(d.querySelector('[data-pane="reset"]'), async (f) => {
    await resetPassword(f.email.value.trim());
    sent(`If there is an account for ${f.email.value.trim()}, a link to reset the password is on its way.`);
  });
}));

/* ---------- nForum account ---------- */
let forumDlg;
const forumDialog = () => (forumDlg ??= makeDialog(`
  <div class="acct-tabs" role="tablist">
    <button type="button" role="tab" data-tab="in" aria-selected="true">Connect nForum</button>
    <button type="button" role="tab" data-tab="up" aria-selected="false">New to the nForum</button>
  </div>
  <form class="acct-pane" data-pane="in">
    <h2>Connect your nForum account</h2>
    <p>Sign in with your nLab community (nForum) account to post in the forum.</p>
    <label>Email<input name="email" type="email" autocomplete="username" required></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <p class="si-err" role="alert"></p>
    <div class="modal-actions"><button class="tbtn" type="button" data-close>Cancel</button><button class="tbtn primary" type="submit">Connect</button></div>
    <p class="acct-fine">Your password goes only to nforum.ncatlab.org and is not stored.</p>
  </form>
  <form class="acct-pane" data-pane="up" hidden>
    <h2>Join the nForum</h2>
    <label>Email<input name="email" type="email" autocomplete="email" required></label>
    <p class="si-err" role="alert"></p>
    <p class="acct-fine">We’ll take you to the nForum’s sign-up to confirm your email address. Afterwards, connect it here.</p>
    <div class="modal-actions"><button class="tbtn" type="button" data-close>Cancel</button><button class="tbtn primary" type="submit">Continue</button></div>
  </form>`, (d) => {
  submitting(d.querySelector('[data-pane="in"]'), async (f) => {
    try { await forumSignIn(f.email.value.trim(), f.password.value); } catch (ex) {
      ex.friendly = /password|credential|invalid|disabled/i.test(ex.message) ? 'Email or password is not correct.' : `Could not sign in (${ex.message}).`;
      throw ex;
    }
    f.password.value = ''; d.close(); changed();
  });
  submitting(d.querySelector('[data-pane="up"]'), async (f) => {
    window.open(`${FORUM}/register/`, '_blank', 'noopener');
    d.tab('in');
    d.querySelector('[data-pane="in"] input[name="email"]').value = f.email.value;
  });
}));

export function openForumSignIn(which = 'in') { const d = forumDialog(); d.showModal(); d.tab(which); }
export function openAccount(which = 'in') {
  if (!dbEnabled) return openForumSignIn(which);
  const d = siteDialog(); d.showModal(); d.tab(which);
}

/* ---------- top bar ---------- */
function render() {
  const slot = document.querySelector('.nav-account');
  if (!slot) return;
  const site = dbEnabled ? currentUser() : null;
  const who = site ? { name: displayName(site), email: site.email } : !dbEnabled ? forumAuth.get() : null;
  if (!who) {
    slot.innerHTML = `<button type="button" class="nav-signin" data-acct="in">Sign in</button>
      <button type="button" class="nav-join" data-acct="up">Create account</button>`;
    return;
  }
  const n = drafts.list().length;
  slot.innerHTML = `<details class="acct-menu">
      <summary aria-label="Account"><span class="av" style="--h:${hue(who.name)};--s:34px">${esc(initials(who.name))}</span></summary>
      <div class="acct-pop">
        <p class="acct-who"><b>${esc(who.name)}</b><span>${esc(who.email)}</span></p>
        <a href="write">Write a page</a>
        <a href="write#drafts">My drafts${n ? ` <em>${n}</em>` : ''}</a>
        <a href="forum/">Forum</a>
        <button type="button" data-acct="out">Sign out</button>
      </div>
    </details>`;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-acct]');
  if (!b) return;
  if (b.dataset.acct === 'out') {
    if (dbEnabled) await signOut(); else { forumSignOut(); changed(); }
  } else openAccount(b.dataset.acct);
});
addEventListener('account-change', render);
addEventListener('drafts-synced', render);
render();
initAuth();
