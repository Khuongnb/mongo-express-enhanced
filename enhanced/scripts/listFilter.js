/* global document */
import { formatNumber } from './paging.js';

/** Case-insensitive substring match; an empty query matches everything. */
export const matchesFilter = (name, query) => {
  const needle = String(query ?? '').trim().toLowerCase();
  return needle === '' || String(name).toLowerCase().includes(needle);
};

// Frontend-only filter over the rows of a list page (databases, collections): hides rows, shows a count and the empty state.
export const initListFilter = () => {
  const input = document.querySelector('[data-me-filter]');
  if (!input) return;
  const items = [...document.querySelectorAll('[data-me-filter-item]')];
  const count = document.querySelector('[data-me-filter-count]');
  const empty = document.querySelector('[data-me-filter-empty]');

  const apply = () => {
    const query = input.value;
    let shown = 0;
    for (const item of items) {
      const match = matchesFilter(item.dataset.name, query);
      item.hidden = !match;
      if (match) shown += 1;
    }
    if (count) {
      count.hidden = query.trim() === '';
      count.textContent = `${formatNumber(shown)} of ${formatNumber(items.length)}`;
    }
    if (empty && items.length > 0) empty.hidden = shown > 0;
  };

  input.addEventListener('input', apply);
  apply();
};
