/**
 * Re-adds the baseUrl prefix to requests that arrive without it.
 *
 * Use when a reverse proxy strips the prefix before forwarding: the browser sees `baseUrl`, the app receives `/`.
 * Routes and generated links/redirects keep using baseUrl. Requests that already carry the prefix are untouched.
 * `req.originalUrl` is updated too, because upstream derives `baseHref` and its auth allowlist from it.
 */
export default function stripPrefix(baseUrl) {
  const prefix = baseUrl.replace(/\/$/, '');

  return (req, res, next) => {
    if (req.url !== prefix && !req.url.startsWith(`${prefix}/`) && !req.url.startsWith(`${prefix}?`)) {
      req.url = `${prefix}${req.url}`;
      req.originalUrl = `${prefix}${req.originalUrl}`;
    }
    next();
  };
}
