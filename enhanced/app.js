import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import csrf from 'csurf';
import express from 'express';
import { isFormStrategy } from '../lib/auth.js';
import middleware from '../lib/middleware.js';
import { ASSETS_MOUNT, resolveEnhancedConfig } from './config.js';
import formAuthPaths from './features/formAuthPaths.js';
import injectAssets from './features/injectAssets.js';
import stripPrefix from './features/stripPrefix.js';

const publicDir = fileURLToPath(new URL('public', import.meta.url));
const viewsDir = fileURLToPath(new URL('views', import.meta.url));
const buildDir = fileURLToPath(new URL('build', import.meta.url));

// Written by `yarn build:enhanced`. Absent when only CSS is in use (or the bundle isn't built yet).
const readManifest = () => {
  try {
    return JSON.parse(fs.readFileSync(`${buildDir}/enhanced-assets.json`, 'utf8'));
  } catch {
    return {};
  }
};

/**
 * Wraps upstream's unmodified middleware (lib/middleware.js) with the enhanced layer.
 *
 * Order matters:
 *   1. pre-middleware (before upstream sees the request)
 *   2. upstream middleware, which also applies its auth
 *   3. enhanced routes/assets — only reached for paths upstream does not handle, i.e. after upstream's auth
 *   4. csrf, same position as upstream's own app.js
 */
export default async function createEnhancedApp(config) {
  const app = express();
  const { baseUrl } = config.site;
  const enhanced = resolveEnhancedConfig(config);
  const assetsUrl = `${baseUrl}${ASSETS_MOUNT}`;

  if (baseUrl !== '/' && enhanced.proxyStripsBaseUrl) {
    app.use(stripPrefix(baseUrl));
  }

  if (enhanced.injectAssets) {
    app.use(baseUrl, injectAssets({ assetsUrl, manifest: readManifest() }));
  }

  if (baseUrl !== '/' && isFormStrategy(config)) {
    app.use(baseUrl, formAuthPaths(baseUrl));
  }

  const upstream = await middleware(config);
  // Enhanced templates shadow upstream's of the same name (UI tier 4, tracked in shadows.json). New enhanced templates
  // must extend upstream's layout by relative path: swig resolves `extends` relative to the including file.
  upstream.set('views', [viewsDir, upstream.get('views')]);
  app.use(baseUrl, upstream);

  app.use(assetsUrl, express.static(publicDir));
  app.use(assetsUrl, express.static(buildDir));

  app.use(baseUrl, csrf(process.env.NODE_ENV === 'test'
    ? { ignoreMethods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT'] }
    : { cookie: true }));

  return app;
}
