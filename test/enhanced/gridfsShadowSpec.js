/* eslint-disable unicorn/prefer-scoped-selector -- node-html-parser's document root has no :scope */
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { GridFSBucket } from 'mongodb';
import { expect } from 'chai';
import htmlParser from 'node-html-parser';

import { cleanAndCloseDb, initializeDb, testDbName } from '../testMongoUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

const bucketName = 'fs';
const file = { name: 'seeded.txt', body: 'seeded gridfs content', type: 'text/plain' };

const upload = (client) => new Promise((resolve, reject) => {
  const stream = new GridFSBucket(client.db(), { bucketName }).openUploadStream(file.name, { metadata: { contentType: file.type } });
  Readable.from([Buffer.from(file.body)]).pipe(stream).on('finish', () => resolve(stream.id)).on('error', reject);
});

// ids inside HTML comments (upstream's disabled "Rename Bucket" block) are not on the page
const upstreamIds = () => fs.readFileSync(new URL('../../lib/views/gridfs.html', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/g, '')
  .matchAll(/\bid="([^"{}]+)"/g).map((match) => match[1]).toArray();

const withPage = async (options, body) => {
  const server = await createEnhancedServer(options);
  try {
    const res = await server.request.get(`/db/${testDbName}/gridFS/${bucketName}`).expect(200);
    return await body(res.text, htmlParser.parse(res.text));
  } finally {
    server.close();
  }
};

describe('enhanced GridFS page (shadow of lib/views/gridfs.html)', () => {
  let client;
  let fileId;
  before(async () => {
    client = await initializeDb();
    fileId = await upload(client);
  });
  after(async () => {
    await client.db().collection(`${bucketName}.files`).drop().catch(() => {});
    await client.db().collection(`${bucketName}.chunks`).drop().catch(() => {});
    await cleanAndCloseDb(client);
  });

  it('is the designed page, with the file listed and its type in its own column', () => withPage({}, (text, root) => {
    expect(text).to.contain('<span class="me-eyebrow">GridFS bucket</span>');
    expect(text).to.contain(file.name);
    expect(root.querySelectorAll('th').map((th) => th.text.trim())).to.include.members(['filename', 'contentType', 'Actions']);
    expect(text).to.not.match(/<th scope="col"><div class="me-th"><span class="me-th-name">metadata</);
    expect(upstreamIds().filter((id) => !text.includes(`id="${id}"`))).to.deep.equal([]);
  }));

  it('keeps the row handler and the upload form upstream\'s routes expect', () => withPage({}, (text, root) => {
    expect(root.querySelector('tbody tr').getAttribute('onclick')).to.equal(`loadFile('${encodeURIComponent(JSON.stringify(fileId.toString()))}')`);
    const form = root.querySelector('form[enctype="multipart/form-data"]');
    expect(form.getAttribute('method')).to.equal('POST');
    expect(form.getAttribute('action')).to.equal(`/db/${testDbName}/gridFS/${bucketName}/`);
    expect(form.querySelector('input[name="filefield"]').getAttribute('type')).to.equal('file');
    expect(form.querySelector('[name="_csrf"]')).to.not.equal(null);
  }));

  it('offers a real download link and a delete form that asks for a second click', () => withPage({}, (text, root) => {
    const link = root.querySelector('tbody a[aria-label="Download file"]');
    expect(link.getAttribute('href')).to.equal(`/db/${testDbName}/gridFS/${bucketName}/${encodeURIComponent(JSON.stringify(fileId.toString()))}`);
    const del = root.querySelector('tbody form [data-me-confirm-click]');
    expect(del.getAttribute('type')).to.equal('submit');
    expect(del.closest('form').querySelector('[name="_method"]').getAttribute('value')).to.equal('delete');
  }));

  it('shows the file count and size in the header', () => withPage({}, (text, root) => {
    expect(root.querySelector('.me-meta').text).to.match(/1\s+files/).and.to.contain('total');
  }));

  it('has no upload, no delete in read-only mode, but still lists and downloads', () => withPage({ options: { readOnly: true } }, (text, root) => {
    expect(root.querySelector('form[enctype="multipart/form-data"]')).to.equal(null);
    expect(root.querySelector('[data-me-confirm-click]')).to.equal(null);
    expect(root.querySelector('tbody a[aria-label="Download file"]')).to.not.equal(null);
  }));

  it('hides only Delete when deleting is not permitted', () => withPage({ options: { noDelete: true } }, (text, root) => {
    expect(root.querySelector('[data-me-confirm-click]')).to.equal(null);
    expect(root.querySelector('form[enctype="multipart/form-data"]')).to.not.equal(null);
  }));
});
