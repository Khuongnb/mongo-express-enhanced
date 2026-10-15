// Pure logic of the "Recent queries" list of the collection page: reading the query a page was loaded with, the list's rules
// (10 recent, pins on top and not counted, a repeated query moves to the front) and the text shown for a query. No DOM and no
// storage, so all of it is unit-tested (test/enhanced/recentQueriesSpec.js); recentQueriesPanel.js does the DOM and storage.
//
// A query is one of:
//   { kind: 'simple',   rows: [{ k, op, t, v }], join: 'and' | 'or' }
//   { kind: 'advanced', query, projection, aggregate }
// Sort, page and rows per page are view settings, not part of the query: they are neither stored nor part of its identity.

export const MAX_RECENT = 10;
export const MAX_PINNED = 50;
// One query bigger than this is not remembered, so storage cannot fill up with a single pasted pipeline.
export const MAX_QUERY_SIZE = 50_000;
export const MAX_NAME = 60;
const MAX_ROWS = 10;

export const OPERATORS = {
  eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤',
};
const TYPES = new Set(['S', 'N', 'D', 'J', 'R', 'O', 'U']);

// ---- Reading a query out of an address -----------------------------------------------------------------------------------

const readRows = (params) => {
  const byIndex = new Map();
  for (const [name, value] of params) {
    const match = /^f\[(\d+)\]\[(k|op|t|v)\]$/.exec(name);
    if (match) byIndex.set(Number(match[1]), { ...byIndex.get(Number(match[1])), [match[2]]: value });
  }
  // The old key / op / type / value parameters still count as row 0, as they do on the server.
  const raw = byIndex.size > 0
    ? [...byIndex].sort(([left], [right]) => left - right).map(([, row]) => row)
    : [{
      k: params.get('key'), op: params.get('op'), t: params.get('type'), v: params.get('value'),
    }];
  const blank = new Set([undefined, null, '']);
  return raw
    .map((row) => ({
      k: row.k ?? '',
      op: blank.has(row.op) ? 'eq' : row.op,
      t: (blank.has(row.t) ? 'S' : row.t).toUpperCase(),
      v: row.v ?? '',
    }))
    // A row needs a key and a value to count, as it does on the server; one the server would refuse is not a query we can keep.
    .filter((row) => row.k !== '' && row.v !== '' && row.op in OPERATORS && TYPES.has(row.t))
    .slice(0, MAX_ROWS);
};

/**
 * The Simple or Advanced query a collection page was loaded with, or null when it was loaded with neither (a plain view, a sort or a
 * page change) or with a raw command, which is never remembered.
 */
export const parseQuery = (search) => {
  const params = new URLSearchParams(search);
  if ((params.get('command') ?? '') !== '') return null;
  const query = (params.get('query') ?? '').trim();
  const projection = (params.get('projection') ?? '').trim();
  if (query !== '' || projection !== '') {
    return {
      kind: 'advanced', query, projection, aggregate: params.get('runAggregate') === 'on',
    };
  }
  const rows = readRows(params);
  if (rows.length === 0) return null;
  return { kind: 'simple', rows, join: rows.length > 1 && params.get('join') === 'or' ? 'or' : 'and' };
};

/** Two queries with the same key are the same query. */
export const keyOf = (query) => JSON.stringify(query.kind === 'simple'
  ? ['s', query.join, query.rows.map((row) => [row.k, row.op, row.t, row.v])]
  : ['a', query.query, query.projection, query.aggregate]);

export const sizeOf = (query) => JSON.stringify(query).length;

// ---- Text ----------------------------------------------------------------------------------------------------------------

const oneLine = (text) => text.replaceAll(/\s+/g, ' ').trim();

/** The query as one line of text: `status = ACTIVE AND age > 5 (N)`, or the Advanced query with its projection and aggregate flag. */
export const summary = (query) => {
  if (query.kind === 'simple') {
    return query.rows
      .map((row) => `${row.k} ${OPERATORS[row.op]} ${row.v}${row.t === 'S' ? '' : ` (${row.t})`}`)
      .join(query.join === 'or' ? ' OR ' : ' AND ');
  }
  return [
    oneLine(query.query) || '(no filter)',
    query.projection ? `projection ${oneLine(query.projection)}` : '',
    query.aggregate ? 'aggregate' : '',
  ].filter(Boolean).join(' · ');
};

/** The whole query, line breaks kept, for the hover text of a cut-off one. */
export const fullText = (query) => {
  if (query.kind === 'simple') return summary(query);
  return [
    `Query${query.aggregate ? ' (aggregate)' : ''}:\n${query.query || '(none)'}`,
    query.projection ? `Projection:\n${query.projection}` : '',
  ].filter(Boolean).join('\n\n');
};

