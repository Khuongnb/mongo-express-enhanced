/* eslint-disable unicorn/prefer-scoped-selector -- node-html-parser's document root has no :scope */
import fs from 'node:fs';
import { expect } from 'chai';
import htmlParser from 'node-html-parser';

import {
  cleanAndCloseDb, initializeDb, testCollectionName, testDbName, testURLCollectionName,
} from '../testMongoUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

const pagePath = `/db/${testDbName}/${testURLCollectionName}`;
const upstreamTemplate = new URL('../../lib/views/collection.html', import.meta.url);

const withPage = async (options, query, body) => {
  const server = await createEnhancedServer(options);
  try {
    const res = await server.request.get(pagePath).query(query).expect(200);
    return await body(res.text, htmlParser.parse(res.text));
  } finally {
    server.close();
  }
};

// ids written literally in upstream's template (not built from {{ }}): lib/scripts/collection.js and the app rely on them
const upstreamIds = () => fs.readFileSync(upstreamTemplate, 'utf8').matchAll(/\bid="([^"{}]+)"/g).map((match) => match[1]).toArray();

describe('enhanced collection page (shadow of lib/views/collection.html)', () => {
  let db;
  before(async () => { db = await initializeDb(); });
  after(() => cleanAndCloseDb(db));

  it('is the designed page, with the designed title and header', () => withPage({}, {}, (text) => {
    expect(text).to.contain(`<title>${testCollectionName} - Mongo Express</title>`);
    expect(text).to.match(/<h1 id="pageTitle"><span class="me-title-db">[^<]+\.<\/span>test\/items<\/h1>/);
    expect(text).to.contain('class="me-page-header"');
  }));

  it('keeps every id upstream\'s template defines, in a fully featured, non-empty view', () => withPage({}, { skip: 0 }, (text) => {
    // documentsPerPage is 10 and there are 4 documents, so the paginator is legitimately absent
    const expected = upstreamIds().filter((id) => !id.startsWith('paginator-'));
    const missing = expected.filter((id) => !text.includes(`id="${id}"`));
    expect(missing).to.deep.equal([]);
  }));

  it('keeps the classes and structures upstream\'s script depends on', () => withPage({}, {}, (text, root) => {
    for (const hook of [
      '.sorting-button', '.tableWrapper', '.fadeToWhite', '.deleteButtonDocument', '.deleteButtonCollection',
      '.import-file-link', '.import-input-file', '.tableContent', '#tabs a[href="#advanced"]',
    ]) expect(root.querySelector(hook), hook).to.not.equal(null);
    // upstream's script selects the table by this class
    expect(root.querySelector('table.tableHeaderFooterBars'), 'the table keeps tableHeaderFooterBars').to.not.equal(null);
    // $(this).parent() is the form to submit when a collection delete is confirmed
    expect(root.querySelector('.deleteButtonCollection').parentNode.tagName).to.equal('FORM');
    expect(text).to.match(/<script src="[^"]*collection[^"]*\.js"/).and.to.match(/<script src="[^"]*codemirror[^"]*\.js"/);
  }));

  it('puts sort data on the sort button and column names on every cell', () => withPage({}, { sort: { testItem: '1' } }, (text, root) => {
    const button = root.querySelector('.sorting-button[data-column="testItem"]');
    // eslint-disable-next-line unicorn/dom-node-dataset -- node-html-parser has no dataset
    expect(button.getAttribute('data-direction')).to.equal('1');
    expect(root.querySelector('th[data-column="testItem"]').getAttribute('aria-sort')).to.equal('ascending');
    expect(root.querySelectorAll('tbody td[data-column="testItem"]')).to.have.length(4);
    expect(root.querySelector('[data-me-sort-chip="testItem"]')).to.not.equal(null);
    // the hidden sort inputs the forms submit are still there
    expect(root.querySelector('input.sort-testItem').getAttribute('value')).to.equal('1');
  }));

  it('renders typed values with the designed classes', () => withPage({}, {}, (text, root) => {
    expect(root.querySelectorAll('tbody td[data-column="_id"] .v-oid')).to.have.length(4);
    expect(root.querySelectorAll('tbody td[data-column="testItem"] .v-num')).to.have.length(4);
    expect(root.querySelectorAll('[data-me-copy]')).to.have.length(4);
  }));

  it('opens documents through real links and keeps the row handler', () => withPage({}, {}, (text, root) => {
    const row = root.querySelector('#doc-0');
    expect(row.getAttribute('onclick')).to.match(/^loadDocument\('\/db\/[^']+\/[^']+\/[^']+\?skip=0', event\)$/);
    expect(root.querySelector('#doc-0 td[data-column="_id"] a[href]').getAttribute('href')).to.match(/\?skip=0$/);
  }));

  it('shows a "no match" state, with a way back, when a query finds nothing', () => withPage({}, { key: 'testItem', value: '999', type: 'N' }, (text) => {
    expect(text).to.contain('No documents found').and.to.contain('Clear query');
    expect(text).to.not.contain('<table class="table table-documents');
  }));

  it('hides every write control in read-only mode, and keeps the read-only ones', () => withPage({ options: { readOnly: true } }, {}, (text, root) => {
    // the add-document / add-index modals are rendered regardless (upstream does the same); the buttons that open them are not
    for (const hook of [
      '[data-bs-target="#addDocument"]', '[data-bs-target="#addIndex"]', '#raw', '#deleteListForm', '.deleteButtonDocument',
      '.deleteButtonCollection', '#collection',
    ]) {
      expect(root.querySelector(hook), hook).to.equal(null);
    }
    expect(root.querySelector('#simple')).to.not.equal(null);
    expect(root.querySelector('#advanced')).to.not.equal(null);
  }));
  it('opens the document page from the chain link in a new tab, safely', () => withPage({}, {}, (text, root) => {
    for (const link of root.querySelectorAll('tbody td[data-column="_id"] a[href]')) {
      expect(link.getAttribute('target')).to.equal('_blank');
      expect(link.getAttribute('rel')).to.contain('noopener');
    }
  }));

  describe('document popup', () => {
    it('is rendered with everything the script drives, for editing', () => withPage({}, {}, (text, root) => {
      const popup = root.querySelector('#documentPopup[data-me-popup]');
      expect(popup).to.not.equal(null);
      for (const part of ['id', 'copy', 'prev', 'next', 'open', 'error', 'discard', 'loading', 'editor', 'position', 'save', 'delete']) {
        // eslint-disable-next-line unicorn/require-css-escape -- fixed names from the list above
        expect(popup.querySelector(`[data-me-popup-${part}]`), part).to.not.equal(null);
      }
      expect(popup.querySelector('#popupDocument')).to.not.equal(null);
      expect(popup.querySelector('[data-me-popup-open]').getAttribute('target')).to.equal('_blank');
    }));

    it('does not reuse an id the add-document modal or upstream scripts own', () => withPage({}, {}, (text) => {
      expect(text.match(/id="document"/g)).to.have.length(1);
    }));

    it('has no Save in read-only mode, and the textarea is read-only', () => withPage({ options: { readOnly: true } }, {}, (text, root) => {
      const popup = root.querySelector('#documentPopup');
      expect(popup.querySelector('[data-me-popup-save]')).to.equal(null);
      expect(popup.querySelector('[data-me-popup-delete]')).to.equal(null);
      expect(popup.querySelector('#popupDocument').hasAttribute('readonly')).to.equal(true);
    }));

    it('has no Delete when deleting is not permitted, but keeps Save', () => withPage({ options: { noDelete: true } }, {}, (text, root) => {
      const popup = root.querySelector('#documentPopup');
      expect(popup.querySelector('[data-me-popup-delete]')).to.equal(null);
      expect(popup.querySelector('[data-me-popup-save]')).to.not.equal(null);
    }));
  });
});
