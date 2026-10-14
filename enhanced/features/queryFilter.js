import { Binary } from 'mongodb';
import qs from 'qs';
import * as bson from '../../lib/bson.js';

/*
 * Multi-row Simple filter.
 *
 * Upstream's Simple query reads exactly one key/value/type triple and always matches by equality (_getQuery in
 * lib/routes/collection.js). This keeps that file untouched by translating the richer form into the one input upstream
 * already accepts: its String converter passes a non-string value straight through, so `key=$and, value=[clause, ...]`
 * comes out as `{ $and: [...] }`, and `key=age, value={ $gt: 5 }` as `{ age: { $gt: 5 } }`. Every route that filters (the
 * table, the count, the exports, delete-matching) goes through _getQuery, so they all see the same thing.
 *
 * URL shape:  f[0][k]=key  f[0][op]=gt  f[0][t]=N  f[0][v]=5  ...  join=and|or
 * The old key / op / type / value parameters still work and count as row 0.
 */

export const MAX_ROWS = 10;

export const OPERATORS = {
  eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤',
};
const ORDERING = new Set(['gt', 'gte', 'lt', 'lte']);
const TYPES = new Set(['S', 'N', 'D', 'J', 'R', 'O', 'U']);

class FilterError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'FilterError';
  }
}

const uuid = (value) => new Binary(Buffer.from(value.replaceAll('-', ''), 'hex'), Binary.SUBTYPE_UUID);

// Same behaviour as upstream's String converter: a value that looks like an ObjectId, a UUID or a boolean matches both
// the text and the typed value, so nobody has to pick the type for the common cases.
const smartString = (value) => {
  if (/^[\da-f]{24}$/i.test(value)) return { $in: [value, bson.parseObjectId(value)] };
  if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)) return { $in: [value, uuid(value)] };
  if (value.toLowerCase() === 'true') return { $in: [value, true] };
  if (value.toLowerCase() === 'false') return { $in: [value, false] };
  return value;
};

const convert = ({ t, v, op }) => {
  switch (t) {
    case 'J': {
      return JSON.parse(v);
    }
    case 'N': {
      return Number(v);
    }
    case 'O': {
      // Anything that is not a 24-character id goes to the shell-syntax parser, which answers an empty value for text it cannot read.
      const id = bson.parseObjectId(v);
      if (id === undefined || id === '') throw new FilterError(`"${v}" is not an ObjectId`);
      return id;
    }
    case 'U': {
      return uuid(v);
    }
    case 'D': {
      const date = new Date(v);
      if (Number.isNaN(date.getTime())) throw new FilterError(`"${v}" is not a date (try 2026-10-14 or 2026-10-14T06:30:00Z)`);
      return date;
    }
    case 'R': {
      if (ORDERING.has(op)) throw new FilterError('a regular expression can only be used with = or ≠');
      return new RegExp(v, 'i');
    }
    default: {
      // Comparing text with < or > is plain string order, so the "also match as ObjectId / boolean" guess does not apply.
      return ORDERING.has(op) ? v : smartString(v);
    }
  }
};

const toClause = (row) => {
  const { k, op, t } = row;
  const value = convert(row);
  if (op === 'eq') return { [k]: value };
  if (op === 'ne') {
    if (value instanceof RegExp) return { [k]: { $not: value } };
    if (t === 'S' && value?.$in) return { [k]: { $nin: value.$in } };
    return { [k]: { $ne: value } };
  }
  return { [k]: { [`$${op}`]: value } };
};

const text = (value) => {
  if (typeof value === 'string') return value;
  return value === undefined ? '' : JSON.stringify(value);
};

const indexed = (f) => {
  if (Array.isArray(f)) return f;
  // qs hands back an object once an index passes its array limit; keep the order the form had.
  if (f && typeof f === 'object' && Object.keys(f).every((i) => /^\d+$/.test(i))) {
    return Object.keys(f).sort((a, b) => a - b).map((i) => f[i]);
  }
  throw new FilterError('the filter parameters are malformed');
};

const normalize = (raw, position) => {
  if (!raw || typeof raw !== 'object') throw new FilterError(`filter ${position + 1} is malformed`);
  const op = raw.op === undefined || raw.op === '' ? 'eq' : raw.op;
  if (!(op in OPERATORS)) throw new FilterError(`filter ${position + 1} has an unknown operator "${text(op)}"`);
  const t = (raw.t === undefined || raw.t === '' ? 'S' : String(raw.t)).toUpperCase();
  if (!TYPES.has(t)) throw new FilterError(`filter ${position + 1} has an unknown type "${text(raw.t)}"`);
  return {
    k: text(raw.k), op, t, v: text(raw.v),
  };
};

