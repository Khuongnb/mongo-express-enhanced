/**
 * Shows the sign-in page's flash message and gives it a base URL.
 *
 * Upstream stores "Invalid username or password." in the session and redirects back to the sign-in page, but only reads
 * session flashes in a middleware that runs after the sign-in gate, so the page itself never shows it (and the message waits
 * in the session). The page is also rendered without `baseHref`, leaving an empty `<base href>`.
 *
 * Mount this ahead of upstream. It wraps `res.render` so that rendering the `signin` view takes the pending
 * `session.error` / `session.success` (at render time the session middleware has run) and fills in `baseHref`.
 */
export default function signinFlash(baseUrl) {
  return (req, res, next) => {
    const render = res.render.bind(res);

    res.render = (view, options, callback) => {
      if (view !== 'signin' || typeof options === 'function') return render(view, options, callback);

      const flash = {};
      if (req.session?.error) {
        flash.messageError = req.session.error;
        delete req.session.error;
      }
      if (req.session?.success) {
        flash.messageSuccess = req.session.success;
        delete req.session.success;
      }
      return render(view, { baseHref: baseUrl, ...options, ...flash }, callback);
    };

    next();
  };
}
