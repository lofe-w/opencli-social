import { cli, Strategy } from '@jackwener/opencli/registry';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { gotoPublishPage, inspectPage } from './lib/channels/page.js';

cli({
  site: SITE,
  name: 'account-resolve',
  access: 'read',
  description: 'Resolve an expected WeChat Channels account name against the current page',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  siteSession: 'ephemeral',
  navigateBefore: false,
  args: [
    { name: 'account-name', required: true, help: 'Expected Channels account display name' },
  ],
  columns: ['status', 'command', 'account_status', 'account_name', 'url', 'detail'],
  func: async (page, kwargs) => {
    await gotoPublishPage(page);
    const info = await inspectPage(page, kwargs['account-name']);
    return [{
      status: info.account_status === 'single_account' ? 'ok' : info.account_status === 'logged_out' ? 'logged_out' : 'needs_human',
      command: 'account-resolve',
      account_status: info.account_status || 'unknown',
      account_name: info.account_name || '',
      url: info.url || '',
      detail: JSON.stringify({ expected: kwargs['account-name'], text_preview: info.text_preview || '' }),
    }];
  },
});
