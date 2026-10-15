/* eslint-disable unicorn/prefer-scoped-selector -- node-html-parser's document root has no :scope */
import { expect } from 'chai';
import htmlParser from 'node-html-parser';

import {
  cleanAndCloseDb, initializeDb, testDbName, testURLCollectionName,
} from '../testMongoUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

// The list itself is built in the browser (test/enhanced/recentQueriesSpec.js covers its rules, and a headless-browser run covers the
// DOM); what the server owes it is the place it is built in.
describe('enhanced recent queries: the collection page', () => {
  const pagePath = `/db/${testDbName}/${testURLCollectionName}`;
  let db;
  before(async () => { db = await initializeDb(); });
  after(() => cleanAndCloseDb(db));

  const page = async (options = {}, query = {}) => {
    const server = await createEnhancedServer({ options });
    try {
      const res = await server.request.get(pagePath).query(query).expect(200);
      return htmlParser.parse(res.text);
    } finally {
      server.close();
    }
  };

  it('has a closed, hidden list under the query forms, for the script to fill and reveal', async () => {
    const root = await page();
    const list = root.querySelector('details[data-me-recent]');
    expect(list).to.not.equal(null);
    expect(list.hasAttribute('open')).to.equal(false);
    expect(list.hasAttribute('hidden')).to.equal(true);
    expect(list.querySelector('summary').text).to.contain('Recent queries');
    expect(list.querySelector('[data-me-recent-count]').text).to.equal('0');
    expect(list.querySelector('[data-me-recent-body]')).to.not.equal(null);
    // inside the query card, after the forms
    const card = root.querySelector('.card.me-query-card, section.card');
    expect(card.querySelector('#my-tab-content + details[data-me-recent]')).to.not.equal(null);
  });

  it('is there with the raw tab off and in read-only mode, where it still has queries to remember', async () => {
    const root = await page({ readOnly: true });
    expect(root.querySelector('details[data-me-recent]')).to.not.equal(null);
    // the pane the script keys on, and the Advanced tab it may switch to, are on the page
    expect(root.querySelector('#my-tab-content .tab-pane.active')).to.not.equal(null);
    expect(root.querySelector('#tabs a[href="#advanced"]')).to.not.equal(null);
  });

  it('keeps the error banner a direct child of <main>, which is how the script tells a refused query from one that ran', async () => {
    const server = await createEnhancedServer();
    // upstream logs the refused query it redirects away from; that is the point of this test, not noise worth printing
    const log = console.error;
    console.error = () => {};
    try {
      const agent = server.request;
      // a query the server refuses redirects back with the error banner
      const refused = await agent.get(pagePath).query({ query: '{ $badOperator: 1 }' });
      expect(refused.status).to.equal(302);
      const landed = await agent.get(pagePath).expect(200);
      const root = htmlParser.parse(landed.text);
      expect(root.querySelector('main.me-main > .alert-danger')).to.not.equal(null);
      // and the page's other `.alert-danger` (the delete-collection warning in a modal) is not that banner
      expect(root.querySelectorAll('.alert-danger').length).to.be.greaterThan(1);
    } finally {
      console.error = log;
      server.close();
    }
  });
});
