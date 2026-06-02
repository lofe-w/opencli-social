import { cli, Strategy } from '@jackwener/opencli/registry';
import { getAccessToken, requireExecute, submitPublish } from './lib/weixin.js';

cli({
  site: 'publisher-weixin',
  name: 'publish',
  access: 'write',
  description: 'Submit a WeChat Official Account draft media_id for publication',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'media-id', positional: true, required: true, help: 'Draft media_id returned by draft-add' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually submit the draft' },
  ],
  columns: ['status', 'media_id', 'publish_id', 'msg_data_id'],
  func: async (kwargs) => {
    const mediaId = String(kwargs['media-id'] || '');
    if (!requireExecute(kwargs)) {
      return [{ status: 'dry_run', media_id: mediaId, publish_id: '', msg_data_id: '' }];
    }
    const token = await getAccessToken();
    const submitted = await submitPublish(mediaId, token.accessToken);
    return [{
      status: 'submitted',
      media_id: mediaId,
      publish_id: submitted.publishId,
      msg_data_id: submitted.msgDataId,
    }];
  },
});

