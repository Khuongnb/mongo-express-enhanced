/* global document */
// The "Recent queries" list under the query forms of the collection page: remembers the Simple and Advanced queries that ran
// successfully, per collection, in this browser. The rules and the text live in recentQueries.js (pure, unit-tested); this builds
// the table, keeps the list in localStorage and records the query the page was loaded with.
//
// "Successfully" = the page was loaded with a Simple or Advanced query in its address and shows no error. A query the server refuses
// redirects back with an error banner (to the page that sent it, which can itself carry an earlier query), so the banner is what
// tells a refused query from a run one. A query that matches nothing is still a query that ran.
import {
  clearRecent, defaultName, emptyState, fullText, newId, parseQuery, queryHref, record, remove, rename, sanitizeState, summary, togglePin,
} from './recentQueries.js';

const storageKey = (db, collection) => `mongo-express:recentQueries:${db}/${collection}`;
const OPEN_KEY = 'mongo-express:recentQueriesOpen';

const load = (key) => {
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(key)));
  } catch {
    return emptyState();
  }
};

const save = (key, state) => {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage blocked or full: the list just does not persist
  }
};

const element = (tag, { className, text, attributes = {} } = {}, children = []) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
};

const icon = (name) => element('i', { className: `fas ${name}`, attributes: { 'aria-hidden': 'true' } });

const iconButton = ({ action, label, iconName, className = '' }) => element('button', {
  className: `btn btn-icon ${className}`.trim(),
  attributes: { type: 'button', 'data-me-rq': action, 'aria-label': label, title: label },
}, [icon(iconName)]);

const nameCell = (item) => element('td', { className: 'me-rq-name-cell' }, [
  element('span', { className: 'me-rq-name', text: item.name, attributes: { title: item.name } }),
  iconButton({
    action: 'rename', label: 'Rename', iconName: 'fa-pen', className: 'btn-xs me-rq-hover',
  }),
]);

const queryCell = (item) => element('td', { className: 'me-rq-query' }, [
  element('span', { className: `me-rq-kind is-${item.q.kind}`, text: item.q.kind === 'simple' ? 'Simple' : 'Advanced' }),
  element('span', { className: 'me-rq-text', text: summary(item.q), attributes: { title: fullText(item.q) } }),
]);

const row = (item, { index, pinned, href }) => {
  const pin = iconButton({
    action: 'pin', label: pinned ? 'Unpin' : 'Pin (keep it until removed)', iconName: 'fa-thumbtack', className: `me-rq-pin${pinned ? ' is-pinned' : ''}`,
  });
  pin.setAttribute('aria-pressed', String(pinned));
  return element('tr', { className: pinned ? 'is-pinned' : '', attributes: { 'data-id': item.id } }, [
    element('td', { className: 'me-rq-index is-num', text: pinned ? '' : String(index) }),
    element('td', { className: 'me-rq-pin-cell' }, [pin]),
    nameCell(item),
    queryCell(item),
    element('td', { className: 'me-rq-actions' }, [
      element('a', { className: 'btn btn-sm', text: 'Load', attributes: { href, 'data-me-rq': 'load' } }),
      iconButton({
        action: 'remove', label: 'Remove', iconName: 'fa-times', className: 'btn-xs me-rq-hover me-rq-x',
      }),
    ]),
  ]);
};

const header = () => element('thead', {}, [element('tr', {}, [
  element('th', { className: 'is-num', text: '#' }),
  element('th', { text: 'Pin' }),
  element('th', { text: 'Name' }),
  element('th', { text: 'Query' }),
  element('th', {}),
])]);

