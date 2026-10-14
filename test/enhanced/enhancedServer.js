import supertest from 'supertest';

import defaultConf from '../testDefaultConfig.js';
import createEnhancedApp from '../../enhanced/app.js';

export const createEnhancedServer = async ({ site = {}, enhanced, auth } = {}) => {
  const config = defaultConf();
  config.site = { ...config.site, baseUrl: '/', ...site };
  if (enhanced) config.enhanced = enhanced;
  if (auth) Object.assign(config, { useBasicAuth: true, basicAuth: auth });

  const app = await createEnhancedApp(config);
  const httpServer = app.listen();
  return { request: supertest.agent(httpServer), close: () => httpServer.close() };
};
