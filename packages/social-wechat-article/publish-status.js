import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  getAccessToken,
  getPublishStatus,
  publishStatusRow,
  waitForPublishCompletion,
} from './lib/wechat-article.js';

cli({
  site: 'social-wechat-article',
  name: 'publish-status',
  access: 'read',
  description: 'Query WeChat Article publish status by publish_id',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'publish-id', positional: true, required: true, help: 'publish_id returned by publish' },
    { name: 'wait', type: 'bool', default: false, help: 'Poll until the publish task reaches a terminal state' },
    { name: 'timeout-seconds', type: 'number', default: 300, help: 'Maximum wait time when --wait is set' },
    { name: 'interval-seconds', type: 'number', default: 5, help: 'Polling interval when --wait is set' },
    { name: 'fail-on-failure', type: 'bool', default: false, help: 'Exit non-zero if a terminal publish failure is reached' },
  ],
  columns: ['status', 'profile', 'account_name', 'account_id_masked', 'publish_id', 'publish_status', 'article_id', 'article_url', 'fail_idx', 'raw'],
  func: async (kwargs) => {
    const publishId = String(kwargs['publish-id'] || '');
    const shouldWait = kwargs.wait === true;
    const token = await getAccessToken();
    const data = shouldWait
      ? await waitForPublishCompletion(publishId, token.accessToken, {
        timeoutSeconds: kwargs['timeout-seconds'],
        intervalSeconds: kwargs['interval-seconds'],
        failOnFailure: kwargs['fail-on-failure'],
      })
      : await getPublishStatus(publishId, token.accessToken);
    return [{
      ...publishStatusRow(data, publishId),
      profile: token.profile,
      account_name: token.account_name,
      account_id_masked: token.account_id_masked,
    }];
  },
});