export const defaultName = (collection, random = Math.random()) => `${collection}-${random.toString(36).slice(2, 6).padEnd(4, '0')}`;

export const newId = (random = Math.random()) => random.toString(36).slice(2, 10).padEnd(8, '0');

// ---- The address of a query, to load it ----------------------------------------------------------------------------------

/** The collection page's address for `query`, keeping the sort the page has now and starting from the first page. */
export const queryHref = (query, { pathname, search }) => {
  const params = new URLSearchParams();
  const current = new URLSearchParams(search);
  for (const [name, value] of current) if (name.startsWith('sort[')) params.append(name, value);
  if (query.kind === 'simple') {
    for (const [index, row] of query.rows.entries()) {
      params.set(`f[${index}][k]`, row.k);
      params.set(`f[${index}][op]`, row.op);
      params.set(`f[${index}][t]`, row.t);
      params.set(`f[${index}][v]`, row.v);
    }
    if (query.rows.length > 1) params.set('join', query.join);
  } else {
    params.set('query', query.query);
    if (query.projection) params.set('projection', query.projection);
    if (query.aggregate) params.set('runAggregate', 'on');
  }
  return `${pathname}?${params}`;
};

// ---- The list ------------------------------------------------------------------------------------------------------------

export const emptyState = () => ({ pinned: [], recent: [] });

const isRow = (row) => row && typeof row === 'object' && ['k', 'op', 't', 'v'].every((field) => typeof row[field] === 'string')
  && row.op in OPERATORS && TYPES.has(row.t);

const isQuery = (query) => {
  if (!query || typeof query !== 'object') return false;
  if (query.kind === 'simple') return Array.isArray(query.rows) && query.rows.length > 0 && query.rows.every((row) => isRow(row)) && (query.join === 'and' || query.join === 'or');
  return query.kind === 'advanced' && typeof query.query === 'string' && typeof query.projection === 'string' && typeof query.aggregate === 'boolean';
};

const isItem = (item) => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string' && isQuery(item.q);

/** Whatever was in storage, as a list that obeys every rule: anything malformed, duplicated or over a limit is dropped. */
export const sanitizeState = (raw) => {
  const seen = new Set();
  const keep = (items, limit) => (Array.isArray(items) ? items : [])
    .filter((item) => isItem(item) && !seen.has(item.id) && !seen.has(keyOf(item.q)) && seen.add(item.id) && seen.add(keyOf(item.q)))
    .slice(0, limit);
  // pins first, so a query that is both pinned and recent stays pinned
  const pinned = keep(raw?.pinned, MAX_PINNED);
  const recent = keep(raw?.recent, MAX_RECENT);
  return { pinned, recent };
};

/**
 * The list after `query` ran successfully. A pinned query stays where it is (and gets no recent copy); a recent one moves to the front
 * with its name; a new one goes to the front, pushing the oldest out past ten. Returns the same list when the query is too big to keep.
 */
export const record = (state, query, { name, id = newId(), now = Date.now() }) => {
  if (sizeOf(query) > MAX_QUERY_SIZE) return state;
  const key = keyOf(query);
  if (state.pinned.some((item) => keyOf(item.q) === key)) return state;
  const existing = state.recent.find((item) => keyOf(item.q) === key);
  const item = existing ? { ...existing, at: now } : {
    id, name, q: query, at: now,
  };
  return { pinned: state.pinned, recent: [item, ...state.recent.filter((other) => other !== existing)].slice(0, MAX_RECENT) };
};

/** Pins a recent query (it leaves the ten, and the list refuses past 50 pins) or unpins a pinned one (it becomes the newest recent). */
export const togglePin = (state, id) => {
  const pinned = state.pinned.find((item) => item.id === id);
  if (pinned) {
    return {
      pinned: state.pinned.filter((item) => item !== pinned),
      recent: [pinned, ...state.recent].slice(0, MAX_RECENT),
    };
  }
  const recent = state.recent.find((item) => item.id === id);
  if (!recent || state.pinned.length >= MAX_PINNED) return state;
  return { pinned: [...state.pinned, recent], recent: state.recent.filter((item) => item !== recent) };
};

export const remove = (state, id) => ({
  pinned: state.pinned.filter((item) => item.id !== id),
  recent: state.recent.filter((item) => item.id !== id),
});

/** Renames a query; a blank name is ignored, a long one cut to the limit. */
export const rename = (state, id, name) => {
  const next = name.trim().slice(0, MAX_NAME);
  if (next === '') return state;
  const apply = (items) => items.map((item) => (item.id === id ? { ...item, name: next } : item));
  return { pinned: apply(state.pinned), recent: apply(state.recent) };
};

export const clearRecent = (state) => ({ pinned: state.pinned, recent: [] });
