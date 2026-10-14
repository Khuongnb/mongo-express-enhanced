/* global document */

const ARM_MS = 4000;

// Buttons marked data-me-confirm-click need two clicks to do their (destructive) thing: the first arms them and changes the label,
// the second goes through. Arming ends on its own after a few seconds, and when focus leaves the button.
export const initConfirmClick = () => {
  for (const button of document.querySelectorAll('[data-me-confirm-click]')) {
    let timer = null;
    const original = [...button.childNodes].map((node) => node.cloneNode(true));
    const disarm = () => {
      clearTimeout(timer);
      delete button.dataset.armed;
      button.replaceChildren(...original.map((node) => node.cloneNode(true)));
    };
    button.addEventListener('click', (event) => {
      event.stopPropagation(); // the row's own click handler downloads the file
      if (button.dataset.armed === 'true') return;
      event.preventDefault();
      button.dataset.armed = 'true';
      button.textContent = 'Click again';
      timer = setTimeout(disarm, ARM_MS);
    });
    button.addEventListener('blur', disarm);
  }
};
