import { expect } from 'chai';

import {
  clearRecent, defaultName, emptyState, fullText, keyOf, MAX_NAME, MAX_PINNED, MAX_QUERY_SIZE, MAX_RECENT, newId, parseQuery,
  queryHref, record, remove, rename, sanitizeState, summary, togglePin,
} from '../../enhanced/scripts/recentQueries.js';

const row = (k, v, extra = {}) => ({
  k, op: 'eq', t: 'S', v, ...extra,
});
const simple = (...rows) => ({ kind: 'simple', rows, join: 'and' });
const advanced = (query, projection = '', aggregate = false) => ({
  kind: 'advanced', query, projection, aggregate,
});

// Records `count` distinct simple queries, oldest first, and returns the list.
const fill = (count, state = emptyState()) => {
  let next = state;
  for (let index = 0; index < count; index++) next = record(next, simple(row('n', String(index))), { name: `q${index}`, id: `id${index}` });
  return next;
};
const names = (items) => items.map((item) => item.name);

describe('recent queries: reading the query a page was loaded with', () => {
  it('reads a multi-row Simple query with its join', () => {
    const q = parseQuery('?f[0][k]=age&f[0][op]=gt&f[0][t]=N&f[0][v]=5&f[1][k]=name&f[1][op]=eq&f[1][t]=S&f[1][v]=ann&join=or&skip=50&sort[age]=1');
    expect(q).to.deep.equal({
      kind: 'simple', join: 'or', rows: [row('age', '5', { op: 'gt', t: 'N' }), row('name', 'ann')],
    });
  });

  it('reads rows in index order, and defaults a missing operator and type', () => {
    const q = parseQuery('?f[1][k]=b&f[1][v]=2&f[0][k]=a&f[0][v]=1');
    expect(q.rows).to.deep.equal([row('a', '1'), row('b', '2')]);
  });

  it('keeps "and" for a single row, whatever join says', () => {
    expect(parseQuery('?f[0][k]=a&f[0][v]=1&join=or').join).to.equal('and');
  });

  it('reads the old key / op / type / value parameters as one row', () => {
    expect(parseQuery('?key=age&op=gte&type=n&value=3')).to.deep.equal(simple(row('age', '3', { op: 'gte', t: 'N' })));
  });

  it('ignores rows without a key or a value, as the server does, and rows it would refuse', () => {
    expect(parseQuery('?f[0][k]=&f[0][v]=&f[0][op]=eq&f[0][t]=S')).to.equal(null);
    expect(parseQuery('?f[0][k]=a&f[0][v]=')).to.equal(null);
    expect(parseQuery('?f[0][k]=a&f[0][v]=1&f[0][op]=like')).to.equal(null);
    expect(parseQuery('?f[0][k]=a&f[0][v]=1&f[0][t]=Z')).to.equal(null);
    expect(parseQuery('?f[0][k]=a&f[0][v]=1&f[1][k]=b&f[1][v]=2&f[1][op]=like').rows).to.deep.equal([row('a', '1')]);
  });

  it('reads an Advanced query, a projection on its own, and the aggregate flag', () => {
    expect(parseQuery('?query=%7B%20a%3A%201%20%7D')).to.deep.equal(advanced('{ a: 1 }'));
    expect(parseQuery('?query=%5B%5D&runAggregate=on')).to.deep.equal(advanced('[]', '', true));
    expect(parseQuery('?query=&projection=%7B%20a%3A%201%20%7D')).to.deep.equal(advanced('', '{ a: 1 }'));
    expect(parseQuery('?query=%20%7B%7D%20&projection=')).to.deep.equal(advanced('{}'));
  });

  it('is nothing for a plain view, a sort, a page change or a raw command', () => {
    for (const search of ['', '?', '?skip=50', '?sort[a]=1&skip=10', '?query=&projection=', '?runAggregate=on',
      '?command=db.x.drop()', '?command=updateOne()&query={}']) expect(parseQuery(search), search).to.equal(null);
  });

  it('gives the same key to the same query however the page was reached, and a different one when anything differs', () => {
    const a = parseQuery('?f[0][k]=a&f[0][v]=1&skip=20&sort[a]=-1&limit=100');
    const b = parseQuery('?f[0][v]=1&f[0][k]=a&f[0][op]=eq&f[0][t]=S');
    expect(keyOf(a)).to.equal(keyOf(b));
    expect(keyOf(a)).to.not.equal(keyOf(parseQuery('?f[0][k]=a&f[0][v]=1&f[0][t]=N')));
    expect(keyOf(a)).to.not.equal(keyOf(parseQuery('?f[0][k]=a&f[0][v]=2')));
    expect(keyOf(advanced('{}'))).to.not.equal(keyOf(advanced('{}', '', true)));
    expect(keyOf(advanced('{}'))).to.not.equal(keyOf(advanced('{}', '{a:1}')));
    expect(keyOf(simple(row('a', '1')))).to.not.equal(keyOf(advanced('a')));
    // All and Any are different queries once there are two rows
    const two = [row('a', '1'), row('b', '2')];
    expect(keyOf({ kind: 'simple', rows: two, join: 'and' })).to.not.equal(keyOf({ kind: 'simple', rows: two, join: 'or' }));
  });
});

