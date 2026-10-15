import { expect } from 'chai';
import htmlParser from 'node-html-parser';

import { resolveEnhancedConfig } from '../../enhanced/config.js';
import { resolveCollapsed, unfoldLevel } from '../../enhanced/features/jsonView.js';
import {
  cleanAndCloseDb, initializeDb, testDbName, testURLCollectionName,
} from '../testMongoUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

describe('enhanced collapse JSON: the pure parts', () => {
  it('follows the toggle\'s cookie, then the configured default', () => {
    expect(resolveCollapsed({ cookie: '1', fallback: false })).to.equal(true);
    expect(resolveCollapsed({ cookie: '0', fallback: true })).to.equal(false);
    for (const cookie of [undefined, '', 'yes', '2']) expect(resolveCollapsed({ cookie, fallback: true }), String(cookie)).to.equal(true);
    expect(resolveCollapsed({ fallback: false })).to.equal(false);
  });

  it('unfolds at least one level when not collapsed, or the toggle would change nothing', () => {
    expect(unfoldLevel(0)).to.equal(1);
    expect(unfoldLevel()).to.equal(1);
    expect(unfoldLevel('abc')).to.equal(1);
    expect(unfoldLevel(1)).to.equal(1);
    expect(unfoldLevel(3)).to.equal(3);
    expect(unfoldLevel('2')).to.equal(2);
  });

  it('starts collapsed unless ME_CONFIG_ENHANCED_JSON_COLLAPSED or the enhanced settings say otherwise', () => {
    const before = process.env.ME_CONFIG_ENHANCED_JSON_COLLAPSED;
    try {
      delete process.env.ME_CONFIG_ENHANCED_JSON_COLLAPSED;
      expect(resolveEnhancedConfig({}).jsonCollapsed).to.equal(true);
      process.env.ME_CONFIG_ENHANCED_JSON_COLLAPSED = 'false';
      expect(resolveEnhancedConfig({}).jsonCollapsed).to.equal(false);
      expect(resolveEnhancedConfig({ enhanced: { jsonCollapsed: true } }).jsonCollapsed).to.equal(true);
    } finally {
      if (before === undefined) delete process.env.ME_CONFIG_ENHANCED_JSON_COLLAPSED;
      else process.env.ME_CONFIG_ENHANCED_JSON_COLLAPSED = before;
    }
  });
});

describe('enhanced collapse JSON: the collection page', () => {
  const pagePath = `/db/${testDbName}/${testURLCollectionName}`;
  let db;
  before(async () => { db = await initializeDb(); });
  after(() => cleanAndCloseDb(db));

  // The level upstream's script reads, and the switch's state, for one request.
  const page = async ({ options = { collapsibleJSON: true }, enhanced, cookie } = {}) => {
    const server = await createEnhancedServer({ options, enhanced });
    try {
      const request = server.request.get(pagePath);
      if (cookie) request.set('Cookie', cookie);
      const res = await request.expect(200);
      const root = htmlParser.parse(res.text);
      const toggle = root.querySelector('[data-me-json-toggle]');
      return {
        unfold: Number(/collapsibleJSONDefaultUnfold: Number\.parseInt\('(\d+)'/.exec(res.text)?.[1]),
        toggle,
        checked: toggle?.hasAttribute('checked'),
        hidden: root.querySelector('[data-me-json-switch]')?.hasAttribute('hidden'),
      };
    } finally {
      server.close();
    }
  };

  it('collapses every JSON value by default (upstream unfolds the first level)', async () => {
    const { unfold, checked } = await page();
    expect(unfold).to.equal(0);
    expect(checked).to.equal(true);
  });

  it('unfolds one level once the toggle is turned off, and remembers it from the cookie', async () => {
    const { unfold, checked } = await page({ cookie: 'a=1; me_json_collapsed=0' });
    expect(unfold).to.equal(1);
    expect(checked).to.equal(false);
  });

  it('keeps a deeper unfold level the config asked for, when not collapsed', async () => {
    const { unfold } = await page({ options: { collapsibleJSON: true, collapsibleJSONDefaultUnfold: 3 }, cookie: 'me_json_collapsed=0' });
    expect(unfold).to.equal(3);
  });

  it('lets the enhanced setting start expanded, with the cookie still winning', async () => {
    const byDefault = await page({ enhanced: { jsonCollapsed: false } });
    const withCookie = await page({ enhanced: { jsonCollapsed: false }, cookie: 'me_json_collapsed=1' });
    expect(byDefault.unfold).to.equal(1);
    expect(withCookie.unfold).to.equal(0);
  });

  it('renders the switch hidden, for the script to reveal once a JSON value is on the page', async () => {
    const { hidden } = await page();
    expect(hidden).to.equal(true);
  });

  it('has no switch when upstream\'s collapsible JSON is turned off', async () => {
    const { toggle } = await page({ options: { collapsibleJSON: false } });
    expect(toggle).to.equal(null);
  });
});
