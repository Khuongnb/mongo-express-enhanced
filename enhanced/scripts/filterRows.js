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

const readTypes = (form) => {
  try {
    return JSON.parse(form.dataset.meTypes || '{}');
  } catch {
    return {};
  }
};

// A key that matches a known field picks that field's type; anything else is a String. Own properties only: a key
// such as "constructor" must not find something on Object's prototype.
export const typeForKey = (types, key) => (Object.hasOwn(types, key) ? types[key] : 'S');

// Offers the known fields as suggestions on every Key input, new rows included (they are clones of the first).
const addKeySuggestions = (form, types) => {
  const paths = Object.keys(types);
  if (paths.length === 0) return;
  const list = document.createElement('datalist');
  list.id = 'meFilterKeys';
  list.replaceChildren(...paths.map((path) => Object.assign(document.createElement('option'), { value: path })));
  form.append(list);
  for (const input of form.querySelectorAll('input[name$="[k]"]')) input.setAttribute('list', list.id);
};

const clearRow = (row) => {
  const { key, op, value, type } = fields(row);
  delete row.dataset.typeChosen;
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

  const types = readTypes(form);
  addKeySuggestions(form, types);

  for (const row of list.children) {
    // A row that came back from the URL already has the type its author picked, or the one guessed for it.
    if (fields(row).key.value) row.dataset.typeChosen = 'true';
    syncRow(row);
  }

  list.addEventListener('change', (event) => {
    const row = event.target.closest('[data-me-filter-row]');
    if (!row) return;
    // Choosing a type by hand wins over the guess from then on, for this row.
    if (event.target.matches('[data-me-filter-type]')) row.dataset.typeChosen = 'true';
    syncRow(row);
  });

  list.addEventListener('input', (event) => {
    const row = event.target.closest('[data-me-filter-row]');
    if (!row || !event.target.matches('input[name$="[k]"]') || row.dataset.typeChosen) return;
    fields(row).type.value = typeForKey(types, event.target.value);
    syncRow(row);
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
