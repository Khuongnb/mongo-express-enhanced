import { AsyncLocalStorage } from 'node:async_hooks';

// How many documents the collection page shows. Upstream reads one global `config.options.documentsPerPage` (a string when it comes
// from the env, which also breaks its aggregate paging: "25" + 0 is "250"). Here it is chosen per request, without touching
// upstream: a getter on `config.options` answers from the request being served.
//   ?limit=N  >  the me_per_page cookie (set by the picker in the toolbar)  >  the configured default, all capped at the maximum.

export const COOKIE = 'me_per_page';
export const DEFAULT_PER_PAGE = 25;
export const MAX_PER_PAGE = 250;
// What the picker offers, below the maximum. The default and the current size are added when they are not in the list.
export const CHOICES = [10, 25, 50, 100, 250];
// Upstream's own default; indistinguishable from a deliberate 10 in config.js, so it is read as "not set".
const UPSTREAM_DEFAULT = 10;

const requestLimit = new AsyncLocalStorage();

export const toPositiveInt = (value) => (/^\d{1,6}$/.test(String(value ?? '').trim()) && Number(value) > 0 ? Number(value) : undefined);

export const readCookie = (header, name) => {
  const pair = String(header ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
};

/**
 * The default size: enhanced.documentsPerPage, then ME_CONFIG_DOCUMENTS_PER_PAGE, then config.js's options.documentsPerPage
 * (unless it is upstream's own 10), then 25. The maximum is never below the default.
 */
export const resolveSizes = (config, enhanced = {}, env = process.env) => {
  const fromConfig = toPositiveInt(config.options?.documentsPerPage);
  const fallback = toPositiveInt(enhanced.documentsPerPage)
    ?? toPositiveInt(env.ME_CONFIG_DOCUMENTS_PER_PAGE)
    ?? (fromConfig === UPSTREAM_DEFAULT ? undefined : fromConfig)
    ?? DEFAULT_PER_PAGE;
  const max = Math.max(toPositiveInt(enhanced.maxPerPage) ?? toPositiveInt(env.ME_CONFIG_ENHANCED_MAX_PER_PAGE) ?? MAX_PER_PAGE, fallback);
  return { fallback, max };
};

export const resolveLimit = ({ query, cookie, fallback, max }) => {
  const asked = toPositiveInt(typeof query === 'string' ? query : undefined) ?? toPositiveInt(cookie);
  return Math.min(asked ?? fallback, max);
};

export const choicesFor = ({ fallback, max, current }) => [
  ...new Set([...CHOICES.filter((size) => size <= max), fallback, current]),
].sort((left, right) => left - right);

export default function perPage(config, enhanced) {
  const { fallback, max } = resolveSizes(config, enhanced);
  // Outside a request (or on a route that does not run the middleware) the default applies.
  Object.defineProperty(config.options, 'documentsPerPage', {
    get: () => requestLimit.getStore() ?? fallback, enumerable: true, configurable: true,
  });

  return (req, res, next) => {
    const current = resolveLimit({
      query: req.query?.limit, cookie: readCookie(req.headers.cookie, COOKIE), fallback, max,
    });
    res.locals.mePerPage = { current, choices: choicesFor({ fallback, max, current }) };
    requestLimit.run(current, next);
  };
}
