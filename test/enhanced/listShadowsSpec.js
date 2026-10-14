/* eslint-disable unicorn/dom-node-dataset -- node-html-parser elements have no dataset */
import fs from 'node:fs';
import { expect } from 'chai';
import htmlParser from 'node-html-parser';

import {
  cleanAndCloseDb, initializeDb, testDbName, testURLCollectionName,
} from '../testMongoUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

const withPage = async (options, path, body) => {
  const server = await createEnhancedServer(options);
  try {
    const res = await server.request.get(path).expect(200);
    return await body(res.text, htmlParser.parse(res.text));
  } finally {
    server.close();
  }
};

const upstreamIds = (name) => fs.readFileSync(new URL(`../../lib/views/${name}.html`, import.meta.url), 'utf8')
  .matchAll(/\bid="([^"{}]+)"/g).map((match) => match[1]).toArray();

describe('enhanced list pages (shadows of lib/views/index.html and database.html)', () => {
  let db;
  before(async () => { db = await initializeDb(); });
  after(() => cleanAndCloseDb(db));

  describe('home', () => {
    it('is the designed page and lists the test database', () => withPage({}, '/', (text, root) => {
      expect(text).to.contain('<h1 id="pageTitle">Databases</h1>');
      expect(root.querySelectorAll('.me-item').some((item) => item.getAttribute('data-name') === testDbName)).to.equal(true);
    }));

    it('keeps every id upstream\'s template defines and the hooks of lib/scripts/index.js', () => withPage({}, '/', (text, root) => {
      expect(upstreamIds('index').filter((id) => !text.includes(`id="${id}"`))).to.deep.equal([]);
      const del = root.querySelector('.deleteButton');
      expect(del.getAttribute('data-database-name')).to.be.a('string');
      expect(del.parentNode.tagName).to.equal('FORM');
      expect(root.querySelector('#confirmation-input').getAttribute('shouldbe')).to.equal('');
    }));

    it('has no create form, delete buttons or modal in read-only mode', () => withPage({ options: { readOnly: true } }, '/', (text, root) => {
      for (const hook of ['#database', '.deleteButton', '#confirm-deletion']) expect(root.querySelector(hook), hook).to.equal(null);
    }));

    it('offers a filter box and an empty state that starts hidden', () => withPage({}, '/', (text, root) => {
      expect(root.querySelector('[data-me-filter]')).to.not.equal(null);
      expect(root.querySelector('[data-me-filter-empty]').hasAttribute('hidden')).to.equal(true);
    }));
  });

  describe('database', () => {
    const path = `/db/${testDbName}`;

    it('is the designed page and lists the test collection', () => withPage({}, path, (text, root) => {
      expect(text).to.contain(`<h1 id="pageTitle">${testDbName}</h1>`);
      expect(root.querySelectorAll('.me-item').some((item) => item.getAttribute('data-name') === 'test/items')).to.equal(true);
      expect(testURLCollectionName).to.be.a('string');
    }));

    it('keeps every id upstream\'s template defines and the hooks of lib/scripts/database.js', () => withPage({}, path, (text, root) => {
      expect(upstreamIds('database').filter((id) => !text.includes(`id="${id}"`))).to.deep.equal([]);
      for (const hook of ['.deleteButton', '.import-file-link', '.import-input-file']) expect(root.querySelector(hook), hook).to.not.equal(null);
      expect(root.querySelector('.deleteButton').parentNode.tagName).to.equal('FORM');
      expect(root.querySelectorAll('.import-file-link').length).to.equal(root.querySelectorAll('.import-input-file').length);
      expect(root.querySelector('.import-input-file').getAttribute('data-collection-name')).to.be.a('string');
      // upstream's import handler reads the first _csrf input on the page
      expect(root.querySelector('[name="_csrf"]')).to.not.equal(null);
    }));

    it('asks for the collection name when deleting', () => withPage({}, path, (text) => {
      expect(text).to.contain('Type the collection name to proceed');
    }));

    it('offers neither import, delete nor create in read-only mode', () => withPage({ options: { readOnly: true } }, path, (text, root) => {
      for (const hook of ['#collection', '.deleteButton', '.import-file-link', '#confirm-deletion']) {
        expect(root.querySelector(hook), hook).to.equal(null);
      }
    }));

    it('formats database stats once (upstream already formats the sizes)', () => withPage({ options: {} }, path, (text) => {
      expect(text).to.not.match(/\d+ Bytes<\/td>[\s\S]{0,5}Bytes/);
      expect(text).to.not.contain('NaN');
    }));
  });
});
