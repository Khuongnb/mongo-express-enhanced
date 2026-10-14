#!/usr/bin/env node
// Drift guard for shadowed templates (UI tier 4). A shadow in enhanced/views/ silently ignores upstream fixes to the
// template it replaces, so enhanced/shadows.json records the sha256 of each upstream template as it was when the
// shadow was last reconciled. This fails when upstream's file differs — re-merge the shadow, then record it again:
//   node enhanced/tools/check-shadows.js                            check, exit 1 on drift
//   node enhanced/tools/check-shadows.js --update <upstream path>   record the current hash (adds the entry if new)
import fs from 'node:fs';
import { checkShadows, manifestPath, recordShadow } from './shadows.js';

const readManifest = () => JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const [flag, target] = process.argv.slice(2);

if (flag === '--update') {
  const manifest = recordShadow({ manifest: readManifest(), upstream: target });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`);
  console.log(`Recorded ${target}`);
} else {
  const problems = checkShadows({ manifest: readManifest() });
  for (const problem of problems) console.error(problem);
  process.exit(problems.length > 0 ? 1 : 0);
}
