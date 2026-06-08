import { cli, Strategy } from '@jackwener/opencli/registry';
import { SITE } from './lib/channels/constants.js';
import { readJob } from './lib/channels/jobs.js';

cli({
  site: SITE,
  name: 'jobs-get',
  access: 'read',
  description: 'Read local WeChat Channels publish job metadata',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'job-id', positional: true, required: true, help: 'Job ID returned by publish-video' },
  ],
  columns: ['status', 'command', 'job_id', 'stage', 'profile', 'next_command', 'detail'],
  func: async (kwargs) => {
    const job = readJob(kwargs['job-id']);
    return [{
      status: 'ok',
      command: 'jobs-get',
      job_id: job.job_id,
      stage: job.stage,
      profile: job.profile || '',
      next_command: job.next_command || '',
      detail: JSON.stringify({
        schema_version: job.schema_version,
        site: job.site,
        created_at: job.created_at,
        updated_at: job.updated_at,
        input: {
          video: job.input?.video || null,
          cover: job.input?.cover || null,
          description_source: job.input?.description_source || '',
          description_sha256: job.input?.description_sha256 || '',
          caption_sha256: job.input?.caption_sha256 || '',
          caption_preview: job.input?.caption_preview || '',
          short_title: job.input?.short_title || '',
          schedule_at: job.input?.schedule_at || '',
          publish_now: Boolean(job.input?.publish_now),
          final_approval: job.input?.final_approval || '',
          account_name: job.input?.account_name || '',
        },
        account: job.account || {},
        page: job.page || {},
        remote: job.remote || {},
        last_action_id: job.last_action_id || '',
        events: job.events || [],
      }),
    }];
  },
});
