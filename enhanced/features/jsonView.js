import { readCookie } from './perPage.js';

// Whether the collection table shows JSON values collapsed to one line or unfolded. Upstream decides this once, for everyone, from
// `options.collapsibleJSONDefaultUnfold` (1 by default, which unfolds the first level of every value, so one big object makes a
// row as tall as it has keys). Here it is chosen per request, from the toggle's cookie and then the configured default, and handed
// to the page as the level upstream's script already reads (ME_SETTINGS.collapsibleJSONDefaultUnfold): 0 collapsed, else unfolded.

export const COOKIE = 'me_json_collapsed';

export const resolveCollapsed = ({ cookie, fallback }) => {
  if (cookie === '1') return true;
  if (cookie === '0') return false;
  return fallback;
};

/** The level to unfold to when not collapsed: upstream's configured one, but never 0, or the toggle would do nothing. */
export const unfoldLevel = (configured) => {
  const level = Number.parseInt(configured, 10);
  return Number.isFinite(level) && level > 1 ? level : 1;
};

export default function jsonView(config, enhanced) {
  const fallback = enhanced.jsonCollapsed !== false;
  const expanded = unfoldLevel(config.options?.collapsibleJSONDefaultUnfold);
  return (req, res, next) => {
    const collapsed = resolveCollapsed({ cookie: readCookie(req.headers.cookie, COOKIE), fallback });
    res.locals.meJson = { collapsed, unfold: collapsed ? 0 : expanded };
    next();
  };
}
