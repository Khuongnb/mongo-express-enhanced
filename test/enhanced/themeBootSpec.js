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
  const attributes = new Set();
  const root = { setAttribute: (name) => attributes.add(name), removeAttribute: (name) => attributes.delete(name) };
  const observers = [];
  class MutationObserver {
    options = null;

    constructor(callback) { this.callback = callback; observers.push(this); }

    observe(target, options) { this.options = options; }
  }
  const document = { body, documentElement: root, getElementById: (id) => ({ darkModeIcon: icon, navbar: nav })[id] };
  const context = vm.createContext({ document, localStorage, Storage, MutationObserver });
  return {
    body, icon, nav, localStorage, calls, Storage, upstream, root, attributes, observers,
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
    expect(scripts).to.have.length(3);
    // the canvas script is the first thing in <head>, ahead of every stylesheet whose download leaves the canvas white
    const [head, body, navbar] = [0, 1, 2].map((index) => html.indexOf(scripts[index]));
    expect(html.indexOf('<style>html[data-me-dark]')).to.be.lessThan(head);
    expect(head).to.be.lessThan(html.indexOf('<link'));
    expect(head).to.be.lessThan(html.indexOf('</head>'));
    // the body script is the first thing in <body>, the navbar one follows the navbar
    expect(body).to.be.greaterThan(html.indexOf('<body class="me-app">'));
    expect(body).to.be.lessThan(html.indexOf('<nav id="navbar"'));
    expect(navbar).to.be.greaterThan(html.indexOf('</nav>'));
    expect(navbar).to.be.lessThan(html.indexOf('<main class="me-main">'));
    // all of them run before upstream's vendor script
    expect(navbar).to.be.lessThan(html.indexOf('/vendor'));
  });

  // dark is the default: only a saved 'light' keeps the page light
  const DARK_BY = [['dark', 'saved dark'], [null, 'nothing saved'], ['blue', 'an unknown value'], ['', 'an empty value']];

  it('paints the canvas dark from the head script by default, and not when the saved choice is light', () => {
    for (const [stored, why] of DARK_BY) {
      const page = boot({ stored });
      page.run(scripts[0]);
      expect(page.attributes.has('data-me-dark'), why).to.equal(true);
    }
    const light = boot({ stored: 'light' });
    light.run(scripts[0]);
    expect(light.attributes.size).to.equal(0);
    expect(light.observers).to.have.length(0);
  });

  it('gives the canvas back to the body once the theme is switched to light', () => {
    const page = boot({ stored: 'dark' });
    page.run(scripts[0]);
    const [observer] = page.observers;
    expect(observer.options).to.include({ subtree: true, attributes: true });
    expect(observer.options.attributeFilter).to.deep.equal(['data-bs-theme']);
    // still dark, or the body not even there yet: the canvas stays dark
    page.body.dataset.bsTheme = 'dark';
    observer.callback();
    expect(page.attributes.has('data-me-dark')).to.equal(true);
    // the toggle switched to light: a dark `html` must not show behind a light body
    page.body.dataset.bsTheme = 'light';
    observer.callback();
    expect(page.attributes.has('data-me-dark')).to.equal(false);
  });

  it('still defaults to dark when storage cannot be read, since nothing can be saved', () => {
    const page = boot({ stored: 'light' });
    page.Storage.prototype.getItem = () => { throw new Error('denied'); };
    expect(() => page.run(scripts[0])).to.not.throw();
    expect(page.attributes.has('data-me-dark')).to.equal(true);
    expect(() => page.run(scripts[1])).to.not.throw();
    expect(page.body.dataset.bsTheme).to.equal('dark');
  });

  it('stays light, in the body, the icon and the navbar, when the saved choice is light', () => {
    const page = boot({ stored: 'light' });
    page.run(scripts[1]);
    page.run(scripts[2]);
    expect(page.body.dataset.bsTheme).to.equal(undefined);
    expect(page.icon.classList.names.has('fa-moon')).to.equal(true);
    expect(page.nav.classList.names.has('bg-light')).to.equal(true);
  });

  it('sets the body, the icon and the navbar to dark by default', () => {
    for (const [stored, why] of DARK_BY) {
      const page = boot({ stored });
      page.run(scripts[1]);
      expect(page.body.dataset.bsTheme, why).to.equal('dark');
      page.run(scripts[2]);
      expect([...page.icon.classList.names].sort(), why).to.deep.equal(['fa', 'fa-sun']);
      expect([...page.nav.classList.names].sort(), why).to.deep.equal(['bg-dark', 'navbar-dark']);
    }
  });

  it('hides "dark" from upstream\'s first read only, so its flip does not undo the theme, then reads for real again', () => {
    const page = boot({ stored: 'dark' });
    const original = page.Storage.prototype.getItem;
    page.run(scripts[1]);
    expect(page.Storage.prototype.getItem).to.not.equal(original);
    expect(page.localStorage.getItem('other')).to.equal(null);
    // upstream's script reads the theme: it sees nothing, so it does not toggle
    expect(page.localStorage.getItem('bsTheme')).to.equal(null);
    // and every later read is the real one, so the toggle button still saves and the next page load sees 'dark'
    expect(page.Storage.prototype.getItem).to.equal(original);
    expect(page.localStorage.getItem('bsTheme')).to.equal('dark');
  });

});
