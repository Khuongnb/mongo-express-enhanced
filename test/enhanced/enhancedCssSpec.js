import fs from 'node:fs';
import { expect } from 'chai';
// postcss is only a transitive dependency (css-loader); the CSS build tool uses it the same way.
/* eslint-disable import/no-extraneous-dependencies */
import postcss from 'postcss';
/* eslint-enable import/no-extraneous-dependencies */

import { buildEnhancedCss, outputPath, scopeCss, scopeSelector } from '../../enhanced/tools/scopeCss.js';

// The declarations the committed stylesheet gives one exact (already scoped) selector.
const declarations = (selector) => {
  const found = {};
  postcss.parse(fs.readFileSync(outputPath, 'utf8')).walkRules((rule) => {
    if (rule.selectors.includes(selector)) rule.walkDecls((declaration) => { found[declaration.prop] = declaration.value; });
  });
  return found;
};

describe('enhanced css scoping', () => {
  it('maps :root onto the <html> attribute and html onto itself', () => {
    expect(scopeSelector(':root')).to.equal('[data-me-enhanced]');
    expect(scopeSelector('html')).to.equal('html[data-me-enhanced]');
    expect(scopeSelector('html.dark .x')).to.equal('html[data-me-enhanced].dark .x');
  });

  it('prefixes everything else, including the theme attribute and body (a descendant of <html>)', () => {
    expect(scopeSelector('.btn')).to.equal('[data-me-enhanced] .btn');
    expect(scopeSelector('[data-bs-theme="dark"] .card')).to.equal('[data-me-enhanced] [data-bs-theme="dark"] .card');
    expect(scopeSelector('body.me-app')).to.equal('[data-me-enhanced] body.me-app');
    expect(scopeSelector('htmlish')).to.equal('[data-me-enhanced] htmlish');
  });

  it('scopes every selector of a list, inside media queries too, and leaves keyframes alone', () => {
    const out = scopeCss(':root, .a { color: red } @media (max-width: 10px) { .b, .c { color: blue } } '
      + '@keyframes spin { from { opacity: 0 } 50% { opacity: .5 } to { opacity: 1 } }');
    expect(out).to.match(/\[data-me-enhanced\],\s*\[data-me-enhanced\] \.a/);
    expect(out).to.match(/\[data-me-enhanced\] \.b,\s*\[data-me-enhanced\] \.c/);
    expect(out).to.match(/@keyframes spin\s*\{\s*from\s*\{/);
    expect(out).to.not.contain('[data-me-enhanced] from');
  });

  describe('the committed stylesheet', () => {
    it('is up to date with enhanced/design (run `node enhanced/tools/build-css.js`)', () => {
      expect(fs.readFileSync(outputPath, 'utf8')).to.equal(buildEnhancedCss());
    });

    it('has no unscoped selector and none of the design canvas scaffolding', () => {
      const css = fs.readFileSync(outputPath, 'utf8');
      const unscoped = [];
      postcss.parse(css).walkRules((rule) => {
        if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
        for (const selector of rule.selectors) if (!selector.includes('[data-me-enhanced]')) unscoped.push(selector);
      });
      expect(unscoped).to.deep.equal([]);
      expect(css).to.not.contain('Component-sheet scaffolding');
    });

    it('keeps the documents table header in view while its rows scroll', () => {
      // sticks to the container that scrolls sideways, so that container must also be what scrolls up and down
      const scroller = declarations('[data-me-enhanced] .me-docs-card .me-table-scroll');
      expect(scroller['max-height']).to.match(/^calc\(100vh - \d+px\)$/);
      expect(scroller['overflow-y']).to.equal('auto');
      const header = declarations('[data-me-enhanced] .me-docs-card .table-documents > thead > tr > th');
      expect(header).to.include({ position: 'sticky', top: '0' });
      // the _id header is the corner of the sticky header and the sticky first column, so it sits above both
      const corner = declarations('[data-me-enhanced] .me-docs-card .table-documents > thead > tr > th:first-child');
      expect(Number(corner['z-index'])).to.be.greaterThan(Number(header['z-index']));
    });
  });
});
