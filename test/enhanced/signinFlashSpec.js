import { expect } from 'chai';

import signinFlash from '../../enhanced/features/signinFlash.js';

const run = (session, view = 'signin', options = {}) => {
  const calls = [];
  const res = { render: (...args) => { calls.push(args); } };
  signinFlash('/base/')({ session }, res, () => {});
  res.render(view, { csrfToken: 't', ...options });
  return { calls, session };
};

describe('enhanced signinFlash', () => {
  it('passes the pending error to the sign-in page and clears it', () => {
    const { calls, session } = run({ error: 'Invalid username or password.' });
    expect(calls[0][1]).to.include({ messageError: 'Invalid username or password.', csrfToken: 't' });
    expect(session).to.not.have.property('error');
  });

  it('passes a pending success message too', () => {
    expect(run({ success: 'Signed out.' }).calls[0][1]).to.include({ messageSuccess: 'Signed out.' });
  });

  it('gives the page a base URL, without overriding one that is set', () => {
    expect(run({}).calls[0][1].baseHref).to.equal('/base/');
    expect(run({}, 'signin', { baseHref: '/own/' }).calls[0][1].baseHref).to.equal('/own/');
  });

  it('leaves every other view and its pending messages alone', () => {
    const { calls, session } = run({ error: 'keep me' }, 'index');
    expect(calls[0][1]).to.deep.equal({ csrfToken: 't' });
    expect(session.error).to.equal('keep me');
  });

  it('tolerates a request without a session', () => {
    expect(run(null).calls[0][1]).to.include({ baseHref: '/base/' });
  });
});
