import { cli, Strategy } from '@jackwener/opencli/registry';
import { getAccessToken, getPublishStatus } from './lib/weixin.js';

cli({
  site: 'publisher-weixin',
  name: 'publish-status',
  access: 'read',
  description: 'Query WeChat Official Account publish status by publish_id',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'publish-id', positional: true, required: true, help: 'publish_id returned by publish' },
  ],
  columns: ['status', 'publish_id', 'publish_status', 'article_id', 'raw'],
  func: async (kwargs) => {
    const publishId = String(kwargs['publish-id'] || '');
    const token = await getAccessToken();
    const data = await getPublishStatus(publishId, token.accessToken);
    return [{
      status: normalizePublishStatus(data.publish_status),
      publish_id: publishId,
      publish_status: data.publish_status ?? '',
      article_id: data.article_id || '',
      raw: JSON.stringify(data),
    }];
  },
});

function normalizePublishStatus(value) {
  switch (Number(value)) {
    case 0: return 'publishing';
    case 1: return 'published';
    case 2: return 'originality_checking';
    case 3: return 'failed';
    default: return value == null ? 'unknown' : `status_${value}`;
  }
}

