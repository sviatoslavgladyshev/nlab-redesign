import { busy, icons } from '../../ui/app.js';
import { currentUser, dbEnabled, displayName, initAuth } from '../../core/db.js';
import { cachedProfile, deleteAccount, loadProfile, saveProfile } from '../../core/profile.js';
import { esc } from '../../core/nlab.js';
import { $, link, setHero } from './shell.js';
import './profile.css';

export async function showProfile(settings) {
  const body = $('#a-body');
  const title = settings ? 'Profile settings' : 'My profile';
  body.classList.add('loaded', 'is-search');
  setHero({ title });
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
      if (settings) showSettings(body, user, null, notice);
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

function showSettings(body, user, profile, notice) {
  body.innerHTML = `<div class="profile-layout profile-settings">
    ${profileNav(true)}
    <form class="profile-form"${notice ? ' hidden' : ''}>
      <section class="profile-panel" aria-labelledby="profile-details">
        <h2 id="profile-details">Profile details</h2>
        <label>Display name<input name="display_name" required maxlength="80" autocomplete="name"></label>
        <label><span>Affiliation <small>Optional</small></span><input name="affiliation" maxlength="120" autocomplete="organization"></label>
        <label class="profile-wide"><span>Bio <small>Optional</small></span><textarea name="bio" rows="3" maxlength="500"></textarea></label>
      </section>
      <section class="profile-panel" aria-labelledby="profile-preferences">
        <h2 id="profile-preferences">Appearance and reading</h2>
        <label>Theme<select name="theme"><option value="system">System setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label class="profile-check"><input type="checkbox" name="focus_read"> ADHD reading by default</label>
      </section>
      <div class="profile-save">
        <button class="tbtn primary" type="submit"><i data-lucide="check"></i><span>Save settings</span></button>
        <p role="status"></p>
      </div>
    </form>
    <section class="profile-panel profile-account">
      <div><h2>Account</h2><p>Signed in as ${esc(user.email || displayName(user))}</p></div>
      <button class="tbtn" type="button" data-acct="out">Sign out</button>
      <button class="tbtn profile-delete" type="button"><i data-lucide="trash-2"></i>Delete account</button>
    </section>
    <dialog class="profile-confirm" aria-labelledby="profile-confirm-title" aria-describedby="profile-confirm-description">
      <form>
        <h2 id="profile-confirm-title">Delete your account?</h2>
        <p id="profile-confirm-description">This permanently deletes your account, profile, and synced drafts. Published contributions and browser-only draft copies remain.</p>
        <label>Type <strong>DELETE</strong> to confirm
          <input name="confirmation" autocomplete="off" spellcheck="false" required>
        </label>
        <p role="alert" class="profile-delete-error" hidden></p>
        <div class="profile-confirm-actions">
          <button class="tbtn" type="button" autofocus>Cancel</button>
          <button class="tbtn profile-delete" type="submit" disabled>Delete account</button>
        </div>
      </form>
    </dialog>
  </div>`;
  const form = $('.profile-form', body);
  if (notice) form.before(notice);
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
  wireAccountDeletion(body, user);
  icons();
}

function wireAccountDeletion(body, user) {
  const dialog = $('.profile-confirm', body);
  const form = $('form', dialog);
  const field = form.elements.confirmation;
  const errorMessage = $('[role="alert"]', form);
  const cancel = $('[type="button"]', form);
  const submit = $('[type="submit"]', form);
  let deleting = false;
  $('.profile-account .profile-delete', body).addEventListener('click', () => {
    form.reset();
    errorMessage.hidden = true;
    submit.disabled = true;
    dialog.showModal();
  });
  field.addEventListener('input', () => { submit.disabled = field.value !== 'DELETE'; });
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => {
    if (deleting) event.preventDefault();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (deleting || field.value !== 'DELETE') return;
    deleting = true;
    field.readOnly = true;
    cancel.disabled = true;
    errorMessage.hidden = true;
    const stop = busy(submit);
    try {
      await deleteAccount(user, field.value);
      location.replace(new URL('./', document.baseURI));
    } catch {
      errorMessage.textContent = 'Could not delete your account. Try again in a moment.';
      errorMessage.hidden = false;
      deleting = false;
      field.readOnly = false;
      cancel.disabled = false;
      stop();
    }
  });
}
