/* global document, ME_SETTINGS */
// Enhanced behaviour (UI tier 2): progressive enhancement of upstream pages.
// Everything here is optional: the pages work without it, and each piece bails out when its markup is absent.
import initColumnPicker from './columnPicker.js';
import { initListFilter } from './listFilter.js';
import {
  initCopy, initDeleteCollectionGate, initNumbers, initPagination, initQueryUi, initRanges,
} from './tablePage.js';

// Marks that the bundle ran, so CSS/tests can tell "enhanced script loaded" from "enhanced CSS only".
document.documentElement.dataset.meEnhancedReady = 'true';

const ready = (callback) => {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback);
  else callback();
};

ready(() => {
  initNumbers();
  initListFilter();
  initRanges();
  initCopy();
  initQueryUi();
  initDeleteCollectionGate();
  initColumnPicker({ db: ME_SETTINGS.dbName, collection: ME_SETTINGS.collectionName });
  // After upstream's jQuery-ready handlers, which render the paginator plugin into the same elements.
  setTimeout(initPagination, 0);
});
