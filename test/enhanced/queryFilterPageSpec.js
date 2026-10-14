/* eslint-disable unicorn/dom-node-dataset -- node-html-parser elements have no dataset */
/* eslint-disable unicorn/prefer-scoped-selector -- node-html-parser's document root has no :scope */
import { expect } from 'chai';
import htmlParser from 'node-html-parser';

import { cleanAndCloseDb, initializeDb, testDbName } from '../testMongoUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

const collectionName = 'filter_rows';
const pagePath = `/db/${testDbName}/${collectionName}`;

const documents = () => [
  {
    name: 'a', n: 1, tag: 'x', born: new Date('2020-01-01T00:00:00Z'),
  },
  {
    name: 'b', n: 5, tag: 'x', born: new Date('2022-06-01T00:00:00Z'),
  },
  {
    name: 'c', n: 10, tag: 'y', born: new Date('2024-03-01T00:00:00Z'),
  },
  {
    name: 'd', n: 5, tag: 'y', born: new Date('2024-09-01T00:00:00Z'),
  },
];

// Rows as the form submits them: f[i][k|op|t|v].
const f = (...rows) => {
  const query = {};
  for (const [i, { k, op = 'eq', t = 'S', v }] of rows.entries()) {
    Object.assign(query, {
      [`f[${i}][k]`]: k, [`f[${i}][op]`]: op, [`f[${i}][t]`]: t, [`f[${i}][v]`]: v,
    });
  }
  return query;
};

const namesIn = (root) => root.querySelectorAll('tbody td[data-column="name"]').map((td) => td.text.trim()).sort();

const gtOne = f({
  k: 'n', op: 'gt', t: 'N', v: '1',
});

// A filter link has to keep the first row's key and operator.
const carries = (url) => {
  const decoded = decodeURIComponent(url);
  return decoded.includes('f[0][k]=n') && decoded.includes('f[0][op]=gt');
};

