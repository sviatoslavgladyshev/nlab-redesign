// CQTS page: shared behaviour + tab highlighting while scrolling.
import './main.js';
import credits from './data/credits.json';

const tabs = [...document.querySelectorAll('.tabs a')];
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) tabs.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${e.target.id}`));
  });
}, { rootMargin: '-35% 0px -60% 0px' });
document.querySelectorAll('.cqts-section').forEach((s) => spy.observe(s));

document.querySelectorAll('img[data-credit]').forEach((img) => {
  const c = credits[img.dataset.credit];
  if (c) img.title = `${c.title} — ${c.author || 'Wikimedia Commons'} (${c.license})`;
});
