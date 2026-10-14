#!/usr/bin/env node
// Generates enhanced/public/css/enhanced.css from the designer's stylesheet (enhanced/design/style.css) plus our adapters
// for upstream markup (enhanced/design/adapters.css), scoped to [data-me-enhanced].
//   node enhanced/tools/build-css.js           write the file
//   node enhanced/tools/build-css.js --check   exit 1 if the committed file is stale
import fs from 'node:fs';
import { buildEnhancedCss, outputPath } from './scopeCss.js';

const css = buildEnhancedCss();

if (process.argv[2] === '--check') {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== css) {
    console.error('enhanced/public/css/enhanced.css is stale — run `node enhanced/tools/build-css.js`');
    process.exit(1);
  }
} else {
  fs.writeFileSync(outputPath, css);
  console.log(`Wrote ${outputPath} (${css.length} bytes)`);
}
