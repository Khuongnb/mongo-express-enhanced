import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'chai';

// A bare `config.js` entry in .gitignore also matches enhanced/config.js, which let the file go uncommitted: every test passed
// on the author's disk while a fresh clone (and the Docker image built from one) could not start. This guards that class of bug.
const IMPORT = /(?:from|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;

const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return ['build', 'node_modules'].includes(entry.name) ? [] : sources(full);
  return /\.m?js$/.test(entry.name) ? [full] : [];
});

describe('enhanced layer is fully committed', () => {
  let tracked;
  before(() => {
    try {
      tracked = new Set(execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n'));
    } catch {
      tracked = null; // not a git checkout (an npm tarball): nothing to compare with
    }
  });

  it('tracks every local file the enhanced code imports', function () {
    if (!tracked) this.skip();
    const missing = [];
    const files = [...sources('enhanced'), ...sources('test/enhanced')];
    for (const file of files) {
      for (const [, specifier] of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
        const target = path.normalize(path.join(path.dirname(file), specifier));
        if (fs.existsSync(target) && fs.statSync(target).isFile() && !tracked.has(target)) missing.push(`${file} -> ${target}`);
      }
    }
    expect(missing, 'imported but not in git (ignored by .gitignore?)').to.deep.equal([]);
  });
});
