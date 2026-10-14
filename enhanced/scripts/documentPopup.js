/* global document, DOMParser, CSS, ME_SETTINGS */
// The document popup: clicking a row of the collection table shows that document in a modal instead of navigating to its page.
//
// It does not reimplement anything. It fetches the document's own page, takes the text, CSRF token and form URLs from it
// (so Binary and Long ids, `skip` and so on are upstream's problem), validates on the server through /checkValid (the text is
// extended JSON, `JSON.parse` would reject it), and saves or deletes by posting the same forms upstream's page posts.
// The editor (CodeMirror, ~500 KB) is loaded on the first click, not with the page.
import {
  formBody, isSameOrigin, neighbourIndex, parseDocumentPage, positionLabel,
} from './popupModel.js';

const ID_SELECTOR = 'td[data-column="_id"] a[href]';
const DELETE_ARM_MS = 4000;

const loadEditor = () => import(/* webpackChunkName: "editor" */ '../../lib/scripts/editor.js').then((module) => module.default);

const rowUrl = (row) => row.querySelector(ID_SELECTOR)?.getAttribute('href') ?? null;

const post = (url, body) => fetch(url, {
  method: 'POST',
  credentials: 'same-origin',
  // upstream's routes answer with a redirect, whose flash message the NEXT page load shows. Following it here would let
  // this request consume the message; stopping at the redirect leaves it for the reload below.
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
});
const succeeded = (response) => response.type === 'opaqueredirect' || response.ok;

