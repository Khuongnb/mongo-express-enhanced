import { expect } from 'chai';

import formAuthPaths from '../../enhanced/features/formAuthPaths.js';

// `path` is what express derives from `url` once the base URL mount has been stripped
const run = (baseUrl, url) => {
  const req = { url, originalUrl: `${baseUrl}${url.slice(1)}`, path: url.split('?', 1)[0] };
  let called = false;
  formAuthPaths(baseUrl)(req, {}, () => { called = true; });
  expect(called).to.equal(true);
  return req;
};

describe('enhanced formAuthPaths', () => {
  const baseUrl = '/code-server/proxy/10081/';

  it('moves /login and /logout to the path upstream registered them at', () => {
    expect(run(baseUrl, '/login').url).to.equal('/code-server/proxy/10081/login');
    expect(run(baseUrl, '/logout').url).to.equal('/code-server/proxy/10081/logout');
  });

  it('keeps the query string', () => {
    expect(run(baseUrl, '/login?next=%2Fdb%2Fx').url).to.equal('/code-server/proxy/10081/login?next=%2Fdb%2Fx');
  });

  it('leaves originalUrl alone, since upstream compares it with the real path', () => {
    expect(run(baseUrl, '/login').originalUrl).to.equal('/code-server/proxy/10081/login');
  });

  it('leaves every other path alone', () => {
    for (const url of ['/', '/db/test/', '/login/extra', '/loginx', '/status']) {
      expect(run(baseUrl, url).url).to.equal(url);
    }
  });
});
