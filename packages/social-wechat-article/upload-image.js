import { cli, Strategy } from '@jackwener/opencli/registry';
import { getAccessToken, profileAuditFields, requireExecute, uploadPermanentImage } from './lib/wechat-article.js';

cli({
  site: 'social-wechat-article',
  name: 'upload-image',
  access: 'write',
  description: 'Upload permanent image material for WeChat Article covers',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'image', positional: true, required: true, help: 'Local image path' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually upload the image' },
  ],
  columns: ['status', 'profile', 'account_name', 'account_id_masked', 'media_id', 'url', 'path'],
  func: async (kwargs) => {
    if (!requireExecute(kwargs)) {
      return [{ status: 'dry_run', ...profileAuditFields(), media_id: '', url: '', path: String(kwargs.image || '') }];
    }
    const token = await getAccessToken();
    const uploaded = await uploadPermanentImage(kwargs.image, token.accessToken);
    return [{
      status: 'uploaded',
      profile: token.profile,
      account_name: token.account_name,
      account_id_masked: token.account_id_masked,
      media_id: uploaded.mediaId,
      url: uploaded.url,
      path: uploaded.path,
    }];
  },
});
