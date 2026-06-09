import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  getAccessToken,
  profileAuditFields,
  publishStatusRow,
  requireExecute,
  submitPublish,
  waitForPublishCompletion,
} from './lib/wechat-article.js';

cli({
  site: 'social-wechat-article',
  name: 'publish',
  access: 'write',
  description: 'Submit a WeChat Article draft media_id for publication',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'media-id', positional: true, required: true, help: 'Draft media_id returned by draft-add' },
    { name: 'wait', type: 'bool', default: false, help: 'Poll until the publish task reaches a terminal state' },
    { name: 'timeout-seconds', type: 'number', default: 300, help: 'Maximum wait time when --wait is set' },
    { name: 'interval-seconds', type: 'number', default: 5, help: 'Polling interval when --wait is set' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually submit the draft' },
  ],
  columns: ['status', 'profile', 'account_name', 'account_id_masked', 'media_id', 'publish_id', 'publish_status', 'article_id', 'article_url', 'fail_idx', 'msg_data_id', 'raw'],
  func: async (kwargs) => {
    const mediaId = String(kwargs['media-id'] || '');
    const shouldWait = kwargs.wait === true;
    const audit = profileAuditFields();
    if (!requireExecute(kwargs)) {
      return [{
        status: shouldWait ? 'dry_run_submit_and_wait' : 'dry_run_submit',
        ...audit,
        media_id: mediaId,
        publish_id: '',
        publish_status: '',
        article_id: '',
        article_url: '',
        fail_idx: '',
        msg_data_id: '',
        raw: '',
      }];
    }
    const token = await getAccessToken();
    const submitted = await submitPublish(mediaId, token.accessToken);
    if (shouldWait) {
      const status = await waitForPublishCompletion(submitted.publishId, token.accessToken, {
        timeoutSeconds: kwargs['timeout-seconds'],
        intervalSeconds: kwargs['interval-seconds'],
        failOnFailure: true,
      });
      return [{
        ...publishStatusRow(status, submitted.publishId),
        profile: token.profile,
        account_name: token.account_name,
        account_id_masked: token.account_id_masked,
        media_id: mediaId,
        msg_data_id: submitted.msgDataId,
      }];
    }
    return [{
      status: 'submitted',
      profile: token.profile,
      account_name: token.account_name,
      account_id_masked: token.account_id_masked,
      media_id: mediaId,
      publish_id: submitted.publishId,
      publish_status: '',
      article_id: '',
      article_url: '',
      fail_idx: '',
      msg_data_id: submitted.msgDataId,
      raw: '',
    }];
  },
});
