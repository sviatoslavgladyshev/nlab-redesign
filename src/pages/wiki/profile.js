import { busy, icons } from '../../ui/app.js';
import { currentUser, dbEnabled, displayName, initAuth } from '../../core/db.js';
import { cachedProfile, loadProfile, saveProfile } from '../../core/profile.js';
import { esc } from '../../core/nlab.js';
import { $, link, setHero } from './shell.js';
import './profile.css';

export async function showProfile(settings) {
  const body = $('#a-body');
  const title = settings ? 'Profile settings' : 'My profile';
  body.classList.add('loaded', 'is-search');
  setHero({ title, meta: settings ? 'Manage your identity and reading preferences.' : 'Your nLab account and contributions.' });
  body.innerHTML = '<p role="status">Loading your account…</p>';
  await initAuth();
  let generation = 0;

  async function render() {
    const request = ++generation;
    const user = currentUser();
    if (!dbEnabled || !user) {
      body.innerHTML = dbEnabled
        ? '<p>Sign in to view your profile.</p><button class="tbtn primary" type="button" data-acct="in">Sign in</button>'
        : '<p>The account database is unavailable.</p>';
      return;
    }
    const cached = cachedProfile(user);
    if (!settings) showOverview(body, user, cached);
    else body.innerHTML = '<p role="status">Loading profile settings…</p>';
    try {
      const profile = await loadProfile(user);
      if (request !== generation || currentUser()?.id !== user.id) return;
      if (settings) showSettings(body, user, profile);
      else showOverview(body, user, profile);
    } catch {
      if (request !== generation || currentUser()?.id !== user.id) return;
      const notice = document.createElement('p');
      notice.textContent = 'Profile storage is unavailable. Try again later.';
      notice.setAttribute('role', 'status');
      if (settings) body.replaceChildren(notice);
      else body.prepend(notice);
    }
  }

  addEventListener('account-change', render);
  await render();
}

const profileNav = (settings) => `<nav class="profile-nav" aria-label="Profile">
  <a href="profile/"${settings ? '' : ' aria-current="page"'}>Overview</a>
  <a href="profile/settings/"${settings ? ' aria-current="page"' : ''}>Settings</a>
</nav>`;

function showOverview(body, user, profile) {
  const name = profile?.display_name || displayName(user) || 'nLab member';
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  body.innerHTML = `<div class="profile-layout">
    ${profileNav(false)}
    <section class="profile-card profile-identity" aria-label="Your profile">
      <span class="profile-initials" aria-hidden="true">${esc(initials)}</span>
      <div class="profile-person">
        <h2>${esc(name)}</h2>
        <p>${esc(user.email || '')}</p>
        ${profile?.affiliation ? `<p>${esc(profile.affiliation)}</p>` : ''}
        ${profile?.bio ? `<p class="profile-bio">${esc(profile.bio)}</p>` : ''}
      </div>
      ${link('Edit profile', 'pencil', 'profile/settings/', true)}
    </section>
    <section aria-labelledby="profile-work">
      <h2 id="profile-work">Your work</h2>
      <div class="profile-links">
        ${activityLink('Drafts', 'Resume your writing', 'file-text', 'write#drafts')}
        ${activityLink('Publications', 'Open the pages you authored', 'book-open', 'write#publications')}
        ${activityLink('Suggestions', 'Review proposed edits', 'inbox', 'suggestions/')}
      </div>
    </section>
  </div>`;
  icons();
}

function activityLink(title, description, icon, href) {
  return `<a class="profile-card profile-work-link" href="${href}">
    <i data-lucide="${icon}" aria-hidden="true"></i>
    <span><b>${title}</b><small>${description}</small></span>
    <i data-lucide="arrow-right" aria-hidden="true"></i>
  </a>`;
}

function showSettings(body, user, profile) {
  body.innerHTML = `<div class="profile-layout">
    ${profileNav(true)}
    <form class="profile-form">
      <fieldset class="profile-card">
        <legend>Profile details</legend>
        <label>Display name<input name="display_name" required maxlength="80" autocomplete="name"></label>
        <small>Used for future contributions and suggestions.</small>
        <label>Affiliation <span>Optional</span><input name="affiliation" maxlength="120" autocomplete="organization"></label>
        <label>About you <span>Optional</span><textarea name="bio" rows="3" maxlength="500"></textarea></label>
      </fieldset>
      <fieldset class="profile-card">
        <legend>Appearance and reading</legend>
        <label>Theme<select name="theme"><option value="system">System setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label class="profile-check"><input type="checkbox" name="focus_read"> Enable ADHD reading by default</label>
      </fieldset>
      <div class="profile-save">
        <button class="tbtn primary" type="submit"><i data-lucide="check"></i><span>Save settings</span></button>
        <p role="status"></p>
      </div>
    </form>
    <section class="profile-card profile-account">
      <div><h2>Account</h2><p>Signed in as ${esc(user.email || displayName(user))}</p></div>
      <button class="tbtn" type="button" data-acct="out">Sign out</button>
    </section>
  </div>`;
  const form = $('.profile-form', body);
  const fields = form.elements;
  fields.display_name.value = profile?.display_name || displayName(user);
  fields.affiliation.value = profile?.affiliation || '';
  fields.bio.value = profile?.bio || '';
  fields.theme.value = profile?.theme || localStorage.getItem('nlab-mode') || 'system';
  fields.focus_read.checked = profile?.focus_read ?? (localStorage.getItem('nlab-focus-read') === '1');
  const status = $('[role="status"]', form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('[type="submit"]', form);
    if (button.disabled) return;
    const display_name = fields.display_name.value.trim();
    if (!display_name) {
      status.textContent = 'Enter a display name.';
      fields.display_name.focus();
      return;
    }
    const stop = busy(button);
    status.textContent = 'Saving…';
    try {
      await saveProfile(user, {
        display_name, affiliation: fields.affiliation.value.trim(), bio: fields.bio.value.trim(),
        theme: fields.theme.value, focus_read: fields.focus_read.checked,
      });
      status.textContent = 'Settings saved.';
    } catch (error) {
      status.textContent = error.message || 'Could not save settings.';
    } finally {
      stop();
    }
  });
  icons();
}
