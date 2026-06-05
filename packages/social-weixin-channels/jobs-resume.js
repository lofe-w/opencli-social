import { cli, Strategy } from '@jackwener/opencli/registry';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { resumePublishVideo } from './lib/channels/publishing.js';
import { requireExecute } from './lib/channels/validation.js';

cli({
  site: SITE,
  name: 'jobs-resume',
  access: 'write',
  description: 'Resume a recoverable WeChat Channels publish job from local metadata',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'job-id', positional: true, required: true, help: 'Job ID returned by publish-video' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually resume browser write actions' },
  ],
  columns: ['status', 'command', 'reason', 'human_action', 'job_id', 'hitl_id', 'profile', 'account_status', 'account_name', 'post_id', 'post_url', 'url', 'message', 'screenshot_path', 'resume_command', 'expires_at', 'detail'],
  func: async (page, kwargs) => {
    if (!requireExecute(kwargs)) {
      return [{ status: 'dry_run_resume', command: 'jobs-resume', job_id: kwargs['job-id'], detail: JSON.stringify({ message: 'jobs-resume requires --execute' }) }];
    }
    return resumePublishVideo(page, kwargs['job-id']);
  },
});
