import { cli, Strategy } from '@jackwener/opencli/registry';
import { getAccessToken } from './lib/weixin.js';

cli({
  site: 'publisher-weixin',
  name: 'auth',
  access: 'read',
  description: 'Validate WeChat Official Account token acquisition',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'no-cache', type: 'bool', default: false, help: 'Ignore cached access token and fetch a fresh token' },
  ],
  columns: ['status', 'source', 'expires_at'],
  func: async (kwargs) => {
    const token = await getAccessToken({ noCache: kwargs['no-cache'] === true });
    return [{
      status: 'ok',
      source: token.source,
      expires_at: token.expiresAt ? new Date(token.expiresAt).toISOString() : '',
    }];
  },
});

