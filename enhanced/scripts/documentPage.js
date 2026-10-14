/* global document, ME_SETTINGS */
/* eslint-disable unicorn/no-unsafe-dom-html -- the markup is a constant and the message is set with textContent */

/**
 * Save on the document page.
 *
 * Upstream's `onSubmitClick` (lib/scripts/document.js) asks the server whether the text is valid, but reads it with
 * `doc.getValue()`, a CodeMirror 5 method the CodeMirror 6 editor does not have. It throws, so the click falls through to a
 * plain submit and the check never runs. Validation must stay on the server: `ObjectId('…')` and `ISODate('…')` are not
 * JSON, so `JSON.parse` would reject nearly every document.
 *
 * `submit` is a testable core: every effect is passed in.
 *  - syncEditor: copies the editor's text into the textarea (the editor does that on a `submit` event)
 *  - validate: resolves to the server's verdict ('Valid' or anything else); may reject on a network error
 */
export const createSaveHandler = ({ syncEditor, readText, validate, submit, showError, clearError }) => async () => {
  clearError();
  syncEditor();
  let verdict;
  try {
    verdict = await validate(readText());
  } catch {
    showError('Could not check the document. Please try again.');
    return false;
  }
  if (verdict === 'Valid') {
    submit();
    return true;
  }
  showError('Invalid JSON');
  return false;
};

const ALERT_ID = 'documentInvalidJSON';

const showError = (message) => {
  const title = document.querySelector('#pageTitle');
  if (!title) return;
  let alert = document.querySelector(`#${ALERT_ID}`);
  if (!alert) {
    alert = document.createElement('div');
    alert.id = ALERT_ID;
    alert.className = 'alert alert-danger';
    alert.setAttribute('role', 'alert');
    alert.innerHTML = '<i class="fas fa-exclamation-triangle" aria-hidden="true"></i><div class="me-alert-body"><strong></strong></div>';
    // where upstream's own script puts it
    title.parentElement.append(alert);
  }
  alert.querySelector('strong').textContent = message;
};

const clearError = () => {
  document.querySelector('#discardChanges')?.remove();
  document.querySelector(`#${ALERT_ID}`)?.remove();
};

export const initDocumentSave = () => {
  const form = document.querySelector('#documentEditForm');
  const textarea = form?.querySelector('#document');
  if (!form || !textarea || typeof globalThis.onSubmitClick !== 'function') return;

  const handler = createSaveHandler({
    // The editor copies its text into the textarea on `submit`. A synthetic event runs that without submitting the form.
    syncEditor: () => form.dispatchEvent(new Event('submit', { cancelable: true })),
    readText: () => textarea.value,
    validate: async (text) => {
      const response = await fetch(`${ME_SETTINGS.baseHref}checkValid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': form.querySelector('[name="_csrf"]').value,
        },
        body: new URLSearchParams({ document: text }),
      });
      return response.text();
    },
    // form.submit() does not fire `submit` again, and the textarea is already in sync
    submit: () => form.submit(),
    showError,
    clearError,
  });

  globalThis.onSubmitClick = () => {
    handler();
    return false;
  };
};
