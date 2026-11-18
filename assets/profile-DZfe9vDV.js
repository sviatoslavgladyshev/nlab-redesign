import{a as e,c as t,n,o as r,s as i,t as a}from"./app-DKNCFJqV.js";import{C as o,b as s,c,g as l}from"./nlab-DTdF0nT3.js";import{n as u,t as d}from"./wiki-BAo3cmdt.js";async function f(t){let r=d(`#a-body`);r.classList.add(`loaded`,`is-search`);let a=t,s=0,c=null,f=()=>{u({title:a?`Profile settings`:`Your profile`,crumb:`Profile`,meta:``})};function p(e,t,n){f(e,t),a?g(r,e,t,n):m(r,e,t),c=JSON.stringify(t??null)}async function h(){let t=++s,u=l()||(await o(),l());if(t!==s)return;if(!u){f(null,null),r.innerHTML=`<div class="profile-empty"><p>Sign in to see your profile, drafts and publications.</p><button class="tbtn primary" type="button" data-acct="in"><i data-lucide="log-in"></i><span>Sign in</span></button></div>`,n();return}let d=e(u);p(u,d);try{let e=await i(u,{fresh:!0});if(t!==s||l()?.id!==u.id)return;let n=a&&r.querySelector(`.profile-form`)?.dataset.dirty;JSON.stringify(e??null)!==c&&!n&&p(u,e)}catch{if(t!==s||l()?.id!==u.id)return;if(d==null){let e=document.createElement(`p`);e.className=`profile-notice`,e.textContent=`Your profile couldn’t be loaded. Showing what we have; try again in a moment.`,e.setAttribute(`role`,`status`),a?p(u,null,e):r.prepend(e)}}}r.addEventListener(`click`,t=>{let n=t.target.closest(`.profile-nav a, [data-tab-link]`);if(!n||t.metaKey||t.ctrlKey||t.shiftKey||t.altKey)return;t.preventDefault();let r=n.getAttribute(`href`).includes(`settings`);if(r===a)return;a=r,history.pushState({profile:a},``,new URL(a?`profile/settings/`:`profile/`,document.baseURI));let i=l();i?p(i,e(i)):h()}),addEventListener(`popstate`,()=>{if(!/\/profile\/?(settings\/?)?$/.test(location.pathname))return;a=/settings\/?$/.test(location.pathname);let t=l();t?p(t,e(t)):h()}),addEventListener(`account-change`,h),await h()}var p=e=>`<nav class="profile-nav" aria-label="Profile">
  <a href="profile/"${e?``:` aria-current="page"`}>Overview</a>
  <a href="profile/settings/"${e?` aria-current="page"`:``}>Settings</a>
</nav>`;function m(e,t,r){let i=r?.display_name||s(t)||`nLab member`,a=i.trim().split(/\s+/).slice(0,2).map(e=>e[0]).join(``).toUpperCase(),o=[...i].reduce((e,t)=>(e*31+t.charCodeAt(0))%360,7);e.innerHTML=`<div class="profile-layout">
    ${p(!1)}
    <section class="profile-card profile-identity" aria-label="Your profile">
      <span class="profile-initials" style="--h:${o}" aria-hidden="true">${c(a)}</span>
      <div class="profile-person">
        <h2>${c(i)}</h2>
        <p class="profile-sub">${c([t.email,r?.affiliation].filter(Boolean).join(` · `))}</p>
        <p class="profile-bio">${r?.bio?c(r.bio):`<span class="profile-muted">Add a short bio in Settings: what you work on, what you’d like to write about.</span>`}</p>
      </div>
      <a class="tbtn" href="profile/settings/" data-tab-link><i data-lucide="pencil"></i><span>Edit profile</span></a>
    </section>
    <section aria-labelledby="profile-work">
      <h2 id="profile-work">Your work</h2>
      <div class="profile-links">
        ${h(`Drafts`,`Resume your writing`,`file-text`,`write#drafts`)}
        ${h(`Publications`,`Open the pages you authored`,`book-open`,`write#publications`)}
        ${h(`Suggestions`,`Review proposed edits`,`inbox`,`suggestions/`)}
      </div>
    </section>
  </div>`,n()}function h(e,t,n,r){return`<a class="profile-card profile-work-link" href="${r}">
    <i data-lucide="${n}" aria-hidden="true"></i>
    <span><b>${e}</b><small>${t}</small></span>
    <i data-lucide="arrow-right" aria-hidden="true"></i>
  </a>`}function g(e,r,i,o){e.innerHTML=`<div class="profile-layout profile-settings">
    ${p(!0)}
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
      <div><h2>Account</h2><p>Signed in as ${c(r.email||s(r))}</p></div>
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
  </div>`;let l=d(`.profile-form`,e);o&&l.before(o),l.addEventListener(`input`,()=>{l.dataset.dirty=`1`});let u=l.elements;u.display_name.value=i?.display_name||s(r),u.affiliation.value=i?.affiliation||``,u.bio.value=i?.bio||``,u.theme.value=i?.theme||localStorage.getItem(`nlab-mode`)||`system`,u.focus_read.checked=i?.focus_read??localStorage.getItem(`nlab-focus-read`)===`1`;let f=d(`[role="status"]`,l);l.addEventListener(`submit`,async e=>{e.preventDefault();let n=d(`[type="submit"]`,l);if(n.disabled)return;let i=u.display_name.value.trim();if(!i){f.textContent=`Enter a display name.`,u.display_name.focus();return}let o=a(n);f.textContent=`Saving…`;try{await t(r,{display_name:i,affiliation:u.affiliation.value.trim(),bio:u.bio.value.trim(),theme:u.theme.value,focus_read:u.focus_read.checked}),f.textContent=`Settings saved.`,delete l.dataset.dirty}catch(e){f.textContent=e.message||`Could not save settings.`}finally{o()}}),_(e,r),n()}function _(e,t){let n=d(`.profile-confirm`,e),i=d(`form`,n),o=i.elements.confirmation,s=d(`[role="alert"]`,i),c=d(`[type="button"]`,i),l=d(`[type="submit"]`,i),u=!1;d(`.profile-account .profile-delete`,e).addEventListener(`click`,()=>{i.reset(),s.hidden=!0,l.disabled=!0,n.showModal()}),o.addEventListener(`input`,()=>{l.disabled=o.value!==`DELETE`}),c.addEventListener(`click`,()=>n.close()),n.addEventListener(`cancel`,e=>{u&&e.preventDefault()}),i.addEventListener(`submit`,async e=>{if(e.preventDefault(),u||o.value!==`DELETE`)return;u=!0,o.readOnly=!0,c.disabled=!0,s.hidden=!0;let n=a(l);try{await r(t,o.value),location.replace(new URL(`./`,document.baseURI))}catch{s.textContent=`Could not delete your account. Try again in a moment.`,s.hidden=!1,u=!1,o.readOnly=!1,c.disabled=!1,n()}})}export{f as showProfile};