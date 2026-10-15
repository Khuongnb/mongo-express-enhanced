/* eslint-disable unicorn/prefer-scoped-selector -- node-html-parser's document root has no :scope */
import { expect } from 'chai';
import htmlParser from 'node-html-parser';

import {
  choicesFor, readCookie, resolveLimit, resolveSizes, toPositiveInt,
} from '../../enhanced/features/perPage.js';
import {
  cleanAndCloseDb, initializeDb, testCollection, testDbName, testURLCollectionName,
} from '../testMongoUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

describe('enhanced rows per page: the pure parts', () => {
  it('accepts only whole positive numbers', () => {
    expect(toPositiveInt('25')).to.equal(25);
    expect(toPositiveInt(' 50 ')).to.equal(50);
    for (const bad of ['0', '-5', '2.5', 'abc', '', '1e3', undefined, null, '1234567']) expect(toPositiveInt(bad), String(bad)).to.equal(undefined);
  });

  it('reads one cookie out of a header', () => {
    expect(readCookie('a=1; me_per_page=100; b=2', 'me_per_page')).to.equal('100');
    expect(readCookie('a=1', 'me_per_page')).to.equal(undefined);
    expect(readCookie(undefined, 'me_per_page')).to.equal(undefined);
  });

  it('defaults to 25, capped at 250', () => {
    expect(resolveSizes({ options: { documentsPerPage: 10 } }, {}, {})).to.deep.equal({ fallback: 25, max: 250 });
    expect(resolveSizes({ options: {} }, {}, {})).to.deep.equal({ fallback: 25, max: 250 });
  });

  it('lets the env, then config.js, then the enhanced settings choose the default, and the env set the maximum', () => {
    // upstream turns the env var into a string: it must come out a number
    expect(resolveSizes({ options: { documentsPerPage: '10' } }, {}, { ME_CONFIG_DOCUMENTS_PER_PAGE: '50' })).to.deep.equal({ fallback: 50, max: 250 });
    expect(resolveSizes({ options: { documentsPerPage: 40 } }, {}, {})).to.deep.equal({ fallback: 40, max: 250 });
    expect(resolveSizes({ options: { documentsPerPage: 40 } }, { documentsPerPage: 30 }, {})).to.deep.equal({ fallback: 30, max: 250 });
    expect(resolveSizes({ options: {} }, {}, { ME_CONFIG_ENHANCED_MAX_PER_PAGE: '500' }).max).to.equal(500);
    // an explicit 10 through the env is respected, unlike a 10 in config.js, which is upstream's own default
    expect(resolveSizes({ options: { documentsPerPage: '10' } }, {}, { ME_CONFIG_DOCUMENTS_PER_PAGE: '10' }).fallback).to.equal(10);
  });

  it('never has a maximum below the default', () => {
    expect(resolveSizes({ options: {} }, { documentsPerPage: 400, maxPerPage: 100 }, {})).to.deep.equal({ fallback: 400, max: 400 });
  });

  it('prefers ?limit= over the cookie over the default, and caps all of them', () => {
    const sizes = { fallback: 25, max: 250 };
    expect(resolveLimit({ ...sizes })).to.equal(25);
    expect(resolveLimit({ ...sizes, cookie: '100' })).to.equal(100);
    expect(resolveLimit({ ...sizes, cookie: '100', query: '50' })).to.equal(50);
    expect(resolveLimit({ ...sizes, query: '9999' })).to.equal(250);
    expect(resolveLimit({ ...sizes, cookie: '9999' })).to.equal(250);
    for (const query of ['abc', '-1', '0', ['1', '2'], { a: '1' }]) expect(resolveLimit({ ...sizes, query }), JSON.stringify(query)).to.equal(25);
    expect(resolveLimit({ ...sizes, query: 'abc', cookie: '50' })).to.equal(50);
  });

  it('offers the standard sizes up to the maximum, plus the default and the current size', () => {
    expect(choicesFor({ fallback: 25, max: 250, current: 25 })).to.deep.equal([10, 25, 50, 100, 250]);
    expect(choicesFor({ fallback: 25, max: 100, current: 25 })).to.deep.equal([10, 25, 50, 100]);
    expect(choicesFor({ fallback: 30, max: 250, current: 75 })).to.deep.equal([10, 25, 30, 50, 75, 100, 250]);
  });
});

