// ADHD reading: Lexend, wider spacing and bold word beginnings ("bionic" anchors),
// with a short introduction the first time someone turns it on.
import { icons } from '../../ui/app.js';
import { $, toast } from './shell.js';

const FOCUS_KEY = 'nlab-focus-read';
export const focusOn = () => { try { return localStorage.getItem(FOCUS_KEY) === '1'; } catch { return false; } };
export function applyFocusRead(root, on = focusOn()) {
  root.classList.toggle('focus-read', on);
  root.querySelectorAll('b.bx').forEach((b) => b.replaceWith(b.textContent));
  root.normalize();
  if (!on) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('.katex, .m, .eq, code, pre, figure, script, style, h1, h2, h3, h6, .ref') || !/[A-Za-z]{2}/.test(n.nodeValue)
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => {
    const frag = document.createDocumentFragment();
    n.nodeValue.split(/(\p{L}+)/u).forEach((part) => {
      if (/^\p{L}{2,}$/u.test(part)) {
        const k = part.length <= 3 ? 1 : Math.ceil(part.length * 0.45);
        const b = document.createElement('b'); b.className = 'bx'; b.textContent = part.slice(0, k);
        frag.append(b, part.slice(k));
      } else if (part) frag.append(part);
    });
    n.replaceWith(frag);
  });
}

// First use of ADHD reading: what it is, who it is for, and a before/after preview
function adhdIntro(done) {
  const sample = 'A functor maps the objects and morphisms of one category to those of another, preserving composition and identities.';
  const dlg = document.createElement('dialog');
  dlg.className = 'modal adhd-intro';
  dlg.setAttribute('aria-labelledby', 'adhd-title');
  dlg.innerHTML = `<form method="dialog">
    <span class="adhd-badge"><i data-lucide="book-text"></i>Reading mode</span>
    <h2 id="adhd-title">ADHD reading</h2>
    <p class="adhd-lead">A reading mode made for people with <b>ADHD</b>, <b>dyslexia</b> and similar attention or reading difficulties, and for anyone who finds long, dense mathematical text hard to stay with.</p>
    <ul class="adhd-points">
      <li><i data-lucide="type"></i><span><b>A calmer font.</b> Lexend, designed to reduce visual stress and make letters easier to tell apart.</span></li>
      <li><i data-lucide="list"></i><span><b>More space.</b> Wider letter, word and line spacing, so lines don’t blur together.</span></li>
      <li><i data-lucide="eye"></i><span><b>Bold word beginnings.</b> The first letters of each word guide the eye, so you can keep your place.</span></li>
      <li><i data-lucide="sigma"></i><span><b>Formulas untouched.</b> Mathematics, code and diagrams stay exactly as they are.</span></li>
    </ul>
    <div class="adhd-demo">
      <div><small>Normal</small><p>${sample}</p></div>
      <div class="focus-read"><small>ADHD reading</small><p class="adhd-sample">${sample}</p></div>
    </div>
    <p class="adhd-note">You can switch it off at any time with the same button. Your choice is remembered on this device.</p>
    <div class="adhd-actions"><button value="no" class="tbtn">Not now</button><button value="yes" class="tbtn primary"><i data-lucide="check"></i><span>Turn on ADHD reading</span></button></div>
  </form>`;
  document.body.append(dlg);
  applyFocusRead($('.adhd-sample', dlg).parentElement, true);
  icons();
  dlg.addEventListener('close', () => {
    try { localStorage.setItem('nlab-focus-intro', '1'); } catch { /* ignore */ }
    done(dlg.returnValue === 'yes');
    dlg.remove();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('no'); });
  dlg.showModal();
}

// The "ADHD reading" button: first use shows the introduction, later clicks just toggle
export function toggleReading(button) {
  const on = !focusOn();
  const set = (v) => {
    try { localStorage.setItem(FOCUS_KEY, v ? '1' : '0'); } catch { /* ignore */ }
    button.setAttribute('aria-pressed', String(v));
    applyFocusRead($('#a-body'), v);
  };
  let seen = false;
  try { seen = localStorage.getItem('nlab-focus-intro') === '1'; } catch { /* ignore */ }
  if (on && !seen) adhdIntro((yes) => { if (yes) { set(true); toast('ADHD reading is on. Click the button again to turn it off.'); } });
  else { set(on); if (on) toast('ADHD reading is on.'); }
}
