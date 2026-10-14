/* global document */

/** The input type and the button's labels once the password is shown (`reveal`) or hidden. */
export const revealState = (reveal) => (reveal
  ? { type: 'text', label: 'Hide password', icon: 'fa-eye-slash', pressed: 'true' }
  : { type: 'password', label: 'Show password', icon: 'fa-eye', pressed: 'false' });

// Progressive enhancement of the sign-in page: a show/hide button for the password and a Caps Lock hint.
// The page is fully usable without either (the button stays hidden until this runs).
export const initSigninPage = () => {
  for (const button of document.querySelectorAll('[data-me-reveal]')) {
    const input = document.querySelector(button.dataset.meReveal);
    if (!input) continue;
    button.hidden = false;
    button.addEventListener('click', () => {
      const state = revealState(input.type === 'password');
      input.type = state.type;
      button.setAttribute('aria-label', state.label);
      button.setAttribute('aria-pressed', state.pressed);
      const icon = button.querySelector('i');
      if (icon) icon.className = `fas ${state.icon}`;
      input.focus();
    });
  }

  const hint = document.querySelector('[data-me-caps]');
  const password = document.querySelector('#password');
  if (hint && password) {
    const update = (event) => {
      hint.hidden = typeof event.getModifierState !== 'function' || !event.getModifierState('CapsLock');
    };
    password.addEventListener('keydown', update);
    password.addEventListener('keyup', update);
    password.addEventListener('blur', () => { hint.hidden = true; });
  }
};
