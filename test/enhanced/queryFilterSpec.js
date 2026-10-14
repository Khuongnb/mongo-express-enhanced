import { expect } from 'chai';
import { Binary, BSON, ObjectId } from 'mongodb';
import qs from 'qs';

import * as bson from '../../lib/bson.js';
import queryFilter, { buildFilter, MAX_ROWS } from '../../enhanced/features/queryFilter.js';

const parse = (search) => buildFilter(qs.parse(search));
const row = (index, { k, op, t, v }) => qs.stringify({ f: { [index]: { k, op, t, v } } });
const clause = (t, v, op = 'eq', k = 'x') => buildFilter({ f: [{ k, op, t, v }] }).clause;

// Dropping a filter that cannot be read would turn "delete matching" into "delete everything", so it must refuse instead.
const failing = (search) => {
  const filter = parse(search);
  expect(filter.error, search).to.be.a('string');
  expect(filter.override.key).to.equal('x');
  // what upstream appends to "Invalid query type: "
  expect(filter.override.type.toUpperCase()).to.equal(`Filter: ${filter.error}`);
  return filter;
};

const run = (search) => {
  const req = { query: qs.parse(search) };
  const res = { locals: {} };
  let called = false;
  queryFilter()(req, res, () => { called = true; });
  expect(called).to.equal(true);
  return { req, res };
};

