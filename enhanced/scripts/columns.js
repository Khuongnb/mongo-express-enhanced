// Pure logic for the column picker (no DOM), so it can be unit-tested. State is the list of HIDDEN column names: a column
// that appears later (documents on another page can have other fields) is then visible by default.

export const PINNED = '_id';

export const storageKey = (db, collection) => `mongo-express:hiddenColumns:${db}/${collection}`;
export const presetsKey = (db, collection) => `mongo-express:columnPresets:${db}/${collection}`;

export const parseJson = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// Keeps only names that are columns here, once each, and never the pinned one.
export const sanitizeHidden = (value, columns) => (Array.isArray(value)
  ? [...new Set(value.filter((name) => typeof name === 'string' && name !== PINNED && columns.includes(name)))]
  : []);

export const toggleColumn = (hidden, column) => (hidden.includes(column)
  ? hidden.filter((name) => name !== column)
  : [...hidden, column]);

export const hideAllColumns = (columns) => columns.filter((name) => name !== PINNED);

export const summarize = (columns, hidden) => {
  const shown = columns.length - hidden.length;
  return {
    total: columns.length,
    shown,
    hiddenNames: columns.filter((name) => hidden.includes(name)),
    isFiltered: hidden.length > 0,
    onlyPinned: columns.length > 1 && shown === 1 && columns.includes(PINNED) && !hidden.includes(PINNED),
  };
};

// Case-insensitive substring match, with the matched span so the UI can highlight it. An empty term matches everything.
export const matchColumns = (columns, term) => {
  const needle = term.trim().toLowerCase();
  return columns.flatMap((name) => {
    if (needle === '') return [{ name, start: -1, end: -1 }];
    const start = name.toLowerCase().indexOf(needle);
    return start === -1 ? [] : [{ name, start, end: start + needle.length }];
  });
};

export const sameSet = (left, right) => left.length === right.length && left.every((name) => right.includes(name));

const MAX_PRESETS = 12;
const MAX_NAME = 40;

// Presets store the hidden set by name; a preset with the same name is replaced. Blank names are ignored.
export const addPreset = (presets, name, hidden) => {
  const clean = name.trim().slice(0, MAX_NAME);
  if (clean === '') return presets;
  return [...presets.filter((preset) => preset.name !== clean), { name: clean, hidden: [...hidden] }].slice(-MAX_PRESETS);
};

export const sanitizePresets = (value, columns) => (Array.isArray(value)
  ? value
    .filter((preset) => preset && typeof preset.name === 'string' && preset.name.trim() !== '')
    .map((preset) => ({ name: preset.name.trim().slice(0, MAX_NAME), hidden: sanitizeHidden(preset.hidden, columns) }))
    .slice(0, MAX_PRESETS)
  : []);
