import { expect } from 'chai';

import { cleanAndCloseDb, initializeDb } from '../testMongoUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

const withServer = async (options, body) => {
  const server = await createEnhancedServer(options);
  try {
    return await body(server.request);
  } finally {
    server.close();
  }
};

const credentials = (password) => ({ username: 'u', password });

describe('enhanced app', () => {
  let db;
  before(async () => { db = await initializeDb(); });
  after(() => cleanAndCloseDb(db));

  it('serves upstream pages with the enhanced assets injected', () => withServer({}, (request) => request.get('/').expect(200)
    .then((res) => {
      expect(res.text).to.contain('<html data-me-enhanced');
      expect(res.text).to.contain('href="/_enhanced/assets/css/enhanced.css"');
      expect(res.text).to.match(/<title>Home - Mongo Express<\/title>/);
    })));

  it('serves enhanced assets', () => withServer({}, (request) => request.get('/_enhanced/assets/css/enhanced.css')
    .expect(200).expect('Content-Type', /css/)));

  it('does not inject when injectAssets is off', () => withServer({ enhanced: { injectAssets: false } },
    (request) => request.get('/').expect(200).then((res) => expect(res.text).to.not.contain('data-me-enhanced'))));

  describe('behind a proxy that strips the base URL prefix', () => {
    const site = { baseUrl: '/code-server/proxy/10081/' };
    const enhanced = { proxyStripsBaseUrl: true };

    it('routes stripped requests and keeps generated links prefixed', () => withServer({ site, enhanced },
      (request) => request.get('/').expect(200).then((res) => {
        expect(res.text).to.contain('<base href="/code-server/proxy/10081/">');
        expect(res.text).to.contain('href="/code-server/proxy/10081/_enhanced/assets/css/enhanced.css"');
      })));

    it('still routes requests that already carry the prefix', () => withServer({ site, enhanced },
      (request) => request.get('/code-server/proxy/10081/').expect(200)));

    it('serves enhanced assets for stripped requests', () => withServer({ site, enhanced },
      (request) => request.get('/_enhanced/assets/css/enhanced.css').expect(200)));

    it('404s unprefixed requests when the setting is off', () => withServer({ site },
      (request) => request.get('/').expect(404)));
  });

  describe('authentication', () => {
    const auth = { username: 'u', password: 'p' };

    it('protects pages and enhanced assets alike', () => withServer({ auth }, async (request) => {
      await request.get('/').expect(401);
      await request.get('/_enhanced/assets/css/enhanced.css').expect(401);
      await request.get('/_enhanced/assets/css/enhanced.css').auth('u', 'p').expect(200);
    }));
  });

  describe('form sign-in', () => {
    const auth = { username: 'u', password: 'p' };

    // Upstream registers /login and /logout at `${baseUrl}login`, which only matches at a doubled path once the
    // router is mounted under baseUrl. Without the formAuthPaths shim the page is a 404 and every request loops to it.
    describe('under a base URL, behind a proxy that strips it', () => {
      const site = { baseUrl: '/code-server/proxy/10081/' };
      const enhanced = { proxyStripsBaseUrl: true };
      const options = { site, enhanced, auth, authStrategy: 'form' };
      const loginUrl = '/code-server/proxy/10081/login';

      it('sends signed-out requests to a sign-in page that exists', () => withServer(options, async (request) => {
        await request.get('/').expect(302).expect('Location', loginUrl);
        await request.get('/login').expect(200).then((res) => expect(res.text).to.contain('name="username"'));
        await request.get(loginUrl).expect(200);
      }));

      it('rejects a wrong password and stays signed out', () => withServer(options, async (request) => {
        await request.post('/login').type('form').send(credentials('nope')).expect(302).expect('Location', loginUrl);
        await request.get('/').expect(302).expect('Location', loginUrl);
      }));

      it('signs in, serves pages, then signs out', () => withServer(options, async (request) => {
        await request.post('/login').type('form').send(credentials('p')).expect(302)
          .expect('Location', '/code-server/proxy/10081/');
        await request.get('/').expect(200);
        await request.get('/logout').expect(302).expect('Location', loginUrl);
        await request.get('/').expect(302).expect('Location', loginUrl);
      }));

      it('keeps the health check reachable while signed out', () => withServer(options,
        (request) => request.get('/status').expect(200)));
    });

    it('still works at the root base URL, where no rewrite is needed', () => withServer(
      { auth, authStrategy: 'form' },
      async (request) => {
        await request.get('/').expect(302).expect('Location', '/login');
        await request.get('/login').expect(200);
        await request.post('/login').type('form').send(credentials('p')).expect(302);
        await request.get('/').expect(200);
        await request.get('/logout').expect(302).expect('Location', '/login');
      },
    ));
  });
});
