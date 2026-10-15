import vm from 'node:vm';
import { expect } from 'chai';

import { cleanAndCloseDb, initializeDb, testDbName, testURLCollectionName } from '../testMongoUtils.js';
import { createEnhancedServer } from './enhancedServer.js';

const fakeClassList = (initial = []) => {
  const names = new Set(initial);
  return {
    names,
    add: (...list) => { for (const name of list) names.add(name); },
    remove: (...list) => { for (const name of list) names.delete(name); },
  };
};

// Runs the layout's two inline scripts the way the browser would: the first with the body only, the second once the navbar exists.
const boot = ({ stored, upstream }) => {
  const calls = [];
  class Storage {
    getItem(key) { calls.push(key); return key === 'bsTheme' ? stored : null; }
  }
  const localStorage = new Storage();
  const body = { dataset: {} };
  const icon = { classList: fakeClassList(['fa', 'fa-moon']) };
  const nav = { classList: fakeClassList(['navbar-light', 'bg-light']) };
  const document = { body, getElementById: (id) => ({ darkModeIcon: icon, navbar: nav })[id] };
  const context = vm.createContext({ document, localStorage, Storage });
  return {
    body, icon, nav, localStorage, calls, Storage, upstream,
    run: (script) => vm.runInContext(script, context),
  };
};

describe('enhanced dark theme before first paint', () => {
  const pagePath = `/db/${testDbName}/${testURLCollectionName}`;
  let db;
  let html;
  let scripts;
  before(async () => {
    db = await initializeDb();
    const server = await createEnhancedServer();
    try {
      const res = await server.request.get(pagePath).expect(200);
      html = res.text;
    } finally {
      server.close();
    }
    scripts = html.matchAll(/<script>([\s\S]*?)<\/script>/g).map((match) => match[1]).toArray();
  });
  after(() => cleanAndCloseDb(db));

  it('puts both scripts in the markup, before the page content, so nothing paints light first', () => {
    expect(scripts).to.have.length(2);
    expect(html.indexOf('<script>')).to.be.greaterThan(html.indexOf('<body class="me-app">'));
    expect(html.indexOf('<script>')).to.be.lessThan(html.indexOf('<nav id="navbar"'));
    expect(html.indexOf('</nav>')).to.be.lessThan(html.lastIndexOf('<script>', html.indexOf('<main class="me-main">')));
    expect(html.indexOf('<main class="me-main">')).to.be.greaterThan(html.indexOf('</nav>'));
    // they run before upstream's vendor script
    expect(html.indexOf('<script>')).to.be.lessThan(html.indexOf('/vendor'));
  });

  it('does nothing when the saved theme is not dark', () => {
    for (const stored of [null, 'light', 'blue']) {
      const page = boot({ stored });
      page.run(scripts[0]);
      page.run(scripts[1]);
      expect(page.body.dataset.bsTheme, String(stored)).to.equal(undefined);
      expect(page.icon.classList.names.has('fa-moon')).to.equal(true);
      expect(page.nav.classList.names.has('bg-light')).to.equal(true);
    }
  });

  it('sets the body, the icon and the navbar to dark when the saved theme is dark', () => {
    const page = boot({ stored: 'dark' });
    page.run(scripts[0]);
    expect(page.body.dataset.bsTheme).to.equal('dark');
    page.run(scripts[1]);
    expect([...page.icon.classList.names].sort()).to.deep.equal(['fa', 'fa-sun']);
    expect([...page.nav.classList.names].sort()).to.deep.equal(['bg-dark', 'navbar-dark']);
  });

  it('hides "dark" from upstream\'s first read only, so its flip does not undo the theme, then reads for real again', () => {
    const page = boot({ stored: 'dark' });
    const original = page.Storage.prototype.getItem;
    page.run(scripts[0]);
    expect(page.Storage.prototype.getItem).to.not.equal(original);
    expect(page.localStorage.getItem('other')).to.equal(null);
    // upstream's script reads the theme: it sees nothing, so it does not toggle
    expect(page.localStorage.getItem('bsTheme')).to.equal(null);
    // and every later read is the real one, so the toggle button still saves and the next page load sees 'dark'
    expect(page.Storage.prototype.getItem).to.equal(original);
    expect(page.localStorage.getItem('bsTheme')).to.equal('dark');
  });

  it('leaves the page to upstream\'s script when storage cannot be read', () => {
    const page = boot({ stored: 'dark' });
    page.Storage.prototype.getItem = () => { throw new Error('denied'); };
    expect(() => page.run(scripts[0])).to.not.throw();
    expect(page.body.dataset.bsTheme).to.equal(undefined);
  });
});