describe('recent queries: the text shown for a query', () => {
  it('writes a Simple query as rows joined by AND or OR, with the type unless it is a string', () => {
    const rows = [row('status', 'ACTIVE'), row('age', '5', { op: 'gte', t: 'N' }), row('seen', '2026-01-01', { op: 'ne', t: 'D' })];
    expect(summary({ kind: 'simple', rows, join: 'and' })).to.equal('status = ACTIVE AND age ≥ 5 (N) AND seen ≠ 2026-01-01 (D)');
    expect(summary({ kind: 'simple', rows: rows.slice(0, 2), join: 'or' })).to.equal('status = ACTIVE OR age ≥ 5 (N)');
  });

  it('writes an Advanced query on one line, with its projection and aggregate flag', () => {
    expect(summary(advanced('{\n  a: 1,\n  b: 2\n}'))).to.equal('{ a: 1, b: 2 }');
    expect(summary(advanced('[{ $match: {} }]', '{ a: 1 }', true))).to.equal('[{ $match: {} }] · projection { a: 1 } · aggregate');
    expect(summary(advanced('', '{ a: 1 }'))).to.equal('(no filter) · projection { a: 1 }');
  });

  it('keeps the line breaks in the full text, for the hover', () => {
    expect(fullText(advanced('{\n a: 1\n}', '{ a: 1 }', true))).to.equal('Query (aggregate):\n{\n a: 1\n}\n\nProjection:\n{ a: 1 }');
    expect(fullText(simple(row('a', '1')))).to.equal('a = 1');
  });

  it('names a query after its collection with a short random suffix, and gives ids of a fixed length', () => {
    expect(defaultName('channels', 0.123456789)).to.match(/^channels-[\da-z]{4}$/);
    expect(defaultName('channels', 0)).to.equal('channels-0000');
    expect(newId(0.5)).to.have.length(8);
    expect(newId(0.5)).to.not.equal(newId(0.25));
  });
});

describe('recent queries: loading one', () => {
  const where = { pathname: '/db/x/c', search: '?sort[age]=-1&skip=40&limit=100&f[0][k]=old&f[0][v]=1' };

  it('keeps the sort of the page, drops the page and the old query, and reads back as the same query', () => {
    for (const q of [
      simple(row('a', '1')),
      { kind: 'simple', join: 'or', rows: [row('a', '1'), row('b', '2', { op: 'lt', t: 'N' })] },
      advanced('{ a: 1 }'), advanced('[{ $match: {} }]', '{ a: 1 }', true), advanced('', '{ a: 1 }'),
    ]) {
      const href = queryHref(q, where);
      expect(href.startsWith('/db/x/c?')).to.equal(true);
      expect(href).to.contain('sort%5Bage%5D=-1').and.to.not.contain('skip').and.to.not.contain('old').and.to.not.contain('limit');
      expect(parseQuery(href.slice(href.indexOf('?')))).to.deep.equal(q);
    }
  });

  it('escapes what is typed in a query', () => {
    const q = advanced('{ "a": "x&y=z#w" }');
    const href = queryHref(q, { pathname: '/p', search: '' });
    expect(parseQuery(href.slice(href.indexOf('?')))).to.deep.equal(q);
    expect(href).to.not.contain('x&y');
  });
});