describe('enhanced collection page: multi-row Simple filter', () => {
  let client;
  let server;
  let collection;

  const page = async (query) => {
    const res = await server.request.get(pagePath).query(query).expect(200);
    return htmlParser.parse(res.text);
  };
  const listed = (query) => page(query).then(namesIn);
  const deleteMatching = (query) => server.request
    .post(pagePath).query({ ...query, query: '{}' }).type('form').send({ _method: 'delete' });
  const remaining = () => collection.find().toArray().then((found) => found.map((d) => d.name).sort());

  before(async () => {
    client = await initializeDb();
    collection = client.db().collection(collectionName);
    server = await createEnhancedServer();
  });
  beforeEach(async () => {
    await collection.deleteMany({});
    await collection.insertMany(documents());
  });
  after(async () => {
    server.close();
    await collection.drop().catch(() => {});
    await cleanAndCloseDb(client);
  });

  it('compares with the chosen operator', async () => {
    expect(await listed(gtOne)).to.deep.equal(['b', 'c', 'd']);
    expect(await listed(f({
      k: 'n', op: 'ne', t: 'N', v: '5',
    }))).to.deep.equal(['a', 'c']);
    expect(await listed(f({
      k: 'n', op: 'lte', t: 'N', v: '5',
    }))).to.deep.equal(['a', 'b', 'd']);
  });

  it('keeps the old key/value/type parameters working, as plain equality', async () => {
    expect(await listed({ key: 'n', value: '5', type: 'N' })).to.deep.equal(['b', 'd']);
    expect(await listed({
      key: 'n', value: '5', type: 'N', op: 'gt',
    })).to.deep.equal(['c']);
  });

  it('requires all rows by default and any row with join=or', async () => {
    const rows = f({
      k: 'n', op: 'gte', t: 'N', v: '5',
    }, { k: 'tag', v: 'y' });
    expect(await listed(rows)).to.deep.equal(['c', 'd']);
    expect(await listed({ ...rows, join: 'or' })).to.deep.equal(['b', 'c', 'd']);
  });

  it('compares dates', async () => {
    expect(await listed(f({
      k: 'born', op: 'gte', t: 'D', v: '2024-01-01',
    }, {
      k: 'born', op: 'lt', t: 'D', v: '2024-06-01',
    }))).to.deep.equal(['c']);
  });

  it('shows the filter back in the form, with the chosen operator, type and join', async () => {
    const root = await page({
      ...f({
        k: 'n', op: 'gte', t: 'N', v: '5',
      }, { k: 'tag', op: 'ne', v: 'x' }),
      join: 'or',
    });
    expect(root.querySelectorAll('[data-me-filter-row]')).to.have.length(2);
    expect(root.querySelector('input[name="f[0][k]"]').getAttribute('value')).to.equal('n');
    expect(root.querySelector('input[name="f[1][v]"]').getAttribute('value')).to.equal('x');
    expect(root.querySelector('select[name="f[0][op]"] option[selected]').getAttribute('value')).to.equal('gte');
    expect(root.querySelector('select[name="f[0][t]"] option[selected]').getAttribute('value')).to.equal('N');
    expect(root.querySelector('select[name="f[1][op]"] option[selected]').getAttribute('value')).to.equal('ne');
    expect(root.querySelector('input[name="join"][value="or"]').hasAttribute('checked')).to.equal(true);
    expect(root.querySelector('[data-me-filter-form]').getAttribute('data-rows')).to.equal('2');
    expect(root.querySelector('.me-chip[title]').text).to.contain('2 filters').and.to.contain('any can match');
  });

  it('keeps upstream\'s #key and #value on the first row only', async () => {
    const root = await page(f({ k: 'tag', v: 'x' }, { k: 'n', v: '1' }));
    expect(root.querySelectorAll('input[id="key"]')).to.have.length(1);
    expect(root.querySelector('#key').getAttribute('name')).to.equal('f[0][k]');
    expect(root.querySelector('#value').getAttribute('name')).to.equal('f[0][v]');
  });

  it('hands the page\'s field types to the filter, for its Key to Type switch', async () => {
    const root = await page({});
    const types = JSON.parse(root.querySelector('[data-me-filter-form]').getAttribute('data-me-types'));
    expect(types).to.deep.include({
      name: 'S', n: 'N', tag: 'S', born: 'D', _id: 'O',
    });
  });

  it('offers one blank row when nothing is filtered, and a chip with key, operator and value for a single row', async () => {
    const blank = await page({});
    expect(blank.querySelectorAll('[data-me-filter-row]')).to.have.length(1);
    expect(blank.querySelector('input[name="f[0][k]"]').getAttribute('value')).to.equal('');
    const one = await page(gtOne);
    expect(one.querySelector('.me-chip').text).to.match(/n\s*>\s*1/);
  });

  it('offers "Copy as query" only for a filter, carrying the equivalent Advanced query', async () => {
    const none = await page({});
    expect(none.querySelector('[data-me-copy-query]')).to.equal(null);
    const root = await page(f({
      k: 'n', op: 'gt', t: 'N', v: '1',
    }, { k: 'tag', v: 'y' }));
    const copied = root.querySelector('[data-me-copy-query]').getAttribute('data-me-copy-query');
    expect(copied).to.contain('$and').and.to.contain('$gt').and.to.contain('tag');
  });

  it('keeps the filter on every link that acts on the filtered set', async () => {
    const root = await page(gtOne);
    expect(carries(root.querySelector('#deleteListForm').getAttribute('action')), 'delete matching').to.equal(true);
    const exports = root.querySelectorAll('.me-tile[href*="/export/"], .me-tile[href*="/expArr/"], .me-tile[href*="/expCsv/"]');
    expect(exports).to.have.length(3);
    for (const link of exports) expect(carries(link.getAttribute('href')), link.getAttribute('href')).to.equal(true);
    expect(carries(root.querySelector('.me-inline-form').getAttribute('action')), 'delete one document').to.equal(true);
  });

  it('exports exactly the filtered documents', async () => {
    const res = await server.request
      .get(`/db/${testDbName}/export/${collectionName}`)
      .query(f({
        k: 'n', op: 'gt', t: 'N', v: '5',
      }))
      .expect(200).responseType('blob');
    const lines = res.body.toString().trim().split('\n');
    expect(lines).to.have.length(1);
    expect(lines[0]).to.contain('"name":"c"');
  });

  describe('delete matching', () => {
    it('removes exactly the documents the filter shows', async () => {
      await deleteMatching(f({
        k: 'n', op: 'gte', t: 'N', v: '5',
      }, { k: 'tag', v: 'y' }));
      expect(await remaining()).to.deep.equal(['a', 'b']);
    });

    it('removes nothing when the filter cannot be read, instead of falling back to everything', async () => {
      await deleteMatching(f({
        k: 'born', op: 'gt', t: 'D', v: 'not a date',
      }));
      expect(await remaining()).to.have.length(4);
      await deleteMatching(f({
        k: 'n', op: 'gt', t: 'R', v: 'x',
      }));
      expect(await remaining()).to.have.length(4);
    });
  });

  it('explains a filter that cannot be read, on the page the user is sent back to', async () => {
    const failed = await server.request.get(pagePath).query(f({
      k: 'born', op: 'gt', t: 'D', v: 'next week',
    })).expect(302);
    expect(failed.headers.location).to.be.a('string');
    const shown = await server.request.get(pagePath).expect(200);
    expect(shown.text).to.contain('filter 1').and.to.contain('not a date');
  });
});
