import { cli, Strategy } from '@jackwener/opencli/registry';
import { clearProfileAuth, requireExecute } from './lib/wechat-article.js';

cli({
  site: 'social-wechat-article',
  name: 'profile-clear',
  access: 'write',
  description: 'Remove social-wechat-article configuration from the current OpenCLI profile',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'execute', type: 'bool', default: false, help: 'Actually remove profile configuration and cached token' },
  ],
  columns: ['status', 'profile', 'account_name', 'account_id_masked', 'api_base', 'config_path', 'detail'],
  func: async (kwargs) => {
    if (!requireExecute(kwargs)) {
      return [{
        status: 'dry_run',
        profile: process.env.OPENCLI_PROFILE || '',
        account_name: '',
        account_id_masked: '',
        api_base: '',
        config_path: '',
        detail: JSON.stringify({ message: 'profile-clear requires --execute to remove profile configuration' }),
      }];
    }
    const result = clearProfileAuth();
    return [{ ...result, detail: '{}' }];
  },
});
