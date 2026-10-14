/* global document, ME_SETTINGS, __webpack_public_path__:writable */ // eslint-disable-line no-unused-vars -- webpack reads the assignment
// Enhanced behaviour (UI tier 2): progressive enhancement of upstream pages.
// Everything here is optional: the pages work without it, and each piece bails out when its markup is absent.
import initColumnPicker from './columnPicker.js';
import { initDocumentSave } from './documentPage.js';
import { initDocumentPopup } from './documentPopup.js';
import { initListFilter } from './listFilter.js';
import { initSigninPage } from './signinPage.js';
import {
  initCopy, initDeleteCollectionGate, initNumbers, initPagination, initQueryUi, initRanges,
} from './tablePage.js';

// Lazy chunks (the code editor) sit next to this file, whatever the base URL or proxy prefix in front of the app is.
if (document.currentScript?.src) __webpack_public_path__ = new URL('.', document.currentScript.src).href;

// Marks that the bundle ran, so CSS/tests can tell "enhanced script loaded" from "enhanced CSS only".
document.documentElement.dataset.meEnhancedReady = 'true';

const ready = (callback) => {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback);
  else callback();
};

ready(() => {
  initNumbers();
  initListFilter();
  initDocumentSave();
  initSigninPage();
  initDocumentPopup();
  initRanges();
  initCopy();
  initQueryUi();
  initDeleteCollectionGate();
  initColumnPicker({ db: ME_SETTINGS.dbName, collection: ME_SETTINGS.collectionName });
  // After upstream's jQuery-ready handlers, which render the paginator plugin into the same elements.
  setTimeout(initPagination, 0);
});
