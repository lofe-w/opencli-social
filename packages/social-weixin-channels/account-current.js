import { cli, Strategy } from '@jackwener/opencli/registry';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { gotoPublishPage, inspectPage } from './lib/channels/page.js';

cli({
  site: SITE,
  name: 'account-current',
  access: 'read',
  description: 'Read the currently visible WeChat Channels publishing account',
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
      command: 'account-current',
      account_status: info.account_status || 'unknown',
      account_name: info.account_name || '',
      url: info.url || '',
      detail: JSON.stringify({ text_preview: info.text_preview || '' }),
    }];
  },
});
