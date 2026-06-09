import { cli, Strategy } from '@jackwener/opencli/registry';
import { describeAuthConfig } from './lib/wechat-article.js';

cli({
  site: 'social-wechat-article',
  name: 'auth-status',
  access: 'read',
  description: 'Inspect the current OpenCLI profile social-wechat-article configuration without printing secrets',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [],
  columns: [
    'status',
    'profile',
    'account_name',
    'account_id_masked',
    'auth_source',
    'api_base',
    'config_present',
    'cache_present',
    'cache_fresh',
    'app_id_present',
    'app_secret_present',
    'detail',
  ],
  func: async () => {
    const config = describeAuthConfig();
    return [{
      status: config.ready ? 'ok' : 'missing_auth',
      profile: config.profile,
      account_name: config.account_name,
      account_id_masked: config.account_id_masked,
      auth_source: config.auth_source,
      api_base: config.api_base,
      config_present: config.config_present,
      cache_present: config.cache_present,
      cache_fresh: config.cache_fresh,
      app_id_present: config.app_id_present,
      app_secret_present: config.app_secret_present,
      detail: JSON.stringify({
        profile_present: config.profile_present,
        cache_path: config.cache_path,
        cache_expires_at: config.cache_expires_at,
      }),
    }];
  },
});
