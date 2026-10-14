/* global document */
// Clipboard write that also works on plain-http origins (a dev box reached by IP), where navigator.clipboard is absent.
export const copyText = async (text) => {
  try {
    if (globalThis.navigator.clipboard) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea route
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
};
