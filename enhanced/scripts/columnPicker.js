/* global document, CSS */
/* eslint-disable unicorn/no-unsafe-dom-html -- every interpolated value is a number or goes through escapeHtml */
// The "Columns" control: show or hide table columns. Browser-only, nothing is sent to the server; the choice is remembered
// per database/collection in localStorage. Logic that needs no DOM lives in columns.js (unit-tested).
import {
  PINNED, addPreset, matchColumns, parseJson, presetsKey, removePreset, sameSet, sanitizeHidden, sanitizePresets,
  storageKey, summarize, toggleColumn,
} from './columns.js';

const escapeHtml = (text) => String(text)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const TYPE_BY_CLASS = [
  ['v-oid', 'ObjectId'], ['v-date', 'Date'], ['v-num', 'Number'], ['v-bool', 'Boolean'], ['v-str', 'String'],
  ['v-url', 'String'], ['tooDamnBig', 'Large'],
];

// The type of a column, read from how the server rendered its first non-null cell.
const columnType = (table, name) => {
  for (const cell of table.querySelectorAll(`:scope tbody td[data-column="${CSS.escape(name)}"] .tableContent`)) {
    if (cell.querySelector(':scope pre')) return 'Object';
    const found = TYPE_BY_CLASS.find(([className]) => cell.querySelector(`:scope .${className}`));
    if (found) return found[1];
  }
  return '';
};

