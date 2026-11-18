// Account menu in the top bar (every page).
// nLab community accounts are nForum accounts: signing in here talks directly to
// nforum.ncatlab.org and keeps only an API key in this browser. New accounts are created on
// the nForum's own sign-up page (it confirms the email address), then used here.
import { auth, signIn, signOut } from './forum-data.js';
import { esc, FORUM } from './nlab.js';

const initials = (n) => n.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const draftCount = () => { try { return Object.keys(localStorage).filter((k) => k.startsWith('nlab-draft:')).length; } catch { return 0; } };

let dlg;
function dialog() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.className = 'modal acct-dlg';
  dlg.innerHTML = `
    <div class="acct-tabs" role="tablist">
      <button type="button" role="tab" data-tab="in" aria-selected="true">Sign in</button>
      <button type="button" role="tab" data-tab="up" aria-selected="false">Create account</button>
    </div>
    <form class="acct-pane" data-pane="in">
      <h2>Welcome back</h2>
      <p>Sign in with your nLab community (nForum) account to post in the forum and keep your name on your edits.</p>
      <label>Email<input name="email" type="email" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <p class="si-err" role="alert"></p>
      <div class="modal-actions"><button class="tbtn" type="button" data-close>Cancel</button><button class="tbtn primary" type="submit">Sign in</button></div>
      <p class="acct-fine">Your password goes only to nforum.ncatlab.org and is not stored.</p>
    </form>
    <form class="acct-pane" data-pane="up" hidden>
      <h2>Join the nLab community</h2>
      <ul class="acct-perks">
        <li><b>Write and edit</b> articles, with drafts saved as you go</li>
        <li><b>Discuss</b> pages and ideas in the forum</li>
        <li><b>Get credit</b>: your name appears on your contributions</li>
      </ul>
      <label>Email<input name="email" type="email" autocomplete="email" required></label>
      <p class="acct-fine">We’ll take you to the nForum’s sign-up to confirm your email address. Afterwards, sign in here with the same account.</p>
      <div class="modal-actions"><button class="tbtn" type="button" data-close>Cancel</button><button class="tbtn primary" type="submit">Continue</button></div>
    </form>`;
  document.body.append(dlg);
  const tab = (t) => {
    dlg.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    dlg.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
    dlg.querySelector(`[data-pane="${t}"] input`)?.focus();
  };
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-tab]')) tab(e.target.closest('[data-tab]').dataset.tab);
    if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
  });
  dlg.querySelector('[data-pane="in"]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = f.querySelector('.si-err');
    const btn = f.querySelector('[type="submit"]');
    err.textContent = '';
    btn.disabled = true;
    try {
      await signIn(f.email.value.trim(), f.password.value);
      f.password.value = '';
      dlg.close();
      dispatchEvent(new CustomEvent('account-change'));
    } catch (ex) {
      err.textContent = /password|credential|invalid|disabled/i.test(ex.message) ? 'Email or password is not correct.' : `Could not sign in (${ex.message}).`;
    } finally { btn.disabled = false; }
  });
  dlg.querySelector('[data-pane="up"]').addEventListener('submit', (e) => {
    e.preventDefault();
    window.open(`${FORUM}/register/`, '_blank', 'noopener');
    tab('in');
    dlg.querySelector('[data-pane="in"] input[name="email"]').value = e.target.email.value;
  });
  dlg.tab = tab;
  return dlg;
}

export function openAccount(which = 'in') {
  const d = dialog();
  d.showModal();
  d.tab(which);
}

function render() {
  const slot = document.querySelector('.nav-account');
  if (!slot) return;
  const a = auth.get();
  if (!a) {
    slot.innerHTML = `<button type="button" class="nav-signin" data-acct="in">Sign in</button>
      <button type="button" class="nav-join" data-acct="up">Create account</button>`;
    return;
  }
  const n = draftCount();
  slot.innerHTML = `<details class="acct-menu">
      <summary aria-label="Account"><span class="av" style="--h:${hue(a.name)};--s:34px">${esc(initials(a.name))}</span></summary>
      <div class="acct-pop">
        <p class="acct-who"><b>${esc(a.name)}</b><span>${esc(a.email)}</span></p>
        <a href="page.html?write">Write an article</a>
        <a href="page.html?write#drafts">My drafts${n ? ` <em>${n}</em>` : ''}</a>
        <a href="forum.html">Forum</a>
        <button type="button" data-acct="out">Sign out</button>
      </div>
    </details>`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-acct]');
  if (!b) return;
  if (b.dataset.acct === 'out') { signOut(); dispatchEvent(new CustomEvent('account-change')); }
  else openAccount(b.dataset.acct);
});
addEventListener('account-change', render);
render();
