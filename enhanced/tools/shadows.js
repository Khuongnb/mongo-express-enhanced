// Library for the shadow drift guard — see check-shadows.js for what it is and how to use it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const rootDir = path.resolve(import.meta.dirname, '../..');
export const manifestPath = path.join(rootDir, 'enhanced/shadows.json');

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export const checkShadows = ({ manifest, root = rootDir }) => manifest.shadows.flatMap((entry) => {
  const upstream = path.join(root, entry.upstream);
  const shadow = path.join(root, entry.shadow);
  if (!fs.existsSync(upstream)) return [`${entry.upstream}: upstream template no longer exists (shadow ${entry.shadow})`];
  if (!fs.existsSync(shadow)) return [`${entry.shadow}: shadow file is missing`];
  if (sha256(upstream) !== entry.upstreamSha256) {
    return [`${entry.upstream}: changed upstream since ${entry.shadow} was last reconciled`];
  }
  return [];
});

export const recordShadow = ({ manifest, upstream, root = rootDir }) => {
  const shadow = upstream.replace(/^lib\/views\//, 'enhanced/views/');
  const upstreamSha256 = sha256(path.join(root, upstream));
  const existing = manifest.shadows.find((entry) => entry.upstream === upstream);
  if (existing) existing.upstreamSha256 = upstreamSha256;
  else manifest.shadows.push({ upstream, shadow, upstreamSha256 });
  return manifest;
};
