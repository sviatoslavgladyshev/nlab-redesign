import { esc } from '../../core/nlab.js';
import { icons } from '../../ui/app.js';
import { parseBibliography, referenceAuthors, referenceTitle } from '../../core/bibliography.js';

export function openBibliography({ text, onChange, onCite, signal }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal bib-dialog';
  dialog.innerHTML = '<div class="bib-panel">'
    + '<header class="bib-head"><span class="bib-ic" aria-hidden="true"><i data-lucide="book-open"></i></span>'
    + '<div><h2 id="bib-title">Bibliography</h2><p class="bib-sub">Import your references once, then cite them anywhere in the page.</p></div>'
    + '<form method="dialog" class="bib-close"><button class="bib-x" aria-label="Close"><i data-lucide="x"></i></button></form></header>'
    + '<button type="button" class="bib-drop" data-drop><i data-lucide="upload"></i><b>Drop a .bib file here</b><span>or click to choose one from your computer</span></button>'
    + '<div class="bib-toolbar">'
    + '<input type="search" aria-label="Search bibliography" placeholder="Search title, author or citation key" hidden>'
    + '<div class="bib-actions">'
    + '<button type="button" class="tbtn primary" data-import><i data-lucide="upload"></i><span>Import .bib file</span></button>'
    + '<input type="file" accept=".bib,application/x-bibtex" hidden>'
    + '<button type="button" class="tbtn" data-edit><i data-lucide="file-code"></i><span>Edit BibTeX</span></button>'
    + '<button type="button" class="tbtn" data-download hidden><i data-lucide="copy"></i><span>Download .bib</span></button>'
    + '<button type="button" class="tbtn danger" data-remove hidden><i data-lucide="trash-2"></i><span>Remove</span></button></div></div>'
    + '<p role="status" class="bib-message"></p>'
    + '<ul class="bib-entries" hidden></ul>'
    + '<form class="bib-edit" hidden><label>BibTeX source<textarea rows="12" spellcheck="false" autocapitalize="off" placeholder="@article{key,\n  author = {…},\n  title = {…},\n  year = {…}\n}"></textarea></label>'
    + '<div class="bib-actions"><button type="submit" class="tbtn primary">Save bibliography</button>'
    + '<button type="button" class="tbtn" data-cancel>Cancel</button></div></form>'
    + '<form method="dialog" class="modal-actions"><span class="bib-count"></span><button class="tbtn primary">Done</button></form>'
    + '</div>';
  dialog.setAttribute('aria-labelledby', 'bib-title');
  document.body.append(dialog);
  icons();
  const $ = (selector) => dialog.querySelector(selector);
  const upload = $('input[type=file]');
  const importButton = $('[data-import]');
  const search = $('input[type=search]');
  const list = $('.bib-entries');
  const message = $('.bib-message');
  const editor = $('.bib-edit');
  const field = $('textarea');
  const save = $('[type=submit]');
  const actions = $('.bib-toolbar');
  const done = $('.modal-actions');
  const editButton = $('[data-edit]');
  const removeButton = $('[data-remove]');
  let entries = [];

  function draw() {
    const query = search.value.trim().toLowerCase();
    const matching = entries.filter((entry) => [entry.key, referenceTitle(entry), referenceAuthors(entry)]
      .some((part) => part.toLowerCase().includes(query)));
    list.innerHTML = matching.map((entry) => {
      const metadata = [referenceAuthors(entry), entry.fields.year].filter(Boolean).map(esc).join(' · ');
      return '<li><span class="bib-ref"><strong>' + esc(referenceTitle(entry)) + '</strong>'
        + (metadata ? '<small>' + metadata + '</small>' : '') + '<code>' + esc(entry.key) + '</code></span>'
        + '<button type="button" class="tbtn" data-cite="' + esc(entry.key)
        + '" aria-label="Cite ' + esc(entry.key) + '"><i data-lucide="quote"></i><span>Cite</span></button></li>';
    }).join('') || '<li class="bib-none">No references match “' + esc(search.value.trim()) + '”.</li>';
    icons();
  }

  function showEntries() {
    importButton.querySelector('span').textContent = text ? 'Replace file' : 'Import .bib file';
    const empty = !text && editor.hidden;
    dialog.querySelector('.bib-panel').classList.toggle('is-empty', empty);
    $('[data-drop]').hidden = !empty;
    $('.bib-count').textContent = entries.length ? `${entries.length} reference${entries.length === 1 ? '' : 's'}` : '';
    $('[data-download]').hidden = $('[data-remove]').hidden = !text;
    search.hidden = list.hidden = !entries.length || !editor.hidden;
    if (entries.length && editor.hidden) draw();
  }

  function setEditing(editing) {
    editor.hidden = !editing;
    actions.hidden = done.hidden = editing;
    showEntries();
    if (editing) field.focus();
    else $('[data-edit]').focus();
  }

  async function saveText(next) {
    if (next.length > 2_000_000) throw new Error('This bibliography is too large for the draft.');
    const parsed = await parseBibliography(next);
    if (!dialog.open) return false;
    if (!parsed.entries.length || parsed.errors.length) {
      throw new Error(parsed.errors[0]?.error || 'This file contains no BibTeX entries.');
    }
    const keys = parsed.entries.map(({ key }) => key);
    if (keys.some((key) => !key || /[\s{},]/.test(key))) throw new Error('Every entry needs a valid citation key.');
    if (new Set(keys).size !== keys.length) throw new Error('The file has duplicate citation keys.');
    onChange(next);
    text = next;
    entries = parsed.entries;
    search.value = '';
    showEntries();
    return true;
  }

  importButton.addEventListener('click', () => upload.click());
  $('[data-drop]').addEventListener('click', () => upload.click());
  // drag a .bib file onto the dialog
  const panel = dialog.querySelector('.bib-panel');
  panel.addEventListener('dragover', (event) => { event.preventDefault(); panel.classList.add('is-dragging'); });
  panel.addEventListener('dragleave', (event) => { if (!panel.contains(event.relatedTarget)) panel.classList.remove('is-dragging'); });
  panel.addEventListener('drop', (event) => {
    event.preventDefault();
    panel.classList.remove('is-dragging');
    const [file] = event.dataTransfer.files;
    if (file) importFile(file);
  });
  upload.addEventListener('change', () => {
    const [file] = upload.files;
    upload.value = '';
    if (file) importFile(file);
  });
  async function importFile(file) {
    importButton.disabled = editButton.disabled = removeButton.disabled = true;
    message.textContent = 'Reading the bibliography…';
    try {
      if (file.size > 4_000_000) throw new Error('This file is too large for the draft.');
      const next = (await file.text()).replace(/^\uFEFF/, '');
      if (!await saveText(next)) return;
      message.textContent = entries.length + (entries.length === 1 ? ' reference imported.' : ' references imported.');
    } catch (error) {
      message.textContent = error.message || 'The bibliography could not be imported.';
    } finally { importButton.disabled = editButton.disabled = removeButton.disabled = false; }
  }
  editButton.addEventListener('click', () => {
    field.value = text;
    message.textContent = '';
    setEditing(true);
  });
  $('[data-cancel]').addEventListener('click', () => {
    message.textContent = '';
    setEditing(false);
  });
  editor.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    field.readOnly = $('[data-cancel]').disabled = true;
    message.textContent = 'Checking your changes…';
    try {
      if (!await saveText(field.value)) return;
      message.textContent = 'Bibliography saved.';
      setEditing(false);
    } catch (error) {
      message.textContent = error.message || 'The bibliography could not be saved.';
    } finally {
      save.disabled = field.readOnly = $('[data-cancel]').disabled = false;
    }
  });
  search.addEventListener('input', draw);
  list.addEventListener('click', (event) => {
    const cite = event.target.closest('[data-cite]');
    if (!cite || !dialog.open) return;
    dialog.close();
    onCite(cite.dataset.cite);
  });
  $('[data-download]').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/x-bibtex;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'references.bib';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  removeButton.addEventListener('click', () => {
    onChange('');
    text = '';
    entries = [];
    message.textContent = 'Bibliography removed. Citation keys remain in the draft.';
    showEntries();
  });
  const close = () => dialog.close();
  signal.addEventListener('abort', close, { once: true });
  dialog.addEventListener('close', () => {
    signal.removeEventListener('abort', close);
    dialog.remove();
  }, { once: true });
  dialog.showModal();
  showEntries();
  if (text) {
    message.textContent = 'Reading the bibliography…';
    const attached = text;
    parseBibliography(text).then((parsed) => {
      if (!dialog.open || text !== attached) return;
      entries = parsed.entries;
      message.textContent = parsed.errors[0]?.error || (entries.length ? '' : 'This bibliography contains no entries.');
      showEntries();
    }, () => {
      if (dialog.open && text === attached) message.textContent = 'The bibliography could not be read.';
    });
  }
}