describe('recent queries: the list', () => {
  it('puts a new query at the front', () => {
    const state = fill(3);
    expect(names(state.recent)).to.deep.equal(['q2', 'q1', 'q0']);
  });

  it('keeps ten, pushing the oldest out', () => {
    const state = fill(12);
    expect(state.recent).to.have.length(MAX_RECENT);
    expect(names(state.recent)).to.deep.equal(['q11', 'q10', 'q9', 'q8', 'q7', 'q6', 'q5', 'q4', 'q3', 'q2']);
  });

  it('moves a repeated query to the front, keeping its name, instead of adding another', () => {
    const state = fill(3);
    const again = record(state, simple(row('n', '0')), { name: 'a new name', id: 'new', now: 99 });
    expect(names(again.recent)).to.deep.equal(['q0', 'q2', 'q1']);
    expect(again.recent[0]).to.include({ id: 'id0', at: 99 });
    // a full list stays full, and nothing is pushed out by a repeat
    const full = fill(10);
    expect(record(full, simple(row('n', '3')), { name: 'x' }).recent).to.have.length(10);
    expect(names(record(full, simple(row('n', '3')), { name: 'x' }).recent)[0]).to.equal('q3');
  });

  it('leaves a pinned query where it is when it runs again, with no recent copy', () => {
    const pinned = togglePin(fill(2), 'id0');
    expect(names(pinned.pinned)).to.deep.equal(['q0']);
    const again = record(pinned, simple(row('n', '0')), { name: 'x' });
    expect(again).to.equal(pinned);
  });

  it('does not remember a query too big to keep', () => {
    const state = fill(1);
    expect(record(state, advanced('x'.repeat(MAX_QUERY_SIZE + 1)), { name: 'big' })).to.equal(state);
    expect(record(state, advanced('x'.repeat(1000)), { name: 'ok' }).recent).to.have.length(2);
  });

  it('pins a recent query out of the ten, so ten more fit beside it', () => {
    let state = togglePin(fill(10), 'id4');
    expect(names(state.pinned)).to.deep.equal(['q4']);
    expect(state.recent).to.have.length(9);
    for (let index = 20; index < 30; index++) state = record(state, simple(row('n', String(index))), { name: `q${index}`, id: `id${index}` });
    expect(state.recent).to.have.length(MAX_RECENT);
    expect(names(state.pinned)).to.deep.equal(['q4']);
  });

  it('keeps pins in the order they were pinned', () => {
    const state = togglePin(togglePin(togglePin(fill(4), 'id1'), 'id3'), 'id0');
    expect(names(state.pinned)).to.deep.equal(['q1', 'q3', 'q0']);
  });

  it('unpins a pinned query into the newest recent, which can push the oldest out', () => {
    const pinned = togglePin(fill(1), 'id0');
    expect(pinned.recent).to.have.length(0);
    let state = pinned;
    for (let index = 1; index <= 10; index++) state = record(state, simple(row('n', String(index))), { name: `q${index}`, id: `id${index}` });
    expect(state.recent).to.have.length(10);
    const unpinned = togglePin(state, 'id0');
    expect(unpinned.pinned).to.have.length(0);
    expect(unpinned.recent).to.have.length(10);
    expect(unpinned.recent[0].name).to.equal('q0');
    expect(names(unpinned.recent)).to.not.include('q1');
  });

  it('stops pinning at the cap, and ignores an id it does not know', () => {
    let state = emptyState();
    for (let index = 0; index < MAX_PINNED + 1; index++) {
      state = record(state, simple(row('n', String(index))), { name: `q${index}`, id: `id${index}` });
      state = togglePin(state, `id${index}`);
    }
    expect(state.pinned).to.have.length(MAX_PINNED);
    expect(state.recent).to.have.length(1);
    expect(togglePin(state, 'nope')).to.equal(state);
  });

  it('removes a query, pinned or not, and clears the recent ones but not the pinned', () => {
    const state = togglePin(fill(4), 'id1');
    expect(names(remove(state, 'id1').pinned)).to.deep.equal([]);
    expect(names(remove(state, 'id3').recent)).to.deep.equal(['q2', 'q0']);
    const cleared = clearRecent(state);
    expect(cleared.recent).to.have.length(0);
    expect(names(cleared.pinned)).to.deep.equal(['q1']);
  });

  it('renames a query, ignoring a blank name and cutting a long one', () => {
    const state = togglePin(fill(2), 'id0');
    expect(rename(state, 'id0', '  mine ').pinned[0].name).to.equal('mine');
    expect(rename(state, 'id1', 'other').recent[0].name).to.equal('other');
    expect(rename(state, 'id0', '   ')).to.equal(state);
    expect(rename(state, 'id0', 'x'.repeat(200)).pinned[0].name).to.have.length(MAX_NAME);
  });

  it('never changes the list it was given', () => {
    const state = fill(3);
    const copy = JSON.stringify(state);
    record(state, simple(row('z', '1')), { name: 'z' });
    togglePin(state, 'id1');
    remove(state, 'id1');
    rename(state, 'id1', 'x');
    clearRecent(state);
    expect(JSON.stringify(state)).to.equal(copy);
  });
});

