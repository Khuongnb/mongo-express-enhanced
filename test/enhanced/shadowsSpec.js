import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';

import { checkShadows, recordShadow } from '../../enhanced/tools/shadows.js';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

describe('enhanced shadow manifest', () => {
  it('has no shadow drifted from upstream (re-merge the shadow, then `node enhanced/tools/check-shadows.js --update <path>`)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'enhanced/shadows.json'), 'utf8'));
    expect(checkShadows({ manifest })).to.deep.equal([]);
  });

  describe('drift detection', () => {
    let root;
    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'shadows-'));
      fs.mkdirSync(path.join(root, 'lib/views'), { recursive: true });
      fs.mkdirSync(path.join(root, 'enhanced/views'), { recursive: true });
      fs.writeFileSync(path.join(root, 'lib/views/a.html'), 'v1');
      fs.writeFileSync(path.join(root, 'enhanced/views/a.html'), 'mine');
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    const recorded = () => recordShadow({ manifest: { shadows: [] }, upstream: 'lib/views/a.html', root });

    it('passes right after recording', () => {
      expect(checkShadows({ manifest: recorded(), root })).to.deep.equal([]);
    });

    it('reports an upstream change, and accepts it once re-recorded', () => {
      const manifest = recorded();
      fs.writeFileSync(path.join(root, 'lib/views/a.html'), 'v2');
      expect(checkShadows({ manifest, root })).to.have.length(1);
      expect(checkShadows({ manifest, root })[0]).to.contain('changed upstream');
      recordShadow({ manifest, upstream: 'lib/views/a.html', root });
      expect(manifest.shadows).to.have.length(1);
      expect(checkShadows({ manifest, root })).to.deep.equal([]);
    });

    it('reports a removed upstream template and a missing shadow', () => {
      const manifest = recorded();
      fs.rmSync(path.join(root, 'enhanced/views/a.html'));
      expect(checkShadows({ manifest, root })[0]).to.contain('shadow file is missing');
      fs.rmSync(path.join(root, 'lib/views/a.html'));
      expect(checkShadows({ manifest, root })[0]).to.contain('no longer exists');
    });
  });
});