export default function initRecentQueries({ db, collection }) {
  const root = document.querySelector('[data-me-recent]');
  const body = root?.querySelector('[data-me-recent-body]');
  if (!root || !body) return;

  const key = storageKey(db, collection);
  const readableName = (() => {
    try {
      return decodeURIComponent(collection);
    } catch {
      return collection;
    }
  })();
  let state = load(key);

  // Read-modify-write against what is stored now, so a second tab's changes are not overwritten.
  const change = (update) => {
    state = update(load(key));
    save(key, state);
    render();
  };

  const loadable = (item) => queryHref(item.q, { pathname: globalThis.location.pathname, search: globalThis.location.search });

  function render() {
    const count = state.pinned.length + state.recent.length;
    root.querySelector('[data-me-recent-count]').textContent = String(count);
    body.replaceChildren();

    const clear = element('button', {
      className: 'btn btn-sm btn-ghost', text: 'Clear recent', attributes: { type: 'button', 'data-me-rq': 'clear' },
    });
    clear.disabled = state.recent.length === 0;
    body.append(element('div', { className: 'me-recent-head' }, [
      element('span', { className: 'me-recent-hint', text: 'The last 10 Simple and Advanced queries that ran, in this browser. Pin one to keep it.' }),
      clear,
    ]));

    if (count === 0) {
      body.append(element('p', { className: 'me-recent-empty', text: 'No recent queries yet. Run one and it shows up here.' }));
      return;
    }
    const rows = [
      ...state.pinned.map((item) => row(item, { pinned: true, href: loadable(item) })),
      ...state.recent.map((item, index) => row(item, { index: index + 1, pinned: false, href: loadable(item) })),
    ];
    body.append(element('div', { className: 'me-table-scroll' }, [
      element('table', { className: 'table me-recent-table' }, [header(), element('tbody', {}, rows)]),
    ]));
  }

  const startRename = (tr) => {
    const id = tr.dataset.id;
    const cell = tr.querySelector('.me-rq-name-cell');
    const current = tr.querySelector('.me-rq-name').textContent;
    const input = element('input', {
      className: 'form-control me-rq-name-input', attributes: { type: 'text', value: current, maxlength: '60', 'aria-label': 'Query name' },
    });
    cell.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      if (commit) change((latest) => rename(latest, id, input.value));
      else render();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  };

  body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-me-rq]');
    if (!button || button.dataset.meRq === 'load') return;
    const tr = button.closest('tr');
    switch (button.dataset.meRq) {
      case 'pin': {
        change((latest) => togglePin(latest, tr.dataset.id));
        break;
      }
      case 'remove': {
        change((latest) => remove(latest, tr.dataset.id));
        break;
      }
      case 'rename': {
        startRename(tr);
        break;
      }
      case 'clear': {
        change((latest) => clearRecent(latest));
        break;
      }
      default:
    }
  });

  // Remembered open or closed across pages; closed until it is opened.
  try {
    root.open = localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    root.open = false;
  }
  root.addEventListener('toggle', () => {
    try {
      localStorage.setItem(OPEN_KEY, root.open ? '1' : '0');
    } catch {
      // not remembered
    }
  });

  // The Raw tab runs commands, which are never remembered, so the list steps aside there.
  const syncWithTab = () => {
    root.hidden = document.querySelector('#my-tab-content .tab-pane.active')?.id === 'raw';
  };
  document.addEventListener('shown.bs.tab', syncWithTab);

  // The query this page was loaded with, if it ran without error.
  const query = parseQuery(globalThis.location.search);
  // The banner is a direct child of <main>; other `.alert-danger` elements live in the page's modals (the delete-collection warning).
  const failed = document.querySelector('.me-main > .alert-danger');
  if (query && !failed) {
    change((latest) => record(latest, query, { name: defaultName(readableName), id: newId() }));
    // Upstream shows the Advanced tab for a non-empty query; a projection on its own is an Advanced run too.
    const advancedTab = document.querySelector('#tabs a[href="#advanced"]');
    if (advancedTab && query.kind === 'advanced' && !document.querySelector('#advanced.active')) advancedTab.click();
  } else {
    render();
  }
  syncWithTab();
}
