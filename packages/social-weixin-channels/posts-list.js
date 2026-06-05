import { cli, Strategy } from '@jackwener/opencli/registry';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { listPosts } from './lib/channels/page.js';
import { parsePositiveInteger } from './lib/channels/validation.js';

cli({
  site: SITE,
  name: 'posts-list',
  access: 'read',
  description: 'List recent WeChat Channels creator posts for publish-result verification',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  siteSession: 'ephemeral',
  navigateBefore: false,
  args: [
    { name: 'limit', type: 'number', default: 20, help: 'Maximum rows to return' },
  ],
  columns: ['status', 'title', 'publish_time', 'post_url', 'raw_status', 'detail'],
  func: async (page, kwargs) => {
    const limit = parsePositiveInteger(kwargs.limit, 20, 'limit');
    return listPosts(page, Math.min(limit, 100));
  },
});
