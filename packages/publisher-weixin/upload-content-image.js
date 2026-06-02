import { cli, Strategy } from '@jackwener/opencli/registry';
import { getAccessToken, requireExecute, uploadContentImage } from './lib/weixin.js';

cli({
  site: 'publisher-weixin',
  name: 'upload-content-image',
  access: 'write',
  description: 'Upload inline article image and return a WeChat CDN URL',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'image', positional: true, required: true, help: 'Local image path' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually upload the image' },
  ],
  columns: ['status', 'url', 'path'],
  func: async (kwargs) => {
    if (!requireExecute(kwargs)) {
      return [{ status: 'dry_run', url: '', path: String(kwargs.image || '') }];
    }
    const token = await getAccessToken();
    const uploaded = await uploadContentImage(kwargs.image, token.accessToken);
    return [{ status: 'uploaded', url: uploaded.url, path: uploaded.path }];
  },
});

