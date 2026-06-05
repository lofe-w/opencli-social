import { cli, Strategy } from '@jackwener/opencli/registry';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { createJob } from './lib/channels/jobs.js';
import { needsHuman } from './lib/channels/hitl.js';
import { gotoPublishPage, inspectPage } from './lib/channels/page.js';
import { requireExecute } from './lib/channels/validation.js';

cli({
  site: SITE,
  name: 'auth-begin',
  access: 'write',
  description: 'Open WeChat Channels creator login and return a resumable HITL login instruction',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'execute', type: 'bool', default: false, help: 'Actually open the login/creator page' },
  ],
  columns: ['status', 'command', 'reason', 'human_action', 'job_id', 'hitl_id', 'profile', 'url', 'message', 'screenshot_path', 'resume_command', 'expires_at', 'detail'],
  func: async (page, kwargs) => {
    if (!requireExecute(kwargs)) {
      return [{ status: 'dry_run_auth_begin', command: 'auth-begin', reason: '', human_action: '', job_id: '', hitl_id: '', profile: '', url: '', message: 'auth-begin requires --execute to open the browser page', screenshot_path: '', resume_command: '', expires_at: '', detail: '{}' }];
    }
    const { job } = createJob({
      video: process.argv[1] || '/dev/null',
      cover: '',
      caption: 'auth-begin',
      description_source: 'argument',
      tags: [],
      short_title: '',
      schedule_at: '',
      publish_now: false,
      final_approval: 'required',
      account_name: '',
    });
    await gotoPublishPage(page);
    const info = await inspectPage(page);
    if (!info.login_like) {
      return [{ status: 'ok', command: 'auth-begin', reason: '', human_action: '', job_id: job.job_id, hitl_id: '', profile: job.profile || '', url: info.url || '', message: 'Already logged in to WeChat Channels creator center.', screenshot_path: '', resume_command: '', expires_at: '', detail: JSON.stringify(info) }];
    }
    const row = await needsHuman(page, job, 'login_required', 'login_in_opencli_chrome_profile', {
      command: 'auth-begin',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    return [row];
  },
});
