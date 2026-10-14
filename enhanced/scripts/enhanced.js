/* global document */
// Enhanced behaviour (UI tier 2): progressive enhancement of upstream pages.
// Import selectors from ../selectors.js instead of scattering strings, so the contract test covers them.

// Marks that the bundle ran, so CSS/tests can tell "enhanced script loaded" from "enhanced CSS only".
document.documentElement.dataset.meEnhancedReady = 'true';
