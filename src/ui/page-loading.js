const pending = new Set();
let status;
let label;
let layout;
let header;
let footer;

function position() {
  const height = document.documentElement.clientHeight;
  const top = Math.min(height, Math.max(0, header?.getBoundingClientRect().bottom ?? 0));
  const bottom = Math.max(top, Math.min(height, footer?.getBoundingClientRect().top ?? height));
  status.style.top = `${(top + bottom) / 2}px`;
}

function update() {
  const active = [...pending].reverse().find((load) => load.ready);
  if (!active) {
    if (status) {
      status.hidden = true;
      label.textContent = '';
      layout.disconnect();
      window.removeEventListener('scroll', position);
      window.removeEventListener('resize', position);
    }
    return;
  }
  if (!status) {
    status = document.createElement('div');
    status.className = 'page-loading';
    status.setAttribute('role', 'status');
    status.innerHTML = '<span class="page-loading-ring" aria-hidden="true"></span><span></span>';
    label = status.lastElementChild;
    document.body.append(status);
    header = document.querySelector('body > .nav');
    footer = document.querySelector('body > footer');
    layout = new ResizeObserver(position);
    status.hidden = true;
  }
  if (status.hidden) {
    layout.observe(document.body);
    if (header) layout.observe(header);
    if (footer) layout.observe(footer);
    window.addEventListener('scroll', position, { passive: true });
    window.addEventListener('resize', position);
  }
  position();
  status.hidden = false;
  if (label.textContent !== active.label) label.textContent = active.label;
}

export function startPageLoading(label) {
  const load = { label, ready: false };
  pending.add(load);
  const delay = setTimeout(() => {
    load.ready = true;
    update();
  }, 240);
  return () => {
    clearTimeout(delay);
    if (pending.delete(load)) update();
  };
}

export async function withPageLoading(label, task) {
  const stop = startPageLoading(label);
  try { return await task(); }
  finally { stop(); }
}
