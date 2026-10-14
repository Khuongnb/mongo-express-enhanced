// Settings for the enhanced layer. Env vars cover the common cases; anything in `config.enhanced`
// (from the user's config.js, which upstream deep-merges into its own config) wins over them.

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
};

const defaults = () => ({
  // A reverse proxy removes the baseUrl prefix before forwarding (e.g. code-server's proxy-gate).
  proxyStripsBaseUrl: toBoolean(process.env.ME_CONFIG_SITE_PROXY_STRIPS_BASEURL),
  // Inject enhanced.css / the enhanced bundle into every rendered HTML page.
  injectAssets: toBoolean(process.env.ME_CONFIG_ENHANCED_INJECT_ASSETS, true),
});

export const resolveEnhancedConfig = (config) => ({ ...defaults(), ...config.enhanced });

// Where the enhanced layer serves its own files, relative to config.site.baseUrl.
export const ASSETS_MOUNT = '_enhanced/assets/';
