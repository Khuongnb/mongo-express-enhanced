/* eslint-disable unicorn/prefer-scoped-selector -- node-html-parser's document root has no :scope */
import fs from 'node:fs';
import { expect } from 'chai';
import htmlParser from 'node-html-parser';

import {
  cleanAndCloseDb, getFirstDocumentId, initializeDb, testDbName, testURLCollectionName,
} from '../testMongoUtils.js';
import { getDocumentUrl } from '../testHttpUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

const withPage = async (options, body) => {
  const server = await createEnhancedServer(options);
  try {
    const res = await server.request.get(getDocumentUrl(testDbName, testURLCollectionName, getFirstDocumentId())).expect(200);
    return await body(res.text, htmlParser.parse(res.text));
  } finally {
    server.close();
  }
};

const upstreamIds = () => fs.readFileSync(new URL('../../lib/views/document.html', import.meta.url), 'utf8')
  .matchAll(/\bid="([^"{}]+)"/g).map((match) => match[1]).toArray();

describe('enhanced document page (shadow of lib/views/document.html)', () => {
  let db;
  before(async () => { db = await initializeDb(); });
  after(() => cleanAndCloseDb(db));

  it('is the designed page, titled with the document id', () => withPage({}, (text) => {
    expect(text).to.contain('<span class="me-eyebrow">Document');
    expect(text).to.match(/<h1 id="pageTitle"><span class="me-title-db">[^<]+ \/<\/span> [0-9a-f]{24}<\/h1>/);
  }));

  it('keeps every id and hook lib/scripts/document.js depends on', () => withPage({}, (text, root) => {
    expect(upstreamIds().filter((id) => !text.includes(`id="${id}"`))).to.deep.equal([]);
    expect(root.querySelector('.backButton')).to.not.equal(null);
    expect(text).to.contain('onclick="return onBackClick()"');
    expect(text).to.contain('onclick="return onSubmitClick()"');
    expect(root.querySelector('.deleteButtonDocument').closest('form').getAttribute('method')).to.equal('POST');
    expect(root.querySelector('#documentEditForm [name="_csrf"]')).to.not.equal(null);
    expect(root.querySelector('#documentEditForm [name="_method"]').getAttribute('value')).to.equal('put');
    expect(root.querySelector('#documentEditForm #document')).to.not.equal(null);
  }));

  it('lets Save submit the edit form from the header, which sits outside it', () => withPage({}, (text, root) => {
    const save = root.querySelector('.me-page-actions button[type="submit"][form="documentEditForm"]');
    expect(save).to.not.equal(null);
    expect(root.querySelector('.me-page-actions').closest('#documentEditForm')).to.equal(null);
  }));

  it('deletes through its own form, to the same URL as the edit form', () => withPage({}, (text, root) => {
    const edit = root.querySelector('#documentEditForm').getAttribute('action').split('?', 1)[0];
    const del = root.querySelector('.deleteButtonDocument').closest('form');
    expect(del.getAttribute('action')).to.equal(edit);
    expect(del.querySelector('[name="_method"]').getAttribute('value')).to.equal('delete');
    expect(del.closest('#documentEditForm')).to.equal(null);
  }));

  it('is read-only without Save, Delete or the delete modal', () => withPage({ options: { readOnly: true } }, (text, root) => {
    for (const hook of ['.deleteButtonDocument', '#confirm-document-delete', 'button[form="documentEditForm"]', '#documentEditForm [name="_method"]']) {
      expect(root.querySelector(hook), hook).to.equal(null);
    }
    expect(root.querySelector('#document').hasAttribute('readonly')).to.equal(true);
    expect(root.querySelector('.backButton')).to.not.equal(null);
  }));

  it('hides Delete but keeps Save when deleting is not permitted', () => withPage({ options: { noDelete: true } }, (text, root) => {
    expect(root.querySelector('.deleteButtonDocument')).to.equal(null);
    expect(root.querySelector('button[form="documentEditForm"]')).to.not.equal(null);
  }));
});
