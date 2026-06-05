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
      detail: JSON.stringify(job),
    }];
  },
});
