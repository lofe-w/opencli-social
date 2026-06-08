import { cli, Strategy } from '@jackwener/opencli/registry';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { gotoPublishPage, inspectPage } from './lib/channels/page.js';

cli({
  site: SITE,
  name: 'auth-status',
  access: 'read',
  description: 'Read current WeChat Channels login and account-selection state',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  siteSession: 'ephemeral',
  navigateBefore: false,
  args: [
    { name: 'account-name', required: false, help: 'Expected Channels account display name' },
  ],
  columns: ['status', 'command', 'account_status', 'account_name', 'url', 'detail'],
  func: async (page, kwargs) => {
    await gotoPublishPage(page);
    const info = await inspectPage(page, kwargs['account-name'] || '');
    return [{
      status: info.login_like ? 'logged_out' : 'ok',
      command: 'auth-status',
      account_status: info.account_status || 'unknown',
      account_name: info.account_name || '',
      url: info.url || '',
      detail: JSON.stringify({
        needs_mobile_confirm: Boolean(info.needs_mobile_confirm),
        captcha_like: Boolean(info.captcha_like),
        text_preview: info.text_preview || '',
      }),
    }];
  },
});
