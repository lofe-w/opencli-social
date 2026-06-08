import { cli, Strategy } from '@jackwener/opencli/registry';
import { SITE } from './lib/channels/constants.js';
import { cancelJob } from './lib/channels/jobs.js';
import { requireExecute } from './lib/channels/validation.js';

cli({
  site: SITE,
  name: 'jobs-cancel',
  access: 'write',
  description: 'Cancel local WeChat Channels publish job metadata; does not delete remote drafts or posts',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'job-id', positional: true, required: true, help: 'Job ID returned by publish-video' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually mark the local job cancelled' },
  ],
  columns: ['status', 'command', 'job_id', 'stage', 'detail'],
  func: async (kwargs) => {
    if (!requireExecute(kwargs)) {
      return [{ status: 'dry_run_cancel', command: 'jobs-cancel', job_id: kwargs['job-id'], stage: '', detail: JSON.stringify({ message: 'jobs-cancel requires --execute' }) }];
    }
    const job = cancelJob(kwargs['job-id']);
    return [{ status: 'cancelled', command: 'jobs-cancel', job_id: job.job_id, stage: job.stage, detail: JSON.stringify({ next_command: job.next_command }) }];
  },
});
