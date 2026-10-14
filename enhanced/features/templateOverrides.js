import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swig from 'free-swig';

const upstreamViews = fileURLToPath(new URL('../../lib/views', import.meta.url));
const enhancedViews = fileURLToPath(new URL('../views', import.meta.url));

// Whether `file` (an absolute path) is under `dir`.
const isInside = (dir, file) => !path.relative(dir, file).startsWith('..') && !path.isAbsolute(path.relative(dir, file));

/**
 * Makes `{% extends %}` / `{% include %}` honour shadows (UI tier 4), not just the template Express renders.
 *
 * Express's `views` array lets enhanced/views win for `res.render('collection')`, but swig resolves the names inside a
 * template relative to that template's own file. So upstream's unshadowed pages still `extends 'layout.html'` from
 * lib/views and never see a shadowed layout. While `create()` runs, `new swig.Swig(...)` gets a loader that redirects a
 * template resolved to a path under lib/views to the same relative path under enhanced/views when that file exists.
 * Same precedence rule as `views`; nothing outside lib/views is touched.
 *
 * Wrap the call that builds upstream's app (lib/middleware.js creates its engine privately, so the library's constructor
 * is the only seam). The constructor is restored afterwards, so engines built later (upstream's own tests, other apps in
 * the process) are unaffected; the one built inside keeps its loader.
 */
export default async function withTemplateOverrides(create) {
  const OriginalSwig = swig.Swig;
  const defaultLoader = swig.loaders.fs();

  function ShadowingSwig(options = {}) {
    const base = options.loader || defaultLoader;
    const loader = {
      ...base,
      resolve(to, from) {
        const resolved = base.resolve(to, from);
        if (!isInside(upstreamViews, resolved)) return resolved;
        const shadow = path.join(enhancedViews, path.relative(upstreamViews, resolved));
        return fs.existsSync(shadow) ? shadow : resolved;
      },
    };
    return new OriginalSwig({ ...options, loader });
  }

  swig.Swig = ShadowingSwig;
  try {
    return await create();
  } finally {
    swig.Swig = OriginalSwig;
  }
}