export const initDocumentPopup = () => {
  const element = document.querySelector('[data-me-popup]');
  const table = document.querySelector('table.table-documents');
  if (!element || !table) return;

  // The page's own Bootstrap (lib/scripts/vendor.js) must own the modal: its data-API handles every data-bs-dismiss button, and
  // a second copy bundled here would keep a separate instance registry. Bootstrap registers its jQuery plugin there.
  const $ = globalThis.jQuery;
  if (!$?.fn?.modal) return;
  const modal = { show: () => $(element).modal('show') };
  const part = (name) => element.querySelector(`:scope [data-me-popup-${CSS.escape(name)}]`);
  const ui = {
    id: part('id'),
    copy: part('copy'),
    prev: part('prev'),
    next: part('next'),
    open: part('open'),
    error: part('error'),
    errorText: part('error-text'),
    discard: part('discard'),
    loading: part('loading'),
    editorBox: part('editor'),
    position: part('position'),
    save: part('save'),
    remove: part('delete'),
  };
  const textarea = element.querySelector('#popupDocument');
  const readOnly = ME_SETTINGS.readOnly === true;

  const state = {
    rows: [],
    index: -1,
    current: null, // what parseDocumentPage returned for the document being shown
    original: '',
    view: null,
    editorPromise: null,
    token: 0, // guards against a slow response for a document the user has already moved away from
    forceClose: false,
    armTimer: null,
  };

  const text = () => (state.view ? state.view.state.doc.toString() : '');
  const isDirty = () => state.current !== null && text() !== state.original;

  const showError = (message) => {
    ui.errorText.textContent = message;
    ui.error.hidden = false;
  };
  const clearMessages = () => {
    ui.error.hidden = true;
    ui.discard.hidden = true;
  };

  const disarmDelete = () => {
    clearTimeout(state.armTimer);
    if (!ui.remove) return;
    delete ui.remove.dataset.armed;
    ui.remove.querySelector('span').textContent = 'Delete';
  };

  const refreshControls = () => {
    ui.prev.disabled = neighbourIndex(state.index, -1, state.rows.length) === -1;
    ui.next.disabled = neighbourIndex(state.index, 1, state.rows.length) === -1;
    ui.position.textContent = positionLabel(state.index, state.rows.length);
    if (ui.save) ui.save.disabled = !isDirty();
    if (ui.remove) ui.remove.disabled = state.current?.deleteUrl == null;
  };

  const markOpenRow = () => {
    for (const row of state.rows) row.classList.toggle('is-open', row === state.rows[state.index]);
  };

  const ensureEditor = () => {
    state.editorPromise ??= loadEditor().then((editor) => {
      state.view = editor(textarea, { readOnly });
      state.view.dom.addEventListener('input', refreshControls);
      state.view.dom.addEventListener('keyup', refreshControls);
    });
    return state.editorPromise;
  };

  const setText = (value) => {
    state.view.dispatch({ changes: { from: 0, to: state.view.state.doc.length, insert: value } });
    state.view.scrollDOM.scrollTop = 0;
  };

  const show = async (index) => {
    const row = state.rows[index];
    const url = rowUrl(row);
    state.index = index;
    state.current = null;
    state.token += 1;
    const { token } = state;
    disarmDelete();
    clearMessages();
    markOpenRow();
    ui.id.textContent = row.querySelector('[data-me-copy]')?.dataset.meCopy ?? '';
    ui.open.href = url;
    ui.loading.hidden = false;
    ui.editorBox.hidden = true;
    refreshControls();

    try {
      const [response] = await Promise.all([fetch(url, { credentials: 'same-origin' }), ensureEditor()]);
      const parsed = response.ok ? parseDocumentPage(new DOMParser().parseFromString(await response.text(), 'text/html')) : null;
      if (token !== state.token) return;
      if (!parsed) throw new Error('not a document page');
      state.current = parsed;
      state.original = parsed.text;
      setText(parsed.text);
      state.original = text();
      ui.loading.hidden = true;
      ui.editorBox.hidden = false;
    } catch {
      if (token !== state.token) return;
      ui.loading.hidden = true;
      showError('Could not load this document. It may have been deleted, or you may be signed out. Reload the page and try again.');
    }
    refreshControls();
  };

  // Leaving a document with unsaved changes needs a second, deliberate action.
  const confirmLeave = () => {
    if (!isDirty() || state.forceClose) return true;
    ui.discard.hidden = false;
    state.forceClose = true;
    return false;
  };

  const move = (delta) => {
    const next = neighbourIndex(state.index, delta, state.rows.length);
    if (next !== -1 && confirmLeave()) show(next);
  };

  const reload = () => globalThis.location.reload();

  const save = async () => {
    const { current } = state;
    if (!current || !isDirty()) return;
    clearMessages();
    ui.save.disabled = true;
    try {
      const verdict = await fetch(`${ME_SETTINGS.baseHref}checkValid`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': current.csrf },
        body: new URLSearchParams({ document: text() }),
      }).then((response) => response.text());
      if (verdict !== 'Valid') {
        showError('Invalid JSON');
        refreshControls();
        return;
      }
      const response = await post(current.saveUrl, formBody({ method: 'put', csrf: current.csrf, document: text() }));
      if (!succeeded(response)) throw new Error(String(response.status));
      state.original = text(); // saved: closing must not ask about discarding
      reload();
    } catch {
      showError('Could not save the document. Please try again.');
      refreshControls();
    }
  };

  const remove = async () => {
    const { current } = state;
    if (!current?.deleteUrl) return;
    if (ui.remove.dataset.armed !== 'true') {
      // Deleting from a popup is one click away from reading; ask once, inline, whatever the confirmDelete setting says.
      ui.remove.dataset.armed = 'true';
      ui.remove.querySelector('span').textContent = 'Click again to delete';
      state.armTimer = setTimeout(disarmDelete, DELETE_ARM_MS);
      return;
    }
    disarmDelete();
    clearMessages();
    ui.remove.disabled = true;
    try {
      const response = await post(current.deleteUrl, formBody({ method: 'delete', csrf: current.csrf }));
      if (!succeeded(response)) throw new Error(String(response.status));
      state.original = text();
      reload();
    } catch {
      showError('Could not delete the document. Please try again.');
      refreshControls();
    }
  };

  const open = (row) => {
    state.rows = [...table.querySelectorAll(':scope > tbody > tr')].filter((candidate) => rowUrl(candidate) !== null);
    const index = state.rows.indexOf(row);
    if (index === -1) return;
    state.forceClose = false;
    modal.show();
    show(index);
  };

  // Upstream's rows call this global on click and it navigates to the document's page.
  globalThis.loadDocument = (url, event) => {
    if (globalThis.getSelection().toString() !== '') return;
    if (!isSameOrigin(url, globalThis.location.href, globalThis.location.origin)) return;
    if (event && (event.ctrlKey || event.metaKey)) {
      globalThis.open(new URL(url, globalThis.location.href).href, '_blank', 'noopener');
      return;
    }
    // links, buttons and forms inside the row do their own thing
    if (event?.target?.closest('a, button, input, select, textarea, form, label')) return;
    const row = event?.target?.closest('tr');
    if (row) open(row);
  };

  ui.prev.addEventListener('click', () => move(-1));
  ui.next.addEventListener('click', () => move(1));
  ui.save?.addEventListener('click', save);
  ui.remove?.addEventListener('click', remove);
  ui.copy.addEventListener('click', () => {
    navigator.clipboard?.writeText(ui.id.textContent);
  });

  element.addEventListener('hide.bs.modal', (event) => {
    if (!confirmLeave()) event.preventDefault();
  });
  element.addEventListener('hidden.bs.modal', () => {
    state.token += 1;
    state.current = null;
    state.forceClose = false;
    disarmDelete();
    clearMessages();
    for (const row of state.rows) row.classList.remove('is-open');
  });
  // a keystroke after the discard warning is the user changing their mind
  element.addEventListener('input', () => {
    state.forceClose = false;
    ui.discard.hidden = true;
    ui.error.hidden = true;
  });
};
