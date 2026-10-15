import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import csrf from 'csurf';
import express from 'express';
import { isFormStrategy } from '../lib/auth.js';
import middleware from '../lib/middleware.js';
import { ASSETS_MOUNT, resolveEnhancedConfig } from './config.js';
import { registerColumnTypes } from './features/columnTypes.js';
import formAuthPaths from './features/formAuthPaths.js';
import injectAssets from './features/injectAssets.js';
import perPage from './features/perPage.js';
import queryFilter from './features/queryFilter.js';
import signinFlash from './features/signinFlash.js';
import stripPrefix from './features/stripPrefix.js';
import { registerValueFilters } from './features/valueFilter.js';
import withTemplateOverrides from './features/templateOverrides.js';

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
 *      (form sign-in is the exception: its page needs the stylesheet, so assets are served before upstream)
 *   4. csrf, same position as upstream's own app.js
 */
export default async function createEnhancedApp(config) {
  const app = express();
  // Upstream turns this on for its own sub-app only; the filter middleware runs out here and needs f[0][k]=... as nested.
  app.set('query parser', 'extended');
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

  if (isFormStrategy(config)) {
    app.use(baseUrl, signinFlash(baseUrl));
  }

  // Before upstream: it rewrites the request's filter parameters into the one shape upstream's Simple query understands.
  app.use(baseUrl, queryFilter());
  // Also before upstream: the page size is chosen per request (?limit=, the picker's cookie, the default), through a getter it
  // installs on config.options.documentsPerPage.
  app.use(baseUrl, perPage(config, enhanced));

  registerValueFilters();
  registerColumnTypes();
  const upstream = await withTemplateOverrides(() => middleware(config));
  // Enhanced templates shadow upstream's of the same name (UI tier 4, tracked in shadows.json). New enhanced templates
  // may be unshadowed pages' parents too: withTemplateOverrides makes `extends`/`include` follow the same precedence.
  upstream.set('views', [viewsDir, upstream.get('views')]);
  // Upstream only offers logout for OIDC (`res.locals.enableLogout`); form sign-in has the route but no button.
  upstream.locals.showLogout = isFormStrategy(config) || config.useOidcAuth === true;
  const serveAssets = () => {
    app.use(assetsUrl, express.static(publicDir));
    app.use(assetsUrl, express.static(buildDir));
  };
  // Form sign-in's own page needs the stylesheet while nobody is signed in, and the assets are not secret. With basic auth the
  // browser sends credentials for every same-origin request, so there they can stay behind upstream's auth.
  if (isFormStrategy(config)) serveAssets();
  app.use(baseUrl, upstream);
  if (!isFormStrategy(config)) serveAssets();

  app.use(baseUrl, csrf(process.env.NODE_ENV === 'test'
    ? { ignoreMethods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT'] }
    : { cookie: true }));

  return app;
}
