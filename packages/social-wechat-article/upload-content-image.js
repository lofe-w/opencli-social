import { cli, Strategy } from '@jackwener/opencli/registry';
import { getAccessToken, profileAuditFields, requireExecute, uploadContentImage } from './lib/wechat-article.js';

cli({
  site: 'social-wechat-article',
  name: 'upload-content-image',
  access: 'write',
  description: 'Upload inline article image and return a WeChat CDN URL',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'image', positional: true, required: true, help: 'Local image path' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually upload the image' },
  ],
  columns: ['status', 'profile', 'account_name', 'account_id_masked', 'url', 'path'],
  func: async (kwargs) => {
    if (!requireExecute(kwargs)) {
      return [{ status: 'dry_run', ...profileAuditFields(), url: '', path: String(kwargs.image || '') }];
    }
    const token = await getAccessToken();
    const uploaded = await uploadContentImage(kwargs.image, token.accessToken);
    return [{
      status: 'uploaded',
      profile: token.profile,
      account_name: token.account_name,
      account_id_masked: token.account_id_masked,
      url: uploaded.url,
      path: uploaded.path,
    }];
  },
});