describe('enhanced queryFilter', () => {
  describe('buildFilter', () => {
    it('does nothing without filter parameters', () => {
      const filter = parse('');
      expect(filter.rows).to.deep.equal([]);
      expect(filter.override).to.equal(null);
      expect(filter.error).to.equal(null);
    });

    it('leaves the old key/value/type parameters to upstream, so a plain equality keeps its exact behaviour', () => {
      const filter = parse('key=testItem&value=2&type=N');
      expect(filter.override).to.equal(null);
      expect(filter.rows).to.deep.equal([{
        k: 'testItem', op: 'eq', t: 'N', v: '2',
      }]);
      // upstream accepts value[a]=b as a pass-through object; that must not be flattened into a string
      expect(parse('key=a&value[b]=1&type=S').override).to.equal(null);
    });

    it('treats the old parameters plus op as the first row', () => {
      const filter = parse('key=age&value=5&type=N&op=gt');
      expect(filter.override).to.deep.equal({ key: 'age', value: { $gt: 5 }, type: 'S' });
    });

    it('turns one indexed equality row into the old shape, still converted by upstream', () => {
      expect(parse(row(0, {
        k: 'a', op: 'eq', t: 'n', v: '5',
      })).override).to.deep.equal({ key: 'a', value: '5', type: 'N' });
    });

    it('maps every comparison operator', () => {
      const operators = {
        ne: '$ne', gt: '$gt', gte: '$gte', lt: '$lt', lte: '$lte',
      };
      for (const [op, mongo] of Object.entries(operators)) {
        expect(parse(row(0, {
          k: 'n', op, t: 'N', v: '7',
        })).clause, op).to.deep.equal({ n: { [mongo]: 7 } });
      }
    });

    it('combines several rows with $and by default and $or on request', () => {
      const rows = `${row(0, { k: 'a', t: 'N', v: '1' })}&${qs.stringify({ f: { 1: { k: 'b', op: 'gt', t: 'N', v: '2' } } })}`;
      expect(parse(rows).override).to.deep.equal({ key: '$and', value: [{ a: 1 }, { b: { $gt: 2 } }], type: 'S' });
      expect(parse(`${rows}&join=or`).override).to.deep.equal({ key: '$or', value: [{ a: 1 }, { b: { $gt: 2 } }], type: 'S' });
      expect(parse(`${rows}&join=nonsense`).join).to.equal('and');
    });

    it('ignores rows that lack a key or a value, like upstream\'s `key && value`', () => {
      const filter = parse('f[0][k]=a&f[0][v]=&f[1][k]=&f[1][v]=x&f[2][k]=b&f[2][t]=S&f[2][v]=y');
      expect(filter.rows).to.have.length(1);
      expect(filter.rows[0].k).to.equal('b');
    });

    it('keeps the form\'s row order when qs returns an object for indexes past its array limit', () => {
      const filter = parse('f[0][k]=a&f[0][v]=1&f[25][k]=z&f[25][v]=2&f[3][k]=m&f[3][v]=3');
      expect(filter.rows.map((r) => r.k)).to.deep.equal(['a', 'm', 'z']);
    });

    describe('values', () => {
      it('converts by type', () => {
        expect(clause('N', '2.5')).to.deep.equal({ x: 2.5 });
        expect(clause('J', '{"a":1}')).to.deep.equal({ x: { a: 1 } });
        expect(clause('R', 'ab.c')).to.deep.equal({ x: /ab.c/i });
        expect(clause('O', '65f1c2a8e4b0a1b2c3d4e5f6').x.toString()).to.equal('65f1c2a8e4b0a1b2c3d4e5f6');
        const uuid = clause('U', '3f2504e0-4f89-41d3-9a0c-0305e82c3301').x;
        expect(uuid).to.be.instanceOf(Binary);
        expect(uuid.sub_type).to.equal(Binary.SUBTYPE_UUID);
        expect(clause('D', '2026-10-14T06:30:00Z').x).to.deep.equal(new Date('2026-10-14T06:30:00Z'));
        expect(clause('D', '2026-10-14').x).to.deep.equal(new Date('2026-10-14'));
      });

      it('makes a String that looks like an id or a boolean match both forms, like upstream', () => {
        const oid = '65f1c2a8e4b0a1b2c3d4e5f6';
        expect(clause('S', oid).x.$in).to.deep.equal([oid, new ObjectId(oid)]);
        expect(clause('S', 'True').x.$in).to.deep.equal(['True', true]);
        expect(clause('S', 'plain').x).to.equal('plain');
        expect(clause('S', oid, 'ne').x.$nin).to.deep.equal([oid, new ObjectId(oid)]);
        expect(clause('S', 'false', 'ne').x.$nin).to.deep.equal(['false', false]);
      });

      it('compares text as text with < and >, never as an ObjectId or a boolean', () => {
        expect(clause('S', '65f1c2a8e4b0a1b2c3d4e5f6', 'gt').x).to.deep.equal({ $gt: '65f1c2a8e4b0a1b2c3d4e5f6' });
        expect(clause('S', 'true', 'lte').x).to.deep.equal({ $lte: 'true' });
      });

      it('negates a regex with $not', () => {
        expect(clause('R', 'ab', 'ne').x).to.deep.equal({ $not: /ab/i });
      });
    });

    describe('fails closed', () => {
      it('rejects a value that does not fit its type', () => {
        expect(failing(row(0, { k: 'a', t: 'D', v: 'tomorrow' })).error).to.contain('filter 1').and.to.contain('not a date');
        expect(failing(row(0, {
          k: 'a', op: 'ne', t: 'J', v: '{oops',
        })).error).to.contain('filter 1');
        expect(failing(`${row(0, { k: 'a', t: 'O', v: 'zzz' })}&${row(1, { k: 'b', t: 'N', v: '1' })}`).error).to.contain('filter 1');
        expect(failing(`${row(0, { k: 'a', t: 'N', v: '1' })}&${row(1, { k: 'b', t: 'R', v: '(' })}`).error).to.contain('filter 2');
      });

      it('rejects a regex with an ordering operator', () => {
        expect(failing(row(0, {
          k: 'a', op: 'gt', t: 'R', v: 'x',
        })).error).to.contain('regular expression');
      });

      it('rejects unknown operators and types, malformed parameters and too many rows', () => {
        expect(failing(row(0, { k: 'a', op: '$where', v: '1' })).error).to.contain('operator');
        expect(failing(row(0, { k: 'a', t: 'X', v: '1' })).error).to.contain('type');
        expect(failing('f=oops').error).to.contain('malformed');
        expect(failing('f[0]=oops').error).to.contain('malformed');
        expect(failing('f[x][k]=a&f[x][v]=1').error).to.contain('malformed');
        const many = Array.from({ length: MAX_ROWS + 1 }, (_, i) => qs.stringify({ f: { [i]: { k: 'a', v: '1' } } })).join('&');
        expect(failing(many).error).to.contain(String(MAX_ROWS));
      });

      it('does not report a conversion problem on a plain equality row: upstream still owns that error', () => {
        const filter = parse('key=a&value=zzz&type=O');
        expect(filter.error).to.equal(null);
        expect(filter.override).to.equal(null);
      });
    });

    it('describes the filter as an Advanced query that parses back to the same filter', () => {
      const oid = new ObjectId('65f1c2a8e4b0a1b2c3d4e5f6');
      const params = [
        { k: '_id', t: 'O', v: oid.toString() },
        { k: 'born', op: 'gte', t: 'D', v: '2026-01-02T03:04:05Z' },
        { k: 'name', op: 'ne', t: 'R', v: 'a.b' },
        { k: 'n', op: 'lt', t: 'N', v: '9' },
      ];
      const { clause, rows } = buildFilter({ f: params, join: 'or' });
      expect(rows).to.have.length(4);
      const text = bson.toString(clause);
      expect(BSON.EJSON.stringify(bson.toBSON(text))).to.equal(BSON.EJSON.stringify(clause));
    });
  });

  describe('middleware', () => {
    it('always provides meFilter, with one blank row to type in', () => {
      const { res, req } = run('');
      expect(res.locals.meFilter.formRows).to.deep.equal([{
        k: '', op: 'eq', t: 'S', v: '',
      }]);
      expect(res.locals.meFilter.qs).to.equal('');
      expect(req.query).to.deep.equal({});
    });

    it('rewrites the request for upstream and removes the parameters it consumed', () => {
      const { req, res } = run(`${row(0, { k: 'n', op: 'gt', t: 'N', v: '5' })}&skip=20&sort[n]=1`);
      expect(req.query).to.deep.equal({
        key: 'n', value: { $gt: 5 }, type: 'S', skip: '20', sort: { n: '1' },
      });
      expect(res.locals.meFilter.single).to.deep.include({ k: 'n', sym: '>', v: '5' });
    });

    it('leaves the request alone for a plain legacy filter', () => {
      const { req } = run('key=a&value=1&type=N');
      expect(req.query).to.deep.equal({ key: 'a', value: '1', type: 'N' });
    });

    it('builds the query string that carries the filter through links, and it parses back to the same rows', () => {
      const { res } = run(`${row(0, { k: 'a b&c', t: 'N', v: '1' })}&${qs.stringify({ f: { 1: { k: 'x', op: 'ne', v: 'y=z' } } })}&join=or`);
      const back = qs.parse(res.locals.meFilter.qs);
      expect(back.join).to.equal('or');
      expect(back.f).to.deep.equal([
        {
          k: 'a b&c', op: 'eq', t: 'N', v: '1',
        },
        {
          k: 'x', op: 'ne', t: 'S', v: 'y=z',
        },
      ]);
    });

    it('omits join for a single row and summarises several', () => {
      expect(run(row(0, { k: 'a', v: '1' })).res.locals.meFilter.qs).to.not.contain('join');
      const { res } = run(`${row(0, { k: 'a', v: '1' })}&${qs.stringify({ f: { 1: { k: 'b', op: 'gt', v: '2' } } })}&join=or`);
      expect(res.locals.meFilter.summary).to.equal('a = 1 OR b > 2');
    });
  });
});
