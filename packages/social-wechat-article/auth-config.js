import * as fs from 'node:fs';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { configureProfileAuth, requireExecute } from './lib/wechat-article.js';

cli({
  site: 'social-wechat-article',
  name: 'auth-config',
  access: 'write',
  description: 'Configure WeChat Article API credentials for the current OpenCLI profile',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'app-id', required: true, help: 'WeChat Article AppID for this OpenCLI profile' },
    { name: 'display-name', required: false, help: 'Human-readable account name for audit output' },
    { name: 'api-base', required: false, help: 'WeChat API base URL; defaults to https://api.weixin.qq.com' },
    { name: 'app-secret-stdin', type: 'bool', default: false, help: 'Read AppSecret from stdin' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually write the profile configuration' },
  ],
  columns: ['status', 'profile', 'account_name', 'account_id_masked', 'api_base', 'config_path', 'detail'],
  func: async (kwargs) => {
    if (!requireExecute(kwargs)) {
      return [{
        status: 'dry_run',
        profile: process.env.OPENCLI_PROFILE || '',
        account_name: String(kwargs['display-name'] || ''),
        account_id_masked: '',
        api_base: String(kwargs['api-base'] || 'https://api.weixin.qq.com'),
        config_path: '',
        detail: JSON.stringify({ message: 'auth-config requires --execute and --app-secret-stdin to write profile credentials' }),
      }];
    }
    if (kwargs['app-secret-stdin'] !== true) {
      throw new ArgumentError('--app-secret-stdin is required.');
    }
    const appSecret = fs.readFileSync(0, 'utf-8').trim();
    if (!appSecret) throw new ArgumentError('AppSecret stdin is empty.');
    const result = configureProfileAuth({
      appId: kwargs['app-id'],
      appSecret,
      displayName: kwargs['display-name'],
      apiBase: kwargs['api-base'],
    });
    return [{ ...result, detail: '{}' }];
  },
});
