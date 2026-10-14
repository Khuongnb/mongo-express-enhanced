import { expect } from 'chai';

import stripPrefix from '../../enhanced/features/stripPrefix.js';

const run = (baseUrl, url) => {
  const req = { url, originalUrl: url };
  let called = false;
  stripPrefix(baseUrl)(req, {}, () => { called = true; });
  expect(called).to.equal(true);
  return req;
};

describe('enhanced stripPrefix', () => {
  it('re-adds the prefix to url and originalUrl when the proxy removed it', () => {
    const req = run('/proxy/10081/', '/db/test/?x=1');
    expect(req.url).to.equal('/proxy/10081/db/test/?x=1');
    expect(req.originalUrl).to.equal('/proxy/10081/db/test/?x=1');
  });

  it('re-adds the prefix to the root path', () => {
    expect(run('/proxy/10081/', '/').url).to.equal('/proxy/10081/');
  });

  it('leaves requests that already carry the prefix untouched', () => {
    for (const url of ['/proxy/10081', '/proxy/10081/', '/proxy/10081/db/x', '/proxy/10081?a=1']) {
      expect(run('/proxy/10081/', url).url).to.equal(url);
    }
  });

  it('does not mistake a path that merely starts with the prefix text for prefixed', () => {
    expect(run('/proxy/10081/', '/proxy/100810/x').url).to.equal('/proxy/10081/proxy/100810/x');
  });
});
