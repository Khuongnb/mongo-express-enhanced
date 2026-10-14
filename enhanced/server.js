#!/usr/bin/env node
// Launcher for the enhanced build: `yarn start:enhanced`. Mirrors upstream's app.js (config loading, SSL, listen)
// but composes the app through enhanced/app.js. Differences from app.js: no --url/--port CLI flags and no
// interactive connection-string prompt; configure through ME_CONFIG_* env vars or config.js.
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import pico from 'picocolors';
import configDefault from '../config.default.js';
import { deepmerge } from '../lib/utils.js';
import createEnhancedApp from './app.js';

const loadConfig = async () => {
  if (!fs.existsSync('./config.js')) return configDefault;

  try {
    const { default: configCustom } = await import(new URL('../config.js', import.meta.url));
    return deepmerge(configDefault, configCustom);
  } catch (error) {
    console.error(pico.red('Unable to load config.js!'));
    console.error(pico.red(error));
    return process.exit(1);
  }
};

const hasConnectionString = (mongodb) => (Array.isArray(mongodb)
  ? mongodb.some((connection) => connection?.connectionString)
  : Boolean(mongodb?.connectionString));

const config = await loadConfig();

if (!hasConnectionString(config.mongodb)) {
  console.error(pico.red('No MongoDB connection string configured.'));
  console.error('Set ME_CONFIG_MONGODB_URL or define mongodb.connectionString in config.js.');
  process.exit(1);
}

config.site.baseUrl ||= '/';

// Upstream has no default for these, and every page 500s ("secret option required for sessions") without them. Sessions live in
// memory, so a secret that lasts one run costs nothing; set ME_CONFIG_SITE_COOKIESECRET / _SESSIONSECRET to keep one across restarts.
config.site.cookieSecret ||= crypto.randomBytes(24).toString('hex');
config.site.sessionSecret ||= crypto.randomBytes(24).toString('hex');

const app = await createEnhancedApp(config);
const defaultPort = config.site.sslEnabled ? 443 : 80;
const server = config.site.sslEnabled
  ? https.createServer({ key: fs.readFileSync(config.site.sslKey), cert: fs.readFileSync(config.site.sslCert) }, app)
  : app;
const address = `${config.site.sslEnabled ? 'https' : 'http'}://${config.site.host || '0.0.0.0'}:${config.site.port || defaultPort}`;

server.listen(config.site.port, config.site.host, () => {
  console.log(`Mongo Express (enhanced) listening at ${address}${config.site.baseUrl}`);

  if (!config.site.host || config.site.host === '0.0.0.0') {
    console.error(pico.red('Server is open to allow connections from anyone (0.0.0.0)'));
  }

  if (config.useOidcAuth !== true && config.useBasicAuth !== true) {
    console.warn(pico.yellow('Basic and OIDC authentications are disabled; set ME_CONFIG_BASICAUTH_ENABLED=true.'));
  }
}).on('error', (error) => {
  console.error(pico.red(error.code === 'EADDRINUSE'
    ? `Address ${address} already in use! Pick a different host and/or port.`
    : String(error)));
  process.exit(1);
});
