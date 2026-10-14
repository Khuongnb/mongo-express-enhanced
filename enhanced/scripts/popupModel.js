// Pure parts of the document popup: reading upstream's document page, building requests, moving between rows.

/**
 * What the popup needs from upstream's document page (rendered by enhanced/views/document.html, or upstream's own).
 * `root` is anything with querySelector/getAttribute/textContent, a parsed `Document` in the browser. Returns null when the
 * page is not a document page (typically the sign-in page, after the session ended).
 */
export const parseDocumentPage = (root) => {
  const form = root.querySelector('#documentEditForm');
  const area = root.querySelector('#document');
  if (!form || !area) return null;
  const deleteForm = root.querySelector('.deleteButtonDocument')?.closest('form');
  return {
    text: area.textContent,
    csrf: root.querySelector('[name="_csrf"]')?.getAttribute('value') ?? '',
    saveUrl: form.getAttribute('action'),
    deleteUrl: deleteForm?.getAttribute('action') ?? null,
  };
};

/** Form fields upstream's routes expect: `_method` is how express-method-override turns the POST into a PUT or DELETE. */
export const formBody = ({ method, csrf, document }) => {
  const body = new URLSearchParams({ _method: method, _csrf: csrf });
  if (document !== undefined) body.set('document', document);
  return body;
};

/** Index of the row `delta` steps away, or -1 when that is outside the page. */
export const neighbourIndex = (index, delta, count) => {
  const next = index + delta;
  return next >= 0 && next < count ? next : -1;
};

export const positionLabel = (index, count) => `${index + 1} of ${count} on this page`;

/** Document URLs are always relative to the app; refuse anything that would resolve to another origin. */
export const isSameOrigin = (url, base, origin) => {
  try {
    return new URL(url, base).origin === origin;
  } catch {
    return false;
  }
};
