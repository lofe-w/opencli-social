import * as fs from 'node:fs';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { parseBool, rawRequest, requireExecute } from './lib/weixin.js';

cli({
  site: 'social-weixin',
  name: 'request',
  access: 'write',
  description: 'Raw WeChat API request using configured social-weixin auth',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
    { name: 'method', positional: true, required: true, help: 'HTTP method: get, head, post, put, patch, or delete' },
    { name: 'path', positional: true, required: true, help: 'WeChat API path, for example /cgi-bin/freepublish/get' },
    { name: 'body', required: false, help: 'JSON request body for POST/PUT/PATCH/DELETE' },
    { name: 'body-file', required: false, help: 'Read JSON request body from file' },
    { name: 'no-auth', type: 'bool', default: false, help: 'Do not append configured access_token' },
    { name: 'execute', type: 'bool', default: false, help: 'Allow non-GET/HEAD raw requests' },
  ],
  columns: ['status', 'method', 'path', 'response'],
  func: async (kwargs) => {
    const method = String(kwargs.method || '').toUpperCase();
    const path = String(kwargs.path || '');
    const isReadOnly = ['GET', 'HEAD'].includes(method);
    if (!isReadOnly && !requireExecute(kwargs)) {
      return [{
        status: 'dry_run',
        method,
        path,
        response: JSON.stringify({
          message: 'Non-GET/HEAD raw requests require --execute.',
          body: readJsonBody(kwargs, { optional: true }),
        }),
      }];
    }

    const result = await rawRequest(method, path, {
      json: readJsonBody(kwargs, { optional: isReadOnly }),
      noAuth: parseBool(kwargs['no-auth'], false),
    });
    return [{
      status: result.status,
      method: result.method,
      path: result.path,
      response: JSON.stringify(result.response),
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
  const text = bodyFile
    ? fsReadFile(String(bodyFile))
    : inlineBody;
  try {
    return JSON.parse(text);
  } catch {
    throw new ArgumentError('Request body must be valid JSON.');
  }
}

function fsReadFile(filePath) {
  const resolved = String(filePath);
  try {
    return fs.readFileSync(resolved, 'utf-8');
  } catch {
    throw new ArgumentError(`Request body file not found or unreadable: ${resolved}`);
  }
}
