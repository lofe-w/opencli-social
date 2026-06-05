import * as fs from 'node:fs';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { DOMAIN, SITE } from './lib/channels/constants.js';
import { gotoPublishPage, rawBrowserRequest } from './lib/channels/page.js';
import { requireExecute } from './lib/channels/validation.js';

cli({
  site: SITE,
  name: 'request',
  access: 'write',
  description: 'Guarded raw same-origin browser request under channels.weixin.qq.com',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  siteSession: 'ephemeral',
  navigateBefore: false,
  args: [
    { name: 'method', positional: true, required: true, help: 'HTTP method: get, head, post, put, patch, or delete' },
    { name: 'path', positional: true, required: true, help: 'Same-origin path or URL under channels.weixin.qq.com' },
    { name: 'body', required: false, help: 'JSON request body for non-GET/HEAD requests' },
    { name: 'body-file', required: false, help: 'Read JSON request body from file' },
    { name: 'execute', type: 'bool', default: false, help: 'Allow non-GET/HEAD raw requests' },
  ],
  columns: ['status', 'method', 'path', 'http_status', 'request_id', 'response'],
  func: async (page, kwargs) => {
    const method = String(kwargs.method || '').toUpperCase();
    const isReadOnly = ['GET', 'HEAD'].includes(method);
    const body = readJsonBody(kwargs, { optional: isReadOnly });
    if (!isReadOnly && !requireExecute(kwargs)) {
      return [{
        status: 'dry_run',
        method,
        path: kwargs.path || '',
        http_status: '',
        request_id: '',
        response: JSON.stringify({ message: 'Non-GET/HEAD raw requests require --execute.', body }),
      }];
    }
    await gotoPublishPage(page);
    const result = await rawBrowserRequest(page, method, kwargs.path, body);
    return [{
      status: 'ok',
      method,
      path: result.path,
      http_status: result.http_status,
      request_id: '',
      response: JSON.stringify(result.response || { text: result.text || '' }),
    }];
  },
});

function readJsonBody(kwargs, options = {}) {
  const inlineBody = kwargs.body == null ? '' : String(kwargs.body);
  const bodyFile = kwargs['body-file'] || '';
  if (inlineBody && bodyFile) {
    throw new ArgumentError('Pass either --body or --body-file, not both.');
  }
  if (!inlineBody && !bodyFile) {
    if (options.optional) return undefined;
    throw new ArgumentError('--body or --body-file is required for this request method.');
  }
  const text = bodyFile ? fs.readFileSync(String(bodyFile), 'utf-8') : inlineBody;
  try {
    return JSON.parse(text);
  } catch {
    throw new ArgumentError('Request body must be valid JSON.');
  }
}