describe('enhanced rows per page: the collection page', () => {
  const pagePath = `/db/${testDbName}/${testURLCollectionName}`;
  let db;
  before(async () => {
    db = await initializeDb();
    // 4 from the helper, 296 more: 300 in all, so even the largest page is not the last
    await testCollection(db).insertMany(Array.from({ length: 296 }, (_, index) => ({ testItem: index + 5 })));
  });
  after(() => cleanAndCloseDb(db));

  const page = async ({ options, enhanced, query = {}, cookie } = {}) => {
    const server = await createEnhancedServer({ options, enhanced });
    try {
      const request = server.request.get(pagePath).query(query);
      if (cookie) request.set('Cookie', cookie);
      const res = await request.expect(200);
      const root = htmlParser.parse(res.text);
      return {
        text: res.text,
        rows: root.querySelectorAll('tbody tr[id^="doc-"]').length,
        selected: root.querySelector('[data-me-per-page] option[selected]')?.getAttribute('value'),
        sizes: root.querySelectorAll('[data-me-per-page] option').map((option) => option.getAttribute('value')),
      };
    } finally {
      server.close();
    }
  };

  const rowsOf = async (settings) => {
    const { rows } = await page(settings);
    return rows;
  };

  it('shows 25 rows by default (upstream shows 10)', async () => {
    const { rows, selected, sizes } = await page({ options: { documentsPerPage: 10 } });
    expect(rows).to.equal(25);
    expect(selected).to.equal('25');
    expect(sizes).to.deep.equal(['10', '25', '50', '100', '250']);
  });

  it('honours ?limit=, with the right range and page count', async () => {
    const { rows, text } = await page({ query: { limit: '100' } });
    expect(rows).to.equal(100);
    expect(text).to.contain('data-per-page="100"').and.to.contain("totalPages: Math.ceil('300' / '100')");
  });

  it('honours the picker\'s cookie, and lets ?limit= win over it', async () => {
    expect(await rowsOf({ cookie: 'other=1; me_per_page=50' })).to.equal(50);
    expect(await rowsOf({ cookie: 'me_per_page=50', query: { limit: '10' } })).to.equal(10);
  });

  it('never goes over the maximum, and ignores a limit it cannot read', async () => {
    expect(await rowsOf({ query: { limit: '5000' } })).to.equal(250);
    expect(await rowsOf({ query: { limit: 'lots' } })).to.equal(25);
    expect(await rowsOf({ cookie: 'me_per_page=-3' })).to.equal(25);
    expect(await rowsOf({ query: { limit: '300' }, enhanced: { maxPerPage: 100 } })).to.equal(100);
  });

  it('pages by the chosen size', async () => {
    const { rows } = await page({ query: { limit: '100', skip: '200' } });
    expect(rows).to.equal(100);
    // the last page of 300 rows at 250 per page holds the 50 left over
    expect(await rowsOf({ query: { limit: '250', skip: '250' } })).to.equal(50);
  });

  it('pages correctly in aggregate mode, where upstream added limit and skip as strings', async () => {
    const { rows } = await page({
      query: { limit: '50', runAggregate: 'on', query: '[{ $match: { testItem: { $gte: 1 } } }]' },
    });
    expect(rows).to.equal(50);
  });

  it('keeps the maximum available when the default is above it', async () => {
    const { rows, sizes } = await page({ enhanced: { documentsPerPage: 40, maxPerPage: 100 } });
    expect(rows).to.equal(40);
    expect(sizes).to.deep.equal(['10', '25', '40', '50', '100']);
  });
});
