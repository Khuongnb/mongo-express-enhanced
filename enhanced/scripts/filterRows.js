/* global document */
// The Simple query's filter rows: add / remove a row, keep the f[i][...] names gap-free, and stop offering combinations
// the server rejects (a regular expression has no order, so it cannot be used with > or <).
import { copyText } from './clipboard.js';

const ORDERING = new Set(['gt', 'gte', 'lt', 'lte']);

const fields = (row) => ({
  key: row.querySelector('input[name$="[k]"]'),
  op: row.querySelector('[data-me-filter-op]'),
  value: row.querySelector('input[name$="[v]"]'),
  type: row.querySelector('[data-me-filter-type]'),
});

const renumber = (form) => {
  const rows = [...form.querySelectorAll('[data-me-filter-row]')];
  for (const [index, row] of rows.entries()) {
    for (const field of row.querySelectorAll('[name^="f["]')) {
      field.name = `f[${index}]${field.name.slice(field.name.indexOf(']') + 1)}`;
    }
  }
  form.dataset.rows = String(rows.length);
};

// Options the other control rules out are disabled, so the row can never be submitted in a state the server refuses.
const syncRow = (row) => {
  const { op, type } = fields(row);
  const regex = type.value === 'R';
  for (const option of op.options) option.disabled = regex && ORDERING.has(option.value);
  for (const option of type.options) option.disabled = option.value === 'R' && ORDERING.has(op.value);
};

const flash = (button, message) => {
  const original = [...button.childNodes];
  const icon = document.createElement('i');
  icon.className = 'fas fa-check';
  icon.setAttribute('aria-hidden', 'true');
  button.replaceChildren(icon, document.createTextNode(message));
  setTimeout(() => button.replaceChildren(...original), 1200);
};

const clearRow = (row) => {
  const { key, op, value, type } = fields(row);
  key.value = '';
  value.value = '';
  op.value = 'eq';
  type.value = 'S';
  syncRow(row);
};

export const initFilterRows = () => {
  const form = document.querySelector('[data-me-filter-form]');
  if (!form) return;
  const list = form.querySelector('[data-me-filter-rows]');
  const MAX_ROWS = Number(form.dataset.maxRows) || 10;

  const addButton = form.querySelector('[data-me-filter-add]');
  const syncAdd = () => { addButton.disabled = list.children.length >= MAX_ROWS; };

  for (const row of list.children) syncRow(row);

  list.addEventListener('change', (event) => {
    const row = event.target.closest('[data-me-filter-row]');
    if (row) syncRow(row);
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-me-filter-remove]');
    if (!button) return;
    const row = button.closest('[data-me-filter-row]');
    // The last row stays, emptied: the form always has somewhere to type.
    if (list.children.length === 1) clearRow(row);
    else row.remove();
    renumber(form);
    syncAdd();
  });

  addButton.addEventListener('click', () => {
    if (list.children.length >= MAX_ROWS) return;
    const row = list.firstElementChild.cloneNode(true);
    // The first row carries upstream's #key / #value ids; a copy must not repeat them.
    for (const element of row.querySelectorAll('[id]')) element.removeAttribute('id');
    clearRow(row);
    list.append(row);
    renumber(form);
    syncAdd();
    fields(row).key.focus();
  });

  for (const button of form.querySelectorAll('[data-me-copy-query]')) {
    button.addEventListener('click', async () => {
      if (await copyText(button.dataset.meCopyQuery)) flash(button, 'Copied');
    });
  }

  syncAdd();
};
