/* eslint-disable unicorn/prefer-scoped-selector -- node-html-parser's document root has no :scope */
import { expect } from 'chai';
import htmlParser from 'node-html-parser';

import { cleanAndCloseDb, initializeDb } from '../testMongoUtils.js';
import { revealState } from '../../enhanced/scripts/signinPage.js';
import { createEnhancedServer } from './enhancedServer.js';

const auth = { username: 'u', password: 'p' };
const options = { auth, authStrategy: 'form' };

const withServer = async (body) => {
  const server = await createEnhancedServer(options);
  try {
    return await body(server.request);
  } finally {
    server.close();
  }
};

describe('enhanced sign-in page (shadow of lib/views/signin.html)', () => {
  let db;
  before(async () => { db = await initializeDb(); });
  after(() => cleanAndCloseDb(db));

  it('is the designed page with the form upstream posts', () => withServer(async (request) => {
    const res = await request.get('/login').expect(200);
    const root = htmlParser.parse(res.text);
    expect(root.querySelector('.me-auth-card')).to.not.equal(null);
    const form = root.querySelector('form');
    expect(form.getAttribute('method')).to.equal('POST');
    expect(form.getAttribute('action')).to.equal('/login');
    expect(root.querySelector('form [name="_csrf"]')).to.not.equal(null);
    const username = root.querySelector('#username');
    const password = root.querySelector('#password');
    expect(username.getAttribute('name')).to.equal('username');
    expect(username.getAttribute('autocomplete')).to.equal('username');
    expect(username.hasAttribute('autofocus')).to.equal(true);
    expect(password.getAttribute('name')).to.equal('password');
    expect(password.getAttribute('type')).to.equal('password');
    expect(password.getAttribute('autocomplete')).to.equal('current-password');
  }));

  it('has no page header, no navigation chrome beyond the bar, and no logout button', () => withServer(async (request) => {
    const { text } = await request.get('/login').expect(200);
    expect(text).to.not.contain('class="me-page-header"');
    expect(text).to.not.contain('aria-label="Log out"');
  }));

  it('shows a rejected sign-in once, inside the card and not twice', () => withServer(async (request) => {
    await request.post('/login').type('form').send({ username: 'u', password: 'nope' }).expect(302);
    const { text } = await request.get('/login').expect(200);
    const root = htmlParser.parse(text);
    expect(root.querySelectorAll('.alert')).to.have.length(1);
    expect(root.querySelector('.me-auth-card .alert-danger').text).to.contain('Invalid username or password.');
  }));

  it('keeps the layout\'s dismissible alerts for every other page', () => withServer(async (request) => {
    await request.post('/login').type('form').send({ username: 'u', password: 'p' }).expect(302);
    await request.get('/db/none/').expect(302);
    const { text } = await request.get('/').expect(200);
    expect(text).to.contain('Database not found!');
    expect(text).to.contain('alert alert-danger alert-dismissible');
  }));

  it('only offers the password toggle hidden, for the script to reveal', () => withServer(async (request) => {
    const { text } = await request.get('/login').expect(200);
    expect(htmlParser.parse(text).querySelector('[data-me-reveal]').hasAttribute('hidden')).to.equal(true);
  }));

  describe('password toggle state', () => {
    it('shows the text and offers to hide it', () => {
      expect(revealState(true)).to.include({ type: 'text', label: 'Hide password', pressed: 'true' });
    });

    it('hides the text and offers to show it', () => {
      expect(revealState(false)).to.include({ type: 'password', label: 'Show password', pressed: 'false' });
    });
  });
});
