import { expect } from 'chai';

import { createSaveHandler } from '../../enhanced/scripts/documentPage.js';

const setup = (verdict) => {
  const log = [];
  const handler = createSaveHandler({
    clearError: () => { log.push('clear'); },
    syncEditor: () => { log.push('sync'); },
    readText: () => "{ client: ObjectId('6a7432c6c732668f5d9b7a32') }",
    validate: async (text) => {
      log.push(`validate:${text}`);
      if (verdict === 'network') throw new Error('network');
      return verdict;
    },
    submit: () => { log.push('submit'); },
    showError: (message) => { log.push(`error:${message}`); },
  });
  return { handler, log };
};

describe('enhanced document save', () => {
  it('sends the editor text, extended JSON included, to the server and submits when it is valid', async () => {
    const { handler, log } = setup('Valid');
    expect(await handler()).to.equal(true);
    expect(log).to.deep.equal(['clear', 'sync', "validate:{ client: ObjectId('6a7432c6c732668f5d9b7a32') }", 'submit']);
  });

  it('does not submit when the server says invalid, and says so', async () => {
    const { handler, log } = setup('Invalid');
    expect(await handler()).to.equal(false);
    expect(log).to.not.include('submit');
    expect(log).to.include('error:Invalid JSON');
  });

  it('does not submit when the check itself fails, and says so differently', async () => {
    const { handler, log } = setup('network');
    expect(await handler()).to.equal(false);
    expect(log).to.not.include('submit');
    expect(log).to.include('error:Could not check the document. Please try again.');
  });

  it('syncs the editor before reading the text', async () => {
    const { handler, log } = setup('Valid');
    await handler();
    expect(log.indexOf('sync')).to.be.lessThan(log.findIndex((entry) => entry.startsWith('validate')));
  });
});
