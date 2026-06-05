import { cli, Strategy } from '@jackwener/opencli/registry';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { capturePageState } from './lib/channels/page.js';

cli({
  site: SITE,
  name: 'page-state',
  access: 'read',
  description: 'Capture visible WeChat Channels browser state for HITL/debug verification',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'target', default: 'current', help: 'current, publish, or posts' },
  ],
  columns: ['status', 'url', 'title', 'text_preview', 'buttons', 'fields', 'screenshot_path', 'detail'],
  func: async (page, kwargs) => {
    const target = ['current', 'publish', 'posts'].includes(kwargs.target) ? kwargs.target : 'current';
    const state = await capturePageState(page, target);
    return [{
      status: 'ok',
      url: state.url || '',
      title: state.title || '',
      text_preview: state.text || '',
      buttons: JSON.stringify(state.buttons || []),
      fields: JSON.stringify(state.fields || []),
      screenshot_path: state.screenshot_path || '',
      detail: JSON.stringify({ target }),
    }];
  },
});
