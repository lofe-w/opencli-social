import { cli, Strategy } from '@jackwener/opencli/registry';
import { doctor } from './lib/weixin.js';

cli({
  site: 'social-weixin',
  name: 'doctor',
  access: 'read',
  description: 'Inspect WeChat social plugin auth and local configuration without printing secrets',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'check-token', type: 'bool', default: false, help: 'Fetch or validate an access token when credentials are available' },
    { name: 'no-cache', type: 'bool', default: false, help: 'Ignore cached access token when --check-token is set' },
    { name: 'force-refresh', type: 'bool', default: false, help: 'Force refresh stable access token when --check-token is set' },
    { name: 'legacy-token', type: 'bool', default: false, help: 'Use legacy /cgi-bin/token when --check-token is set' },
  ],
  columns: [
    'status',
    'auth_source',
    'api_base',
    'cache_present',
    'cache_fresh',
    'app_id_present',
    'app_secret_present',
    'access_token_present',
    'token_source',
    'expires_at',
    'checks',
  ],
  func: async (kwargs) => {
    const result = await doctor({
      checkToken: kwargs['check-token'],
      noCache: kwargs['no-cache'],
      forceRefresh: kwargs['force-refresh'],
      legacyToken: kwargs['legacy-token'],
    });
    return [{
      ...result,
      checks: JSON.stringify(result.checks),
    }];
  },
});
