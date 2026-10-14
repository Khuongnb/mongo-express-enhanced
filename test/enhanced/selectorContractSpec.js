import { expect } from 'chai';
import { parse } from 'node-html-parser';

import { SELECTORS, contract } from '../../enhanced/selectors.js';
import { cleanAndCloseDb, initializeDb } from '../testMongoUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

// Server-rendered markup only: selectors for DOM built by browser JS can't be checked here (use Cypress for those).
describe('enhanced selector contract', () => {
  let db;
  let server;
  before(async () => {
    db = await initializeDb();
    server = await createEnhancedServer();
  });
  after(() => Promise.all([cleanAndCloseDb(db), server.close()]));

  for (const { path, selectors } of contract) {
    for (const name of selectors) {
      it(`${path} still has ${name} (${SELECTORS[name]})`, async () => {
        const { text } = await server.request.get(path).expect(200);
        expect(parse(text).querySelector(SELECTORS[name]), `${SELECTORS[name]} missing from ${path}`).to.not.equal(null);
      });
    }
  }
});
