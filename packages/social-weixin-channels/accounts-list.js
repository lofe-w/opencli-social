import { cli, Strategy } from '@jackwener/opencli/registry';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { gotoPublishPage, inspectPage } from './lib/channels/page.js';

cli({
  site: SITE,
  name: 'accounts-list',
  access: 'read',
  description: 'List currently detectable WeChat Channels publishing accounts from the creator page',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  siteSession: 'ephemeral',
  navigateBefore: false,
  args: [],
  columns: ['status', 'command', 'account_status', 'account_name', 'url', 'detail'],
  func: async (page) => {
    await gotoPublishPage(page);
    const info = await inspectPage(page);
    return [{
      status: info.login_like ? 'logged_out' : 'ok',
      command: 'accounts-list',
      account_status: info.account_status || 'unknown',
      account_name: info.account_name || '',
      url: info.url || '',
      detail: JSON.stringify({
        note: info.account_name ? 'single visible account candidate' : 'no stable account candidate detected',
        text_preview: info.text_preview || '',
      }),
    }];
  },
});
