import { expect } from 'chai';

import injectAssets from '../../enhanced/features/injectAssets.js';

const render = (body, { type = 'text/html; charset=utf-8', manifest } = {}) => {
  // type '' = Content-Type not set yet, which is the state res.render leaves it in
  let sent;
  const res = {
    get: () => type,
    send: (value) => { sent = value; return res; },
  };
  injectAssets({ assetsUrl: '/b/_enhanced/assets/', manifest })({}, res, () => {});
  res.send(body);
  return sent;
};

const page = '<html lang="en"><head><title>t</title></head><body>x</body></html>';

describe('enhanced injectAssets', () => {
  it('injects the stylesheet, the script and the scope attribute', () => {
    const html = render(page, { manifest: { enhanced: { js: 'enhanced-abc.min.js' } } });
    expect(html).to.contain('<html data-me-enhanced lang="en">');
    expect(html).to.contain('<link rel="stylesheet" href="/b/_enhanced/assets/css/enhanced.css">\n</head>');
    expect(html).to.contain('<script src="/b/_enhanced/assets/enhanced-abc.min.js"></script>\n</body>');
  });

  it('injects only the stylesheet when the bundle is not built', () => {
    const html = render(page);
    expect(html).to.contain('enhanced.css');
    expect(html).to.not.contain('<script');
  });

  it('injects when Content-Type is not set yet, as after res.render', () => {
    expect(render(page, { type: '' })).to.contain('data-me-enhanced');
  });

  it('is idempotent', () => {
    const once = render(page);
    expect(render(once)).to.equal(once);
  });

  it('leaves non-HTML and non-string bodies alone', () => {
    expect(render(page, { type: 'application/json' })).to.equal(page);
    const buffer = Buffer.from(page);
    expect(render(buffer)).to.equal(buffer);
  });
});
