import { cli, Strategy } from '@jackwener/opencli/registry';
import { SITE } from './lib/channels/constants.js';
import { preflightVideoInput } from './lib/channels/validation.js';
import { dryRunRow } from './lib/channels/publishing.js';

cli({
  site: SITE,
  name: 'video-preflight',
  access: 'read',
  description: 'Validate local WeChat Channels video publishing input without remote browser actions',
  strategy: Strategy.LOCAL,
  browser: false,
  args: publishingArgs({ includeExecute: false }),
  columns: ['status', 'command', 'job_id', 'account_status', 'account_name', 'post_id', 'post_url', 'url', 'detail'],
  func: async (kwargs) => {
    const input = preflightVideoInput(kwargs);
    return dryRunRow(input, 'ok');
  },
});

function publishingArgs() {
  return [
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
  ];
}
