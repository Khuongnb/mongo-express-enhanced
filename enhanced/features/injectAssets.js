/**
 * Injects the enhanced stylesheet and script into rendered HTML pages, so upstream templates need no edit.
 *
 * Wraps `res.send`, which Express's `res.render` ends in. Only string bodies are touched, and only when the response is
 * HTML: either `Content-Type` says so, or it is not set yet (Express sets it inside `send`, defaulting strings to HTML).
 * `<html>` gets a `data-me-enhanced` attribute: enhanced CSS scopes its rules to `[data-me-enhanced]` so it applies
 * before any script runs and never leaks onto upstream markup it doesn't own.
 */
export default function injectAssets({ assetsUrl, manifest }) {
  const css = `<link rel="stylesheet" href="${assetsUrl}css/enhanced.css">`;
  const script = manifest?.enhanced?.js ? `<script src="${assetsUrl}${manifest.enhanced.js}"></script>` : '';

  const inject = (html) => {
    if (html.includes('data-me-enhanced')) return html;
    return html
      .replace(/<html\b/i, () => '<html data-me-enhanced')
      .replace(/<\/head>/i, () => `${css}\n</head>`)
      .replace(/<\/body>/i, () => `${script}\n</body>`);
  };

  return (req, res, next) => {
    const send = res.send.bind(res);
    res.send = (body) => {
      const type = String(res.get('Content-Type') || '');
      const isHtml = type === '' || type.includes('text/html');
      return send(typeof body === 'string' && isHtml ? inject(body) : body);
    };
    next();
  };
}
