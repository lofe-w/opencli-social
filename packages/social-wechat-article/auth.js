import { cli, Strategy } from '@jackwener/opencli/registry';
import { getAccessToken } from './lib/wechat-article.js';

cli({
  site: 'social-wechat-article',
  name: 'auth',
  access: 'read',
  description: 'Validate WeChat Article API token acquisition',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'no-cache', type: 'bool', default: false, help: 'Ignore cached access token and fetch a fresh token' },
    { name: 'force-refresh', type: 'bool', default: false, help: 'Force refresh stable access token; use sparingly' },
    { name: 'legacy-token', type: 'bool', default: false, help: 'Use legacy /cgi-bin/token instead of stable_token' },
  ],
  columns: ['status', 'profile', 'account_name', 'account_id_masked', 'source', 'expires_at'],
  func: async (kwargs) => {
    const token = await getAccessToken({
      noCache: kwargs['no-cache'] === true,
      forceRefresh: kwargs['force-refresh'] === true,
      legacyToken: kwargs['legacy-token'] === true,
    });
    return [{
      status: 'ok',
      profile: token.profile,
      account_name: token.account_name,
      account_id_masked: token.account_id_masked,
      source: token.source,
      expires_at: token.expiresAt ? new Date(token.expiresAt).toISOString() : '',
    }];
  },
});