const read = (key, fallback) => {
  try {
    return parseJson(localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked or full: the choice just does not persist
  }
};

export default function initColumnPicker({ db, collection }) {
  const trigger = document.querySelector('#columnPicker');
  const panel = document.querySelector('#columnPickerPanel');
  const table = document.querySelector('table.table-documents');
  if (!trigger || !panel || !table) return;

  const strip = document.querySelector('[data-me-hidden-strip]');
  const allHidden = document.querySelector('[data-me-all-hidden]');
  const hiddenKey = storageKey(db, collection);
  const savedPresetsKey = presetsKey(db, collection);

  // Current order: upstream's drag-and-drop reordering moves header cells around.
  const columns = () => [...table.querySelectorAll(':scope thead th[data-column]')].map((th) => th.dataset.column);

  let hidden = sanitizeHidden(read(hiddenKey, []), columns());
  let presets = sanitizePresets(read(savedPresetsKey, []), columns());
  let term = '';
  let saving = false;

  const apply = () => {
    for (const element of table.querySelectorAll(':scope [data-column]')) {
      element.classList.toggle('column-hidden', hidden.includes(element.dataset.column));
    }
  };

  const renderTrigger = (summary) => {
    trigger.classList.toggle('is-filtered', summary.isFiltered);
    const count = summary.isFiltered
      ? `<span class="badge badge-lime"><span class="visually-hidden">showing </span>${summary.shown}/${summary.total}</span>`
      : `<span class="me-count">${summary.shown}/${summary.total}</span>`;
    trigger.innerHTML = `<i class="fas ${summary.isFiltered ? 'fa-filter' : 'fa-columns'}" aria-hidden="true"></i>Columns ${count}`
      + '<i class="fas fa-chevron-down" aria-hidden="true"></i>';
  };

  const renderStrip = (summary) => {
    if (strip) {
      strip.hidden = !summary.isFiltered || summary.onlyPinned;
      strip.innerHTML = `<i class="fas fa-eye-slash" aria-hidden="true"></i><span><strong>${summary.hiddenNames.length} of ${summary.total}</strong> columns hidden</span>`
        + `<span class="me-hidden-names">${escapeHtml(summary.hiddenNames.join(', '))}</span><span>·</span>`
        + '<button type="button" class="btn btn-link" data-me-show-all>Show all</button>';
    }
    if (allHidden) allHidden.hidden = !summary.onlyPinned;
  };

  // A sorted column that is hidden still sorts the rows; say so on its chip.
  const renderSortChips = () => {
    for (const chip of document.querySelectorAll('[data-me-sort-chip]')) {
      const isHidden = hidden.includes(chip.dataset.meSortChip);
      chip.classList.toggle('is-hidden-col', isHidden);
      const flag = chip.querySelector(':scope .me-chip-flag');
      if (isHidden && !flag) {
        chip.querySelector(':scope [data-me-clear-sort]')?.insertAdjacentHTML('beforebegin',
          '<span class="me-chip-flag"><i class="fas fa-eye-slash" aria-hidden="true"></i>hidden</span>');
      } else if (!isHidden && flag) {
        flag.remove();
      }
    }
  };

  const renderCounts = () => {
    const summary = summarize(columns(), hidden);
    renderTrigger(summary);
    renderStrip(summary);
    renderSortChips();
    const count = panel.querySelector(':scope .me-picker-count');
    if (count) count.textContent = `${summary.shown} of ${summary.total} shown`;
    return summary;
  };

  const commit = () => {
    write(hiddenKey, hidden);
    apply();
    renderCounts();
    renderPresets();
  };

  const renderList = () => {
    const list = panel.querySelector(':scope .me-picker-list');
    if (!list) return;
    const matches = matchColumns(columns(), term);
    list.innerHTML = matches.map(({ name, start, end }) => {
      const label = start === -1
        ? escapeHtml(name)
        : `${escapeHtml(name.slice(0, start))}<mark>${escapeHtml(name.slice(start, end))}</mark>${escapeHtml(name.slice(end))}`;
      const pinned = name === PINNED;
      const off = hidden.includes(name);
      return `<li><label class="me-picker-row${pinned ? ' is-pinned' : ''}${off ? ' is-off' : ''}">`
        + `<input type="checkbox" class="form-check-input" data-column="${escapeHtml(name)}"${off ? '' : ' checked'}${pinned ? ' disabled' : ''}>`
        + `<span class="me-col-name">${label}</span><span class="me-col-type">${escapeHtml(columnType(table, name))}</span>`
        + `${pinned ? '<i class="fas fa-lock" aria-hidden="true"></i><span class="visually-hidden">Always shown</span>' : ''}</label></li>`;
    }).join('');
    const empty = panel.querySelector(':scope .me-picker-empty');
    if (empty) {
      empty.hidden = matches.length > 0;
      empty.innerHTML = `No column matches <code>${escapeHtml(term.trim())}</code>.`;
    }
    const matching = matches.filter(({ name }) => name !== PINNED).length;
    const suffix = term.trim() === '' ? '' : ` ${matching} matching`;
    panel.querySelector(':scope [data-act="show-all"]').textContent = term.trim() === '' ? 'Show all' : `Show${suffix}`;
    panel.querySelector(':scope [data-act="hide-all"]').textContent = term.trim() === '' ? 'Hide all' : `Hide${suffix}`;
  };

  function renderPresets() {
    const holder = panel.querySelector(':scope .me-picker-presets');
    if (!holder) return;
    const total = columns().length;
    holder.innerHTML = `<span class="me-eyebrow">Presets for ${escapeHtml(collection)}</span><div class="me-preset-list">`
      + presets.map((preset, index) => {
        const active = sameSet(preset.hidden, hidden);
        return '<span class="me-preset-chip">'
          + `<button type="button" class="me-preset${active ? ' active' : ''}" data-preset="${index}" aria-pressed="${active}">`
          + `${active ? '<i class="fas fa-check" aria-hidden="true"></i>' : ''}${escapeHtml(preset.name)} <span class="me-preset-n">${total - preset.hidden.length}</span></button>`
          // a sibling, not a child: a button cannot contain a button
          + `<button type="button" class="me-preset-x" data-act="delete-preset" data-index="${index}" aria-label="Delete preset ${escapeHtml(preset.name)}" title="Delete preset"><i class="fas fa-times" aria-hidden="true"></i></button></span>`;
      }).join('')
      + '<button type="button" class="me-preset" data-act="save-open"><i class="fas fa-plus" aria-hidden="true"></i>Save current</button></div>'
      + (saving
        ? '<div class="me-preset-save"><input class="form-control" maxlength="40" placeholder="Preset name" aria-label="Preset name">'
          + '<button type="button" class="btn btn-sm btn-primary" data-act="save">Save</button></div>'
        : '');
    if (saving) holder.querySelector(':scope input')?.focus();
  }

  const renderPanel = () => {
    panel.innerHTML = '<div class="me-picker-head"><span class="me-picker-title" id="cpTitle">Columns</span><span class="me-picker-count"></span>'
      + '<span class="me-spacer"></span><button type="button" class="btn btn-icon btn-xs" data-act="close" aria-label="Close"><i class="fas fa-times" aria-hidden="true"></i></button></div>'
      + '<div class="me-picker-actions"><button type="button" class="btn btn-ghost" data-act="show-all">Show all</button>'
      + '<button type="button" class="btn btn-ghost" data-act="hide-all">Hide all</button><span class="me-spacer"></span>'
      + '<button type="button" class="btn btn-ghost" data-act="reset"><i class="fas fa-undo" aria-hidden="true"></i>Reset</button></div>'
      + `<div class="me-picker-search"><i class="fas fa-search" aria-hidden="true"></i><input class="form-control" value="${escapeHtml(term)}" placeholder="Filter ${columns().length} columns" aria-label="Filter columns"></div>`
      + '<ul class="me-picker-list" aria-live="polite"></ul><div class="me-picker-empty" hidden></div><div class="me-picker-presets"></div>';
    panel.setAttribute('aria-labelledby', 'cpTitle');
    renderList();
    renderPresets();
    renderCounts();
  };

  const isOpen = () => panel.classList.contains('show');

  const open = () => {
    renderPanel();
    panel.classList.add('show');
    trigger.setAttribute('aria-expanded', 'true');
    panel.querySelector(':scope .me-picker-search input')?.focus();
  };

  const close = ({ restoreFocus = false } = {}) => {
    panel.classList.remove('show');
    trigger.setAttribute('aria-expanded', 'false');
    saving = false;
    if (restoreFocus) trigger.focus();
  };

  const matchingNames = () => matchColumns(columns(), term).map(({ name }) => name).filter((name) => name !== PINNED);

  const actions = {
    close: () => close({ restoreFocus: true }),
    'show-all': () => {
      const names = new Set(matchingNames());
      hidden = hidden.filter((name) => !names.has(name));
      commit();
      renderList();
    },
    'hide-all': () => {
      hidden = sanitizeHidden([...hidden, ...matchingNames()], columns());
      commit();
      renderList();
    },
    reset: () => {
      hidden = [];
      term = '';
      commit();
      const input = panel.querySelector(':scope .me-picker-search input');
      if (input) input.value = '';
      renderList();
    },
    'save-open': () => {
      saving = true;
      renderPresets();
    },
    'delete-preset': (button) => {
      presets = removePreset(presets, Number(button.dataset.index));
      write(savedPresetsKey, presets);
      renderPresets();
    },
    save: () => {
      presets = addPreset(presets, panel.querySelector(':scope .me-preset-save input')?.value ?? '', hidden);
      write(savedPresetsKey, presets);
      saving = false;
      renderPresets();
    },
  };

  trigger.addEventListener('click', () => (isOpen() ? close() : open()));

  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act], [data-preset]');
    if (!button) return;
    if (button.dataset.preset !== undefined) {
      hidden = sanitizeHidden(presets[Number(button.dataset.preset)]?.hidden, columns());
      commit();
      renderList();
      return;
    }
    actions[button.dataset.act]?.(button);
  });

  panel.addEventListener('change', (event) => {
    const box = event.target.closest('input[type="checkbox"][data-column]');
    if (!box) return;
    hidden = sanitizeHidden(toggleColumn(hidden, box.dataset.column), columns());
    box.closest('.me-picker-row').classList.toggle('is-off', hidden.includes(box.dataset.column));
    commit();
  });

  panel.addEventListener('input', (event) => {
    if (!event.target.closest('.me-picker-search')) return;
    term = event.target.value;
    renderList();
  });

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close({ restoreFocus: true });
    } else if (event.key === 'Enter' && event.target.closest('.me-preset-save')) {
      event.preventDefault();
      actions.save();
    }
  });

  document.addEventListener('click', (event) => {
    // The trigger and the panel rewrite their own children while handling this very click (the counts, the list), so by the time
    // this listener runs `event.target` may be a detached node that `contains()` no longer finds. The event path was fixed at dispatch.
    const path = event.composedPath();
    if (isOpen() && !path.includes(panel) && !path.includes(trigger)) close();
    if (event.target.closest('[data-me-open-picker]')) open();
    if (event.target.closest('[data-me-show-all]')) {
      hidden = [];
      commit();
      if (isOpen()) renderList();
    }
  });

  apply();
  renderCounts();
}
