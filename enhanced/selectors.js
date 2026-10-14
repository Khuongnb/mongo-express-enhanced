// Every upstream selector the enhanced CSS/JS relies on. Enhancement code imports these instead of scattering strings,
// and test/enhanced/selectorContractSpec.js asserts each one still matches on the page listed in `contract` — so an
// upstream markup change fails a test rather than silently breaking the UI. Add a selector here before using it.
export const SELECTORS = {
  navbar: '#navbar',
  darkModeIcon: '#darkModeIcon',
  pageTitle: '#pageTitle',
};

export const contract = [
  { path: '/', selectors: ['navbar', 'darkModeIcon', 'pageTitle'] },
];
