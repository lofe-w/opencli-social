import { cli, Strategy } from '@jackwener/opencli/registry';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { dryRunRow, startPublishVideo } from './lib/channels/publishing.js';
import { preflightVideoInput, requireExecute } from './lib/channels/validation.js';

cli({
  site: SITE,
  name: 'publish-video',
  access: 'write',
  description: 'Create a recoverable WeChat Channels video publishing job, upload video, save draft, or submit publish',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'video', required: true, help: 'Local video path (.mp4/.mov/.avi/.webm)' },
    { name: 'description', required: false, help: 'Video description/caption text' },
    { name: 'description-file', required: false, help: 'Read video description from file' },
    { name: 'cover', required: false, help: 'Optional local cover image (.jpg/.jpeg/.png)' },
    { name: 'tags', required: false, help: 'Comma-separated topics without or with # prefix' },
    { name: 'short-title', required: false, help: 'Optional short title' },
    { name: 'schedule-at', required: false, help: 'Optional ISO 8601 scheduled publish time' },
    { name: 'publish-now', type: 'bool', default: false, help: 'Submit for publish instead of saving a draft' },
    { name: 'final-approval', required: false, default: 'required', help: 'required or skip; default required' },
    { name: 'hitl', required: false, default: 'interrupt', help: 'interrupt, wait, or fail' },
    { name: 'account-name', required: false, help: 'Expected Channels account display name' },
    { name: 'timeout', type: 'number', default: 600, help: 'Overall timeout seconds for upload and submit phases' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually open browser and perform remote write actions' },
  ],
  columns: ['status', 'command', 'reason', 'human_action', 'job_id', 'hitl_id', 'profile', 'account_status', 'account_name', 'post_id', 'post_url', 'url', 'message', 'screenshot_path', 'resume_command', 'expires_at', 'detail'],
  func: async (page, kwargs) => {
    const input = preflightVideoInput(kwargs);
    if (!requireExecute(kwargs)) return dryRunRow(input);
    return startPublishVideo(page, kwargs, {});
  },
});