const readRows = (query) => {
  let raw;
  if (query.f === undefined) {
    if (!query.key) return [];
    raw = [{
      k: query.key, op: query.op, t: query.type, v: query.value,
    }];
  } else {
    raw = indexed(query.f);
  }
  if (raw.length > MAX_ROWS) throw new FilterError(`at most ${MAX_ROWS} filters are supported`);
  // A row needs a key and a value to count, as upstream's `key && value` does.
  return raw.map(normalize).filter((row) => row.k !== '' && row.v !== '');
};

const failType = (message) => ({
  // Upstream rejects any type it does not know with `Invalid query type: <type.toUpperCase()>`, shown as the page's error
  // and, on delete/export, aborting the action. Returning the message from there keeps its case and, more importantly,
  // fails closed: dropping the filter instead would turn "delete matching" into "delete everything".
  toUpperCase: () => message,
});

const summarize = (rows, join) => rows
  .map((row) => `${row.k} ${OPERATORS[row.op]} ${row.v}`)
  .join(join === 'or' ? ' OR ' : ' AND ');

const equivalentQuery = (clause) => {
  try {
    return bson.toString(clause);
  } catch {
    return '';
  }
};

/**
 * Reads the filter out of a parsed query string.
 * Returns { rows, join, override, error, clause }:
 *   - rows      the rows that count (key and value both present)
 *   - override  what upstream should see instead of the request's own key/value/type, or null to leave it alone
 *   - error     set when the filter cannot be built; override is then the fail-closed input
 *   - clause    the Mongo filter these rows mean, when it could be built
 */
export const buildFilter = (query) => {
  let rows = [];
  const join = query.join === 'or' ? 'or' : 'and';
  try {
    rows = readRows(query);
  } catch (error) {
    if (!(error instanceof FilterError)) throw error;
    return {
      rows, join, clause: null, error: error.message, override: { key: 'x', value: 'x', type: failType(`Filter: ${error.message}`) },
    };
  }
  if (rows.length === 0) return { rows, join, clause: null, error: null, override: null };

  // Plain equality on a single row is what upstream already does, so it keeps doing it (and reporting its own errors).
  const single = rows.length === 1;
  const plain = single && rows[0].op === 'eq' && rows[0].t !== 'D';
  let clause = null;
  try {
    const clauses = rows.map((row, i) => {
      try {
        return toClause(row);
      } catch (error) {
        throw new FilterError(`filter ${i + 1}: ${error.message}`);
      }
    });
    clause = single ? clauses[0] : { [`$${join}`]: clauses };
  } catch (error) {
    if (!(error instanceof FilterError)) throw error;
    if (!plain) {
      return {
        rows, join, clause: null, error: error.message, override: { key: 'x', value: 'x', type: failType(`Filter: ${error.message}`) },
      };
    }
  }

  if (plain) {
    // The old parameters already mean exactly this to upstream (including value[a]=b passing through as an object).
    if (query.f === undefined) return { rows, join, clause, error: null, override: null };
    const [{ k, t, v }] = rows;
    return {
      rows, join, clause, error: null, override: { key: k, value: v, type: t },
    };
  }
  const override = single
    ? { key: rows[0].k, value: clause[rows[0].k], type: 'S' }
    : { key: `$${join}`, value: clause[`$${join}`], type: 'S' };
  return {
    rows, join, clause, error: null, override,
  };
};

const filterLocals = ({ rows, join, clause }) => ({
  rows,
  join,
  // At least one row for the form to show, so an unfiltered page still has somewhere to type.
  formRows: rows.length > 0 ? rows : [{
    k: '', op: 'eq', t: 'S', v: '',
  }],
  // For the "key = value" chip when there is just the one row.
  single: rows.length === 1 ? { ...rows[0], sym: OPERATORS[rows[0].op] } : null,
  // Appended to every link that must keep the filter: delete-matching, exports, the per-document form.
  qs: rows.length === 0 ? '' : qs.stringify({ f: rows, ...(rows.length > 1 && { join }) }),
  max: MAX_ROWS,
  summary: summarize(rows, join),
  queryText: clause ? equivalentQuery(clause) : '',
});

// Parameters the rewrite replaces; everything else (skip, sort, projection, ...) is passed on as it came.
const CONSUMED = new Set(['f', 'join', 'op']);

const filterMiddleware = (req, res, next) => {
  const { query } = req;
  if (query.f === undefined && !query.key) {
    res.locals.meFilter = filterLocals({ rows: [], join: 'and', clause: null });
    return next();
  }

  const filter = buildFilter(query);
  res.locals.meFilter = filterLocals(filter);
  if (filter.override) {
    const rest = Object.fromEntries(Object.entries(query).filter(([name]) => !CONSUMED.has(name)));
    // Express re-parses req.query on every read, so the replacement has to be an own property of the request.
    Object.defineProperty(req, 'query', {
      value: { ...rest, ...filter.override }, writable: true, configurable: true, enumerable: true,
    });
  }
  return next();
};

export default function queryFilter() {
  return filterMiddleware;
}
