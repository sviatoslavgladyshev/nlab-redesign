// CQTS page: shared behaviour + tab highlighting while scrolling.
import '../../ui/app.js';
import './cqts.css';
import credits from '../../data/credits.json';
import { icons } from '../../ui/app.js';

/* ---------- People: official CQTS / NYU profile facts ---------- */
const PEOPLE = {
  'hisham-sati': { name: 'Hisham Sati', role: 'Center Director & Principal Investigator · Professor of Mathematics', affiliation: 'NYU Abu Dhabi', education: 'BS, American University of Beirut; PhD, University of Michigan, Ann Arbor', research: 'Mathematical physics, quantum field theory, differential geometry, algebraic topology, and geometric and topological aspects of physics.', bio: 'Hisham Sati directs CQTS and works at the interface of mathematics and physics. His research uses geometric and topological structures to study foundational questions in physical theories.', email: 'hsati@nyu.edu', source: 'https://nyuad.nyu.edu/en/academics/divisions/science/faculty/hisham-sati.html' },
  'muhammad-shafique': { name: 'Muhammad Shafique', role: 'Co-Principal Investigator · Professor of Electrical and Computer Engineering', affiliation: 'NYU Abu Dhabi', education: 'PhD in Computer Science, Karlsruhe Institute of Technology, Germany', research: 'Brain-inspired computing, embedded machine learning and AI, energy-efficient and robust computing, hardware security, FPGAs, MPSoCs and embedded systems.', bio: 'Muhammad Shafique leads research on efficient, robust and secure computing systems, connecting machine-learning algorithms with hardware and embedded platforms.', email: 'muhammad.shafique@nyu.edu', source: 'https://nyuad.nyu.edu/en/academics/divisions/engineering/faculty/muhammad-shafique.html' },
  'tim-byrnes': { name: 'Tim Byrnes', role: 'Co-Principal Investigator · Associate Professor of Physics', affiliation: 'NYU Shanghai', education: 'BSc (Hons) and PhD in Physics, University of New South Wales, Australia', research: 'Quantum information technologies, condensed matter physics, AMO physics, Bose–Einstein condensates and exciton-polariton systems.', bio: 'Tim Byrnes studies quantum information and quantum technologies using cold atoms and Bose–Einstein condensates, with work spanning theory, simulation and experimental platforms.', email: 'tim.byrnes@nyu.edu', website: 'http://nyu.timbyrnes.net', source: 'https://research.shanghai.nyu.edu/centers-and-institutes/physics/people/tim-byrnes', sourceLabel: 'NYU Shanghai profile' },
  'asif-equbal': { name: 'Asif Equbal', role: 'Co-Principal Investigator · Assistant Professor of Chemistry', affiliation: 'NYU Abu Dhabi', education: 'BS-MS, IISER Mohali, India; PhD, Aarhus University, Denmark', research: 'Nuclear and electron magnetic resonance, dynamic nuclear polarization, photochemistry, quantum materials and spin physics.', bio: 'Asif Equbal develops spin-physics and spectroscopy methods for quantum materials and biomedical imaging, with a particular focus on dynamic nuclear polarization and light-activated spin chemistry.', email: 'asif@nyu.edu', source: 'https://nyuad.nyu.edu/en/academics/divisions/science/faculty/asif-equbal.html' },
  'maryam-alnahyan': { name: 'Maryam AlNahyan', role: 'Assistant Professor and Emerging Scholar in Mechanical Engineering', affiliation: 'NYU Abu Dhabi', education: 'BS in Chemistry, United Arab Emirates University; MS in Chemical Engineering, Masdar Institute/MIT; PhD in Materials Science and Engineering, Khalifa University', research: '2D materials, advanced energy storage, material synthesis, flow batteries, metal-air batteries and sustainable fuel production.', bio: 'Maryam AlNahyan studies materials at the atomic and interface levels to improve energy storage and sustainable energy production.', email: 'msa9032@nyu.edu', source: 'https://nyuad.nyu.edu/en/academics/divisions/engineering/faculty/maryam-sultan-alnahyan.html' },
  'riyadh-baghdadi': { name: 'Riyadh Baghdadi', role: 'Assistant Professor of Computer Science', affiliation: 'NYU Abu Dhabi', education: 'BA, Ecole Supérieure d’Informatique; MA and PhD, Sorbonne University; postdoctoral research, MIT', research: 'Compilers, programming languages, deep learning, artificial intelligence and high-performance computing.', bio: 'Riyadh Baghdadi works at the intersection of compilers and machine learning, developing systems that automatically optimize high-level programs for efficient execution.', email: 'baghdadi@nyu.edu', source: 'https://nyuad.nyu.edu/en/academics/divisions/science/faculty/riyadh-baghdadi.html' },
  'safiya-khalil-alhashmi': { name: 'Safiya Khalil Alhashmi', role: 'Assistant Professor · Emerging Scholar of Mechanical Engineering', affiliation: 'NYU Abu Dhabi', education: 'BS in Chemical Engineering, Khalifa University; PhD in Chemical and Biomolecular Engineering, Rice University', research: 'Materials and nanoscience, energy and sustainability, reticular chemistry, AI-guided materials discovery, self-driving labs and high-throughput synthesis.', bio: 'Safiya Khalil Alhashmi leads the Khalil Lab, combining chemistry, reaction engineering and advanced manufacturing to design scalable 2D framework materials for water, energy and quantum technologies.', email: 'safiya.alhashmi@nyu.edu', source: 'https://nyuad.nyu.edu/en/academics/divisions/engineering/faculty/safiya-alhashmi.html' },
  'bing-qi': { name: 'Bing Qi', role: 'Associate Professor of Physics', affiliation: 'NYU Shanghai', education: 'PhD in Applied Optics, Dalian University of Technology', research: 'Quantum cryptography, quantum communication and networking, optical sensing and quantum photonics.', bio: 'Bing Qi researches light-based communication and sensing, including practical quantum key distribution and optical methods for secure information transfer.', email: 'bq2072@nyu.edu', source: 'https://shanghai.nyu.edu/academics/faculty/directory/bing-qi' },
  'saurabh-ray': { name: 'Saurabh Ray', role: 'Associate Professor of Computer Science', affiliation: 'NYU Abu Dhabi', education: 'BTech, Indian Institute of Technology Guwahati; MCS and PhD, Universität des Saarlandes', research: 'Algorithms, computational geometry, extremal combinatorics, artificial intelligence, machine learning and approximation algorithms.', bio: 'Saurabh Ray develops mathematical and algorithmic tools for computational geometry and machine learning, with a focus on using mathematical structure to solve computer-science problems.', email: 'sr194@nyu.edu', source: 'https://nyuad.nyu.edu/en/academics/divisions/science/faculty/saurabh-ray.html' },
  'qiang-zhang': { name: 'Qiang Zhang', role: 'Research Instrumentation Scientist', affiliation: 'NYU Abu Dhabi', research: 'Microfabrication, research instrumentation and technical support for experimental quantum technologies.', bio: 'Qiang Zhang supports CQTS research through the design, operation and maintenance of specialized instrumentation and microfabrication capabilities.', source: 'https://nyuad.nyu.edu/en/research/facilities-and-support/core-technology-platforms/contact-us.html', sourceLabel: 'NYU CTP profile' },
  'urs-schreiber': { name: 'Urs Schreiber', role: 'Research Scientist', affiliation: 'NYU Abu Dhabi', education: 'PhD from University Essen; Habilitation from Hamburg University, Germany', research: 'Theoretical physics and algebraic topology, with applications of geometric homotopy theory to quantum field and string theory.', email: 'us13@nyu.edu', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/urs-schreiber.html' },
  'grigorios-giotopoulos': { name: 'Grigorios Giotopoulos', role: 'Postdoctoral Associate', affiliation: 'NYU Abu Dhabi', education: 'BSc, University of Edinburgh; MASt, University of Cambridge; PhD, Heriot-Watt University', research: 'Mathematical physics, geometrical and topological aspects of physics, homotopy theory and category theory.', email: 'grigorios.giotopoulos@nyu.edu', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/grigorios-giotopoulos.html' },
  'nouhaila-innan': { name: 'Nouhaila Innan', role: 'Postdoctoral Associate', affiliation: 'NYU Abu Dhabi', education: 'BS, MS and PhD, Hassan II University of Casablanca, Morocco', research: 'Quantum machine learning, quantum algorithms and quantum applications.', email: 'nouhaila.innan@nyu.edu', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/researchers/nouhaila-innan.html' },
  'amaria-javed': { name: 'Amaria Javed', role: 'Postdoctoral Associate', affiliation: 'NYU Abu Dhabi', education: 'MSc and MPhil, Quaid-i-Azam University, Islamabad; PhD, United Arab Emirates University', research: 'All-optical data processing, quantum information processing and quantum sensing.', email: 'amaria.javed@nyu.edu', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/researchers/amaria-javed.html' },
  'muhammad-kashif': { name: 'Muhammad Kashif', role: 'Postdoctoral Associate', affiliation: 'NYU Abu Dhabi', education: 'BS, COMSATS Institute of Information Technology; MS, Istanbul Şehir University; PhD, Hamad Bin Khalifa University', research: 'Quantum computing, quantum machine learning and quantum algorithms.', email: 'muhammadkashif@nyu.edu', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/researchers/muhammad-kashif.html' },
  'marwa-mannai': { name: 'Marwa Mannai', role: 'Postdoctoral Associate', affiliation: 'NYU Abu Dhabi', education: 'BA, MA and PhD, Faculty of Sciences of Tunis', research: 'Topological phases of matter, two-dimensional materials, strongly correlated electron systems and moiré structures.', email: 'mm12971@nyu.edu', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/researchers/marwa-mannai.html' },
  'alberto-marchisio': { name: 'Alberto Marchisio', role: 'Postdoctoral Associate', affiliation: 'NYU Abu Dhabi', education: 'BSc and MSc, Politecnico di Torino; PhD, Vienna University of Technology', research: 'Hardware and software optimizations for machine learning and brain-inspired computing.', email: 'alberto.marchisio@nyu.edu', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/researchers/alberto-marchisio.html' },
  'vivek-singh': { name: 'Vivek Kumar Singh', role: 'Postdoctoral Associate', affiliation: 'NYU Abu Dhabi', education: 'BSc, Banaras Hindu University; MSc and PhD, IIT Bombay', research: 'Theoretical and mathematical physics, knot theory, quantum many-body physics, anyons and quantum information.', email: 'vks2024@nyu.edu', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/researchers/vivek-kumar-singh.html' },
  'venkata-subbarao-redrouthu': { name: 'Venkata SubbaRao Redrouthu', role: 'Research Associate', affiliation: 'NYU Abu Dhabi', education: 'BSc, Acharya Nagarjuna University; MSc, Andhra University; PhD, IISER Mohali', research: 'Solid-state NMR, dynamic nuclear polarization, quantum sensing, time-dependent quantum mechanics and spin dynamics.', email: 'vr2444@nyu.edu', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/researchers/venkata-subbarao-redrouthu.html' },
  'rashed-al-jasmi': { name: 'Rashed Al Jasmi', role: 'Kawader Research Assistant', affiliation: 'NYU Abu Dhabi', education: 'BSc, University of Manchester; MSc, University of Edinburgh; M2, University of Bordeaux', research: 'Quantum optics and quantum materials.', email: 'raa10052@nyu.edu', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/researchers/rashed-aljasmi.html' },
  'maryem-ahmed-almheiri': { name: 'Maryem Ahmed Almheiri', role: 'Kawader Research Assistant', affiliation: 'NYU Abu Dhabi', research: 'Quantum technologies, experimental research and laboratory support.', bio: 'Maryem Ahmed Almheiri is a Kawader Research Assistant contributing to the center’s experimental and technical research environment.', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/researchers.html', sourceLabel: 'CQTS researcher listing' },
  'mayur-jhamnani': { name: 'Mayur Jhamnani', role: 'Visiting Student Researcher', affiliation: 'NYU Abu Dhabi', education: 'Engineering student, American University of Sharjah', research: 'Dynamic nuclear polarization, spin physics, quantum control and quantum sensing.', bio: 'Mayur Jhamnani works with the Equbal Lab on spin-based quantum technologies and has contributed to research on robust pulse sequences for polarization transfer.', source: 'https://nyuad.nyu.edu/en/research/faculty-labs-and-projects/cqts/researchers.html', sourceLabel: 'CQTS researcher listing' },
};
const NLAB = {
  'hisham-sati': 'wiki/Hisham+Sati/', 'muhammad-shafique': 'wiki/Muhammad+Shafique/', 'tim-byrnes': 'wiki/Tim+Byrnes/',
  'asif-equbal': 'wiki/Asif+Equbal/', 'urs-schreiber': 'wiki/Urs+Schreiber/', 'grigorios-giotopoulos': 'wiki/Grigorios+Giotopoulos/',
  'amaria-javed': 'wiki/Amaria+Javed/', 'marwa-mannai': 'wiki/Marwa+Manna%C3%AF/', 'alberto-marchisio': 'wiki/Alberto+Marchisio/',
  'vivek-singh': 'wiki/Vivek+Kumar+Singh/',
};

/* ---------- Pages: /cqts/ is the overview, /cqts/<section>/ shows one section ---------- */
const PAGES = {
  research: ['Research', 'From topological order to working quantum devices'],
  people: ['People', 'The researchers of the center'],
  'symposium-2026': ['Symposium 2026', 'Research Symposium · 16 November 2026'],
  materials: ['Materials', 'Slides, videos and papers from every series'],
  activities: ['Activities', 'Seminars, colloquia and meetings'],
  colloquium: ['Quantum Colloquium', 'Recent speakers'],
  events: ['Events', 'Conferences and workshops'],
  'get-involved': ['Get involved', 'Be part of the conversation'],
  archive: ['Archive', 'The complete record of every series'],
};
const BASE = new URL(document.baseURI).pathname;
const pageOf = (pathname) => {
  const rel = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  return (rel.match(/^cqts\/([^/?#]+)/) || [])[1] || '';
};
let route = pageOf(location.pathname);
let profileSlug = PEOPLE[route] ? route : '';
let page = profileSlug ? '' : route;
// Old one-page anchors (#Symposium2026, #SchreiberSymposium2026, #colloquium …) → their pages
const ANCHORS = { Symposium2026: 'symposium-2026', CQTSSymposium2026Materials: 'symposium-2026', SchreiberSymposium2026: 'symposium-2026',
  GladyshevSymposium2026: 'symposium-2026', GolubSymposium2026: 'symposium-2026', SingSymposium2026: 'symposium-2026', overview: 'research',
  research: 'research', people: 'people', activities: 'activities', colloquium: 'colloquium', events: 'events', join: 'get-involved',
  archive: 'archive', materials: 'materials' };
const hash = decodeURIComponent(location.hash.slice(1));
if (!page && ANCHORS[hash]) {
  history.replaceState(null, '', new URL(`cqts/${ANCHORS[hash]}/${/Symposium2026$/.test(hash) && hash !== 'Symposium2026' ? `#${hash}` : ''}`, document.baseURI));
  page = ANCHORS[hash];
} else if (page && !PAGES[page]) {
  history.replaceState(null, '', new URL('cqts/', document.baseURI));
  page = '';
}

const heroTitle = document.querySelector('.cq-title');
const heroCrumbs = document.querySelector('.cq-hero .crumbs');
const homeTitle = heroTitle.innerHTML;
const homeCrumbs = heroCrumbs.innerHTML;
let onPageShown = () => {};
const esc = (t) => String(t).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const initials = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
const profileDisplayName = (p, slug) => p?.name?.trim() || initials(String(slug || '').replace(/-/g, ' ')) || '??';

function profileMarkup(slug) {
  const p = PEOPLE[slug];
  if (!p) return '';
  const name = profileDisplayName(p, slug);
  const field = (label, value) => value ? `<div class="cq-profile-field"><dt>${label}</dt><dd>${esc(value)}</dd></div>` : '';
  const about = p.bio || `${name} is ${p.role} at ${p.affiliation}. At CQTS, this work contributes to the center’s broader program in quantum systems, topology and emerging quantum technologies.`;
  return `<div class="cq-profile-top">
    <a class="cq-back" href="cqts/people/"><i data-lucide="arrow-left"></i>All CQTS people</a>
    <div class="cq-profile-hero">
      <div class="cq-profile-avatar"><img src="img/people/${slug}.jpg" alt="${esc(name)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${esc(initials(p.name || slug.replace(/-/g, ' ')))}</span></div>
      <div><h2>${esc(name)}</h2><p>${esc(p.role)}</p></div>
    </div>
  </div>
  <div class="cq-profile-layout">
    <div class="cq-profile-main"><p class="cq-kicker">Profile</p><h3>About</h3><p>${esc(about)}</p><h4>Research focus</h4><p>${esc(p.research || 'Quantum systems, topology and related technologies.')}</p></div>
    <dl class="cq-profile-facts">${field('Affiliation', p.affiliation)}${field('Education', p.education)}${field('Contact', p.email || 'Use the official university profile')}</dl>
  </div>
  <div class="cq-profile-actions">
    ${p.email ? `<a class="cq-btn primary" href="mailto:${esc(p.email)}"><i data-lucide="mail"></i>${esc(p.email)}</a>` : '<span class="cq-profile-note">Contact details are maintained through the official university profile.</span>'}
    ${NLAB[slug] ? `<a class="cq-btn" href="${NLAB[slug]}"><i data-lucide="book-open"></i>nLab page</a>` : ''}
    ${p.website ? `<a class="cq-btn" href="${esc(p.website)}" target="_blank" rel="noopener"><i data-lucide="globe"></i>Personal website</a>` : ''}
    ${p.source ? `<a class="cq-btn" href="${esc(p.source)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>${esc(p.sourceLabel || 'Official NYU profile')}</a>` : ''}
  </div>
  <p class="cq-profile-source">Profile information matched to the official university and center listings. Please use the official profile for the latest contact details.</p>`;
}

function decoratePeople() {
  document.querySelectorAll('.cq-group').forEach((heading) => {
    const grid = heading.nextElementSibling;
    if (grid?.classList.contains('cq-grid')) grid.classList.toggle('cq-grid-leads', heading.textContent.trim() === 'Co-Principal Investigators');
  });
  document.querySelectorAll('.cq-director h3, .cq-person h4').forEach((heading) => {
    const slug = Object.keys(PEOPLE).find((key) => PEOPLE[key].name === heading.textContent.trim() || (heading.textContent.trim() === 'Vivek Singh' && key === 'vivek-singh'));
    if (!slug || heading.querySelector('a')) return;
    const a = document.createElement('a'); a.href = `cqts/${slug}/`; a.className = 'cq-person-name'; a.textContent = heading.textContent; heading.replaceChildren(a);
    const links = heading.closest('article')?.querySelector('.cq-plinks');
    if (links && !links.querySelector('.cq-profile-link')) {
      const link = document.createElement('a'); link.href = `cqts/${slug}/`; link.className = 'cq-profile-link'; link.innerHTML = '<i data-lucide="arrow-right"></i>See more'; links.prepend(link);
    }
    // The university profile is available inside the local person page; keep cards focused on “See more”.
    links?.querySelectorAll('a[target="_blank"]').forEach((link) => link.remove());
    links?.querySelectorAll('a[href^="wiki/"]').forEach((link) => link.remove());
    const card = heading.closest('.cq-director, .cq-person');
    if (card && !card.dataset.profileBound) {
      card.dataset.profileBound = 'true';
      card.dataset.profile = slug;
      card.setAttribute('role', 'link');
      card.tabIndex = 0;
      card.addEventListener('click', (event) => {
        if (event.target.closest('a, button, input, textarea, select')) return;
        go('', true, slug);
      });
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target.closest('a, button, input, textarea, select')) return;
        event.preventDefault();
        go('', true, slug);
      });
    }
  });
  icons();
}

// Show one CQTS page: the home page (hero, explore, research) or a single section
function render(pg) {
  page = pg;
  document.documentElement.dataset.cq = profileSlug ? 'profile' : pg || 'home';
  heroTitle.style.visibility = '';
  // CQTS has its own section tabs below the site header; keep the global CQTS link neutral.
  document.querySelector('.nav-links a[href="cqts/"]')?.removeAttribute('aria-current');
  const profile = profileSlug ? PEOPLE[profileSlug] : null;
  document.querySelectorAll('[data-page]').forEach((el) => {
    if (el.matches('.tabs a')) { el.toggleAttribute('aria-current', el.dataset.page === pg); if (el.dataset.page === pg) el.setAttribute('aria-current', 'page'); return; }
    const dp = el.dataset.page;
    el.hidden = profile ? true : pg ? dp !== pg : !(dp === '' || dp === 'research');
  });
  const profileSection = document.getElementById('person-profile');
  if (profileSection) profileSection.hidden = !profile;
  document.body.classList.toggle('cq-sub', !!pg || !!profile);
  if (profile) {
    document.querySelector('.tabs a[aria-current]')?.removeAttribute('aria-current');
    document.getElementById('person-profile-content').innerHTML = profileMarkup(profileSlug);
    const profileName = profileDisplayName(profile, profileSlug);
    heroTitle.innerHTML = `${esc(profileName)}<br><em>${esc(profile.role.split(' · ')[0] || 'CQTS researcher')}</em>`;
    heroCrumbs.innerHTML = '<a href="./">nLab</a><span>/</span><a href="cqts/">CQTS</a><span>/</span><span>People</span><span>/</span><span></span>';
    heroCrumbs.lastElementChild.textContent = profileName;
    document.title = `${profileName} — Center for Quantum and Topological Systems`;
  } else if (pg) {
    const [title, sub] = PAGES[pg];
    heroTitle.innerHTML = `${title}<br><em>${sub}</em>`;
    heroCrumbs.innerHTML = '<a href="./">nLab</a><span>/</span><a href="cqts/">CQTS</a><span>/</span><span></span>';
    heroCrumbs.lastElementChild.textContent = title;
    document.title = `${title} — Center for Quantum and Topological Systems`;
  } else {
    heroTitle.innerHTML = homeTitle;
    heroCrumbs.innerHTML = homeCrumbs;
    document.title = 'Center for Quantum and Topological Systems (CQTS) — NYU Abu Dhabi';
  }
  document.querySelector('.tabs a[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  dispatchEvent(new Event('resize')); // let the hero canvas re-measure
  icons();
  decoratePeople();
  onPageShown(pg);
}
render(page);
if (profileSlug) requestAnimationFrame(() => scrollTo({ top: 0, behavior: 'instant' }));
if (page && location.hash) requestAnimationFrame(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'center' }));

// Smooth switching between CQTS pages: no reload, cross-fade, keep the tab bar in view
function go(pg, push = true, profile = '') {
  if (pg === page && profile === profileSlug) return;
  const tabsTop = document.querySelector('.cq-tabs').getBoundingClientRect().top + scrollY - 64;
  const below = scrollY > tabsTop - 4;
  const swap = () => {
    profileSlug = profile;
    render(pg);
    if (profile) { scrollTo({ top: 0, behavior: 'instant' }); return; }
    // stay at the tab bar if we were reading below it, otherwise keep the hero visible
    scrollTo({ top: below ? document.querySelector('.cq-tabs').getBoundingClientRect().top + scrollY - 64 : scrollY, behavior: 'instant' });
  };
  if (push) history.pushState({ cq: pg, profile }, '', new URL(profile ? `cqts/${profile}/` : pg ? `cqts/${pg}/` : 'cqts/', document.baseURI));
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { swap(); return; }
  // people ↔ profile: name the card's photo/name/role and the profile's, so they morph into each other
  const person = profile || profileSlug;
  const cardParts = (slug) => {
    const card = document.querySelector(`[data-profile="${slug}"]`);
    return card ? [card.querySelector('.cq-av'), card.querySelector('h3, h4'), card.querySelector('h3 + p, h4 + p')] : [];
  };
  const profileParts = () => { const r = document.querySelector('#person-profile .cq-profile-hero'); return r ? [r.querySelector('.cq-profile-avatar'), r.querySelector('h2'), r.querySelector('h2 + p')] : []; };
  const NAMES = ['cq-avatar', 'cq-name', 'cq-role'];
  const tag = (els) => els.forEach((el, i) => { if (el) el.style.viewTransitionName = NAMES[i]; });
  const untag = () => document.querySelectorAll('[style*="view-transition-name"]').forEach((el) => { el.style.viewTransitionName = ''; });
  const personal = person && (profile ? !profileSlug : pg === 'people');
  if (personal) { document.documentElement.classList.add('cq-vt-person'); tag(profile ? cardParts(profile) : profileParts()); }
  const t = document.startViewTransition(() => {
    untag();
    swap();
    if (personal) {
      const parts = profile ? profileParts() : cardParts(person);
      if (!profile) parts[0]?.closest('article')?.scrollIntoView({ block: 'center', behavior: 'instant' });
      tag(parts);
    }
  });
  t.finished.finally(() => { untag(); document.documentElement.classList.remove('cq-vt-person'); });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="cqts/"]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  const pg = pageOf(new URL(a.getAttribute('href'), document.baseURI).pathname);
  if (pg && !PAGES[pg] && !PEOPLE[pg]) return;
  e.preventDefault();
  go(PEOPLE[pg] ? '' : pg, true, PEOPLE[pg] ? pg : '');
});
addEventListener('popstate', () => {
  const next = pageOf(location.pathname);
  go(PEOPLE[next] ? '' : next, false, PEOPLE[next] ? next : '');
});

/* ---------- Materials: every talk with slides, videos or papers ---------- */
const matList = document.getElementById('mat-list');
if (matList) {
  const ICON = { Slides: 'presentation', Video: 'play', Paper: 'file-text', Notes: 'scroll-text', Poster: 'file-text' };
  const st = { type: '', series: '', year: '', q: '', shown: 24 };
  let DATA = [];
  const chip = (group, value, label, n) => `<button type="button" data-${group}="${value}" aria-pressed="${st[group] === value}">${label}${n != null ? `<em>${n}</em>` : ''}</button>`;
  const match = (x, skip) => (skip === 'type' || !st.type || x.links.some((l) => l.type === st.type))
    && (skip === 'series' || !st.series || x.series === st.series) && (skip === 'year' || !st.year || x.year === st.year)
    && (!st.q || `${x.title} ${x.speakers.join(' ')}`.toLowerCase().includes(st.q));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function draw() {
    const count = (fn) => DATA.filter(fn).length;
    const types = ['Slides', 'Video', 'Paper', 'Notes'];
    document.getElementById('mat-types').innerHTML = chip('type', '', 'All materials', count((x) => match(x, 'type')))
      + types.map((t) => chip('type', t, t === 'Video' ? 'Videos' : t === 'Paper' ? 'Papers' : t, count((x) => match(x, 'type') && x.links.some((l) => l.type === t)))).join('');
    const series = [...new Set(DATA.map((x) => x.series))];
    document.getElementById('mat-series').innerHTML = chip('series', '', 'All series') + series.map((s) => chip('series', s, s, count((x) => match(x, 'series') && x.series === s))).join('');
    const years = [...new Set(DATA.map((x) => x.year))].sort().reverse();
    document.getElementById('mat-years').innerHTML = chip('year', '', 'Any year') + years.map((y) => chip('year', y, y)).join('');
    const list = DATA.filter((x) => match(x));
    document.getElementById('mat-count').textContent = `${list.length} talk${list.length === 1 ? '' : 's'} with materials`;
    matList.innerHTML = list.slice(0, st.shown).map((x) => `<article class="cq-mat">
        <div class="cq-mat-meta"><time>${esc(x.date)}</time><span class="cq-tag">${esc(x.series)}</span></div>
        <h3>${esc(x.title)}</h3>
        ${x.speakers.length ? `<p class="cq-mat-who">${x.speakers.map(esc).join(', ')}</p>` : ''}
        <div class="cq-mat-links">${x.links.filter((l) => !st.type || l.type === st.type).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener" class="t-${l.type.toLowerCase()}"><i data-lucide="${ICON[l.type] || 'file-text'}"></i>${esc(l.type === 'Paper' ? l.label : l.type === 'Video' ? 'Video' : l.label === 'Slides (web)' ? 'Slides (web)' : l.type)}</a>`).join('')}</div>
      </article>`).join('') || '<p class="cq-loading">Nothing matches these filters.</p>';
    document.getElementById('mat-more').hidden = list.length <= st.shown;
    icons();
  }
  fetch('snapshot/cqts-materials.json').then((r) => r.json()).then((d) => {
    DATA = d.items;
    document.querySelectorAll('.cq-mat-count').forEach((el) => { el.textContent = String(DATA.length); });
    if (page === 'materials') draw();
    const prev = onPageShown;
    onPageShown = (pg) => { prev(pg); if (pg === 'materials') draw(); };
  }).catch(() => { matList.innerHTML = '<p class="cq-loading">Materials could not be loaded.</p>'; });
  document.querySelector('.cq-mat-tools')?.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const [k, v] = Object.entries(b.dataset)[0]; st[k] = st[k] === v ? '' : v; st.shown = 24; draw();
  });
  document.getElementById('mat-q')?.addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); st.shown = 24; draw(); });
  document.getElementById('mat-more')?.addEventListener('click', () => { st.shown += 24; draw(); });
}

/* ---------- Campus photo: zooms gently as it scrolls through the view ---------- */
const campus = document.querySelector('.cq-campus img');
if (campus && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let tick = false;
  const zoom = () => {
    tick = false;
    const r = campus.parentElement.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, 1 - (r.top + r.height / 2) / (innerHeight + r.height / 2)));
    campus.style.transform = `scale(${(1.28 - p * 0.28).toFixed(4)}) translateY(${((0.5 - p) * 6).toFixed(2)}%)`;
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(zoom); } }, { passive: true });
  zoom();
}

document.querySelectorAll('img[data-credit]').forEach((img) => {
  const c = credits[img.dataset.credit];
  if (c) img.title = `${c.title} — ${c.author || 'Wikimedia Commons'} (${c.license})`;
});

/* ---------- Quantum hero: a braid of three worldlines (as in the CQTS mark) flowing in time,
   over a faint interference field. Gentle scroll parallax and pointer tilt. ---------- */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hero = document.querySelector('.cq-hero');
const canvas = document.querySelector('.cq-field');
if (hero && canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, t = 0, running = true, scrollShift = 0;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  new ResizeObserver(resize).observe(hero);
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    tilt.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; tilt.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  hero.addEventListener('pointerleave', () => { tilt.tx = 0; tilt.ty = 0; });

  const COLORS = ['#c9b6ec', '#ffffff', '#8fb0ff'];
  const smooth = (u) => u * u * (3 - 2 * u);
  // Braid word σ1 σ2 σ1 σ2 …: which slots cross in segment k, and where strand `s` sits there
  function strandPath(s, segs) {
    const pts = []; let slot = s;
    for (let k = 0; k < segs; k++) {
      const [a, b] = k % 2 ? [1, 2] : [0, 1];
      const from = slot, to = slot === a ? b : slot === b ? a : slot;
      pts.push([from, to, k]);
      slot = to;
    }
    return pts;
  }

  function frame() {
    if (!running) return;
    if (!reduce) t += 0.0045;
    tilt.x += (tilt.tx - tilt.x) * 0.06; tilt.y += (tilt.ty - tilt.y) * 0.06;
    ctx.clearRect(0, 0, W, H);
    const wide = W > 900;
    const cx = wide ? W * 0.76 : W * 0.5, boxW = wide ? Math.min(W * 0.3, 380) : W * 0.8;
    const ox = tilt.x * 10, oy = tilt.y * 8 - scrollShift;

    // faint interference field around the braid, fading towards the text
    const STEP = 24, k = 0.05;
    const s1x = cx - boxW * 0.35 + ox, s2x = cx + boxW * 0.35 + ox, sy = H * 0.5 + oy;
    for (let y = STEP / 2; y < H; y += STEP) {
      for (let x = STEP / 2; x < W; x += STEP) {
        const fade = wide ? Math.max(0, Math.min(1, (x - W * 0.45) / (W * 0.2))) : 0.35;
        if (fade <= 0) continue;
        const r1 = Math.hypot(x - s1x, y - sy), r2 = Math.hypot(x - s2x, y - sy);
        const a = Math.cos(k * r1 - t * 9) + Math.cos(k * r2 - t * 9);
        const p = (a * a) / 4;
        if (p < 0.15) continue;
        ctx.fillStyle = `rgba(200, 185, 255, ${p * 0.22 * fade})`;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    // the braid: segments flow upward continuously
    const segH = Math.max(120, H * 0.24), segs = Math.ceil(H / segH) + 3;
    const flow = (t * 60) % (2 * segH);
    const top = -2 * segH + (2 * segH - flow);
    const slotX = (sl) => cx + ox + (sl - 1) * (boxW / 2);
    const paths = [0, 1, 2].map((s) => strandPath(s, segs));
    // draw each segment: the "under" strand first, then the "over" strand with a gap stroke
    for (let k = 0; k < segs; k++) {
      const y0 = top + k * segH + oy, y1 = y0 + segH;
      const order = [0, 1, 2].sort((a, b) => {
        const pa = paths[a][k], pb = paths[b][k];
        const ca = pa[0] !== pa[1], cb = pb[0] !== pb[1];
        if (ca && cb) return pa[0] < pa[1] ? 1 : -1; // the strand moving right goes over
        return 0;
      });
      for (const s of order) {
        const [from, to] = paths[s][k];
        const curve = (u0, u1) => {
          ctx.beginPath();
          for (let i = 0; i <= 24; i++) {
            const u = u0 + (u1 - u0) * (i / 24), x = slotX(from + (to - from) * smooth(u)), y = y0 + u * segH;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
        };
        // a gap in the strand underneath, only around the crossing point
        if (from !== to) { curve(0.3, 0.7); ctx.strokeStyle = 'rgba(44, 10, 90, 0.95)'; ctx.lineWidth = 20; ctx.lineCap = 'butt'; ctx.shadowBlur = 0; ctx.stroke(); }
        curve(0, 1);
        ctx.strokeStyle = COLORS[s]; ctx.lineWidth = 9; ctx.lineCap = 'round';
        ctx.shadowColor = COLORS[s]; ctx.shadowBlur = 18; ctx.globalAlpha = 0.92;
        ctx.stroke();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
    }
    // nodes where the worldlines enter and leave (as in the CQTS mark)
    // beads ride on the strands: at every other segment boundary each strand passes straight through
    // its slot, so the beads sit exactly on the worldlines and flow up with them
    for (let k = 0; k <= segs; k += 2) {
      const y = top + k * segH + oy;
      if (y < -20 || y > H + 20) continue;
      const edge = Math.min(1, Math.max(0, Math.min(y, H - y) / (H * 0.18))); // fade in/out at the edges
      [0, 1, 2].forEach((sl) => {
        const strand = [0, 1, 2].find((st) => (paths[st][k] || paths[st][k - 1])?.[paths[st][k] ? 0 : 1] === sl);
        ctx.globalAlpha = edge;
        ctx.beginPath(); ctx.arc(slotX(sl), y, 11, 0, Math.PI * 2);
        ctx.fillStyle = '#2c0a5a'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = COLORS[strand ?? 0]; ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
    if (!reduce) requestAnimationFrame(frame);
  }
  new IntersectionObserver(([e]) => { const was = running; running = e.isIntersecting; if (running && !was) requestAnimationFrame(frame); }).observe(hero);
  requestAnimationFrame(frame);

  // Gentle parallax: the braid drifts at a slower rate than the page; floating symbols in later sections
  const glyphs = [...document.querySelectorAll('.cq-glyphs span')].map((el) => ({ el, d: +el.dataset.float, host: el.closest('section') }));
  let ticking = false;
  const onScroll = () => {
    if (ticking || reduce) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      scrollShift = Math.min(scrollY, H) * -0.18;
      if (reduce) frame();
      glyphs.forEach(({ el, d, host }) => {
        const r = host.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) return;
        el.style.transform = `translate3d(0, ${(r.top - innerHeight / 2) * -d}px, 0)`;
      });
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
