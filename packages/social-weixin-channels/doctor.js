import { cli, Strategy } from '@jackwener/opencli/registry';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { gotoPublishPage, inspectPage } from './lib/channels/page.js';

cli({
  site: SITE,
  name: 'doctor',
  access: 'read',
  description: 'Diagnose OpenCLI browser access, WeChat Channels login state, and creator page readiness',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  siteSession: 'ephemeral',
  navigateBefore: false,
  args: [
    { name: 'account-name', required: false, help: 'Expected Channels account display name to check on the page' },
  ],
  columns: ['status', 'command', 'account_status', 'account_name', 'url', 'detail'],
  func: async (page, kwargs) => {
    await gotoPublishPage(page);
    const info = await inspectPage(page, kwargs['account-name'] || '');
    return [{
      status: info.login_like ? 'logged_out' : 'ok',
      command: 'doctor',
      account_status: info.account_status || 'unknown',
      account_name: info.account_name || '',
      url: info.url || '',
      detail: JSON.stringify({
        title: info.title || '',
        create_like: Boolean(info.create_like),
        needs_mobile_confirm: Boolean(info.needs_mobile_confirm),
        captcha_like: Boolean(info.captcha_like),
        text_preview: info.text_preview || '',
      }),
    }];
  },
});