const item = (id, q = simple(row(id, '1'))) => ({
  id, name: id, q, at: 1,
});
const many = (count, prefix) => Array.from({ length: count }, (_, index) => item(`${prefix}${index}`));

describe('recent queries: what comes back from storage', () => {
  it('keeps a good list as it is', () => {
    const state = { pinned: [item('p')], recent: [item('a'), item('b')] };
    expect(sanitizeState(state)).to.deep.equal(state);
  });

  it('survives anything that is not a list', () => {
    for (const raw of [null, undefined, 5, 'x', [], { pinned: 'x', recent: 3 }]) expect(sanitizeState(raw), String(raw)).to.deep.equal(emptyState());
  });

  it('drops malformed items, keeping the good ones', () => {
    const state = sanitizeState({
      pinned: [item('p'), { id: 'bad' }, null],
      recent: [
        item('a'), { ...item('x'), q: { kind: 'nope' } }, { ...item('y'), q: simple({ k: 1 }) },
        { ...item('z'), q: { kind: 'simple', rows: [], join: 'and' } }, { ...item('w'), q: simple(row('a', '1', { op: 'like' })) },
        { ...item('v'), q: advanced('x', '', 'yes') }, { ...item('u'), name: 5 }, item('b'),
      ],
    });
    expect(names(state.pinned)).to.deep.equal(['p']);
    expect(names(state.recent)).to.deep.equal(['a', 'b']);
  });

  it('drops duplicates, keeping a query that is both pinned and recent as pinned', () => {
    const same = simple(row('same', '1'));
    const state = sanitizeState({ pinned: [item('p', same)], recent: [item('r', same), item('a'), item('a')] });
    expect(names(state.pinned)).to.deep.equal(['p']);
    expect(names(state.recent)).to.deep.equal(['a']);
  });

  it('enforces the limits on a list that grew past them', () => {
    const state = sanitizeState({ pinned: many(80, 'p'), recent: many(30, 'r') });
    expect(state.pinned).to.have.length(MAX_PINNED);
    expect(state.recent).to.have.length(MAX_RECENT);
  });
});
