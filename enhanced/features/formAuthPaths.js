/**
 * Makes upstream's form sign-in reachable when baseUrl is not '/'.
 *
 * lib/router.js registers `/login` and `/logout` at `${baseUrl}login` / `${baseUrl}logout`, but the router is already
 * mounted under baseUrl, so the routes only match at the doubled path `${baseUrl}${baseUrl}login`. With a real base URL
 * the sign-in page is a 404 and every request redirects to it.
 *
 * Mount this inside baseUrl, ahead of upstream: it rewrites `req.url` (not `originalUrl`, which upstream's auth
 * allowlist compares against the real path) to the path upstream registered.
 */
export default function formAuthPaths(baseUrl) {
  const prefix = baseUrl.replace(/\/$/, '');

  return (req, res, next) => {
    if (req.path === '/login' || req.path === '/logout') {
      req.url = `${prefix}${req.url}`;
    }
    next();
  };
}
