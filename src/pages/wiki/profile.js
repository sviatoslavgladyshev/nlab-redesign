import { busy, icons } from '../../ui/app.js';
import { currentUser, dbEnabled, displayName, initAuth } from '../../core/db.js';
import { cachedProfile, deleteAccount, loadProfile, saveProfile } from '../../core/profile.js';
import { esc } from '../../core/nlab.js';
import { $, link, setHero } from './shell.js';
import './profile.css';

// Overview and Settings are two tabs of one page: switching between them is instant (no reload),
// and both show the saved copy of your profile at once while a fresh one loads in the background.
export async function showProfile(initialSettings) {
  const body = $('#a-body');
  body.classList.add('loaded', 'is-search');
  let settings = initialSettings;
  let generation = 0;
  let shown = null; // the profile currently on screen, to avoid redrawing over unsaved edits

  const hero = () => {
    setHero({ title: settings ? 'Profile settings' : 'Your profile', crumb: 'Profile', meta: '' });
  };

  function draw(user, profile, notice) {
    hero(user, profile);
    if (settings) showSettings(body, user, profile, notice);
    else showOverview(body, user, profile);
    shown = JSON.stringify(profile ?? null);
  }

  async function render() {
    const request = ++generation;
    const user = currentUser() || (await initAuth(), currentUser());
    if (request !== generation) return;
    if (!dbEnabled || !user) {
      hero(null, null);
      body.innerHTML = dbEnabled
        ? '<div class="profile-empty"><p>Sign in to see your profile, drafts and publications.</p><button class="tbtn primary" type="button" data-acct="in"><i data-lucide="log-in"></i><span>Sign in</span></button></div>'
        : '<div class="profile-empty"><p>Accounts aren’t available right now.</p></div>';
      icons();
      return;
    }
    const cached = cachedProfile(user);
    draw(user, cached);
    try {
      const fresh = await loadProfile(user, { fresh: true });
      if (request !== generation || currentUser()?.id !== user.id) return;
      // redraw only if something changed, and never over a settings form being edited
      const editing = settings && body.querySelector('.profile-form')?.dataset.dirty;
      if (JSON.stringify(fresh ?? null) !== shown && !editing) draw(user, fresh);
    } catch {
      if (request !== generation || currentUser()?.id !== user.id) return;
      if (cached === undefined || cached === null) {
        const notice = document.createElement('p');
        notice.className = 'profile-notice';
        notice.textContent = 'Your profile couldn’t be loaded. Showing what we have; try again in a moment.';
        notice.setAttribute('role', 'status');
        if (settings) draw(user, null, notice); else body.prepend(notice);
      }
    }
  }

  // tabs: switch in place
  body.addEventListener('click', (e) => {
    const tab = e.target.closest('.profile-nav a, [data-tab-link]');
    if (!tab || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const next = tab.getAttribute('href').includes('settings');
    if (next === settings) return;
    settings = next;
    history.pushState({ profile: settings }, '', new URL(settings ? 'profile/settings/' : 'profile/', document.baseURI));
    const user = currentUser();
    if (user) draw(user, cachedProfile(user)); else render();
  });
  addEventListener('popstate', () => {
    if (!/\/profile\/?(settings\/?)?$/.test(location.pathname)) return;
    settings = /settings\/?$/.test(location.pathname);
    const user = currentUser();
    if (user) draw(user, cachedProfile(user)); else render();
  });
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
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  body.innerHTML = `<div class="profile-layout">
    ${profileNav(false)}
    <section class="profile-card profile-identity" aria-label="Your profile">
      <span class="profile-initials" style="--h:${hue}" aria-hidden="true">${esc(initials)}</span>
      <div class="profile-person">
        <h2>${esc(name)}</h2>
        <p class="profile-sub">${esc([user.email, profile?.affiliation].filter(Boolean).join(' · '))}</p>
        <p class="profile-bio">${profile?.bio ? esc(profile.bio) : '<span class="profile-muted">Add a short bio in Settings: what you work on, what you’d like to write about.</span>'}</p>
      </div>
      <a class="tbtn" href="profile/settings/" data-tab-link><i data-lucide="pencil"></i><span>Edit profile</span></a>
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
    <form class="profile-form">
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
  form.addEventListener('input', () => { form.dataset.dirty = '1'; });
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
      delete form.dataset.dirty;
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
