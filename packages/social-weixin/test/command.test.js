import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';

const PACKAGE_ROOT = new URL('..', import.meta.url);
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

test('OpenCLI commands can create and publish a draft against a mock WeChat API', async (t) => {
  if (!opencliSocialWeixinAvailable()) {
    t.skip('opencli social-weixin is not installed in this environment');
    return;
  }

  const requests = [];
  const serverErrors = [];
  let statusCalls = 0;
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      const url = new URL(req.url, 'http://127.0.0.1');
      requests.push({ method: req.method, pathname: url.pathname, search: url.search, body });

      if (url.pathname === '/cgi-bin/stable_token') {
        writeJson(res, { access_token: 'mock-token', expires_in: 7200 });
        return;
      }
      if (url.pathname === '/cgi-bin/draft/add') {
        assert.equal(url.searchParams.get('access_token'), 'mock-token');
        const payload = JSON.parse(body);
        assert.equal(payload.articles[0].title, '测试标题');
        assert.equal(payload.articles[0].thumb_media_id, 'thumb123');
        assert.equal(payload.articles[0].content, '<p>hello</p>');
        writeJson(res, { media_id: 'draft-media-123' });
        return;
      }
      if (url.pathname === '/cgi-bin/freepublish/submit') {
        assert.equal(url.searchParams.get('access_token'), 'mock-token');
        assert.deepEqual(JSON.parse(body), { media_id: 'draft-media-123' });
        writeJson(res, { publish_id: 'publish-123', msg_data_id: 'msg-123' });
        return;
      }
      if (url.pathname === '/cgi-bin/freepublish/get') {
        assert.equal(url.searchParams.get('access_token'), 'mock-token');
        assert.deepEqual(JSON.parse(body), { publish_id: 'publish-123' });
        statusCalls += 1;
        writeJson(res, {
          publish_id: 'publish-123',
          publish_status: 0,
          article_id: 'article-123',
          article_detail: {
            item: [{ idx: 1, article_url: 'https://mp.weixin.qq.com/s/mock' }],
          },
        });
        return;
      }

      writeJson(res, { errcode: 404, errmsg: `unexpected path ${url.pathname}` }, 404);
    } catch (err) {
      serverErrors.push(err);
      writeJson(res, { errcode: 500, errmsg: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  await listen(server);
  t.after(() => server.close());

  const apiBase = `http://127.0.0.1:${server.address().port}`;
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-cache-'));
  const appId = `wx-test-${process.pid}-${Date.now()}`;
  const commonEnv = {
    ...process.env,
    SOCIAL_WEIXIN_API_BASE: apiBase,
    SOCIAL_WEIXIN_CACHE_DIR: cacheDir,
    SOCIAL_WEIXIN_APP_ID: appId,
    SOCIAL_WEIXIN_APP_SECRET: 'secret-test',
  };

  const draft = await runOpencli([
    'social-weixin',
    'draft-add',
    '<p>hello</p>',
    '--title',
    '测试标题',
    '--thumb-media-id',
    'thumb123',
    '--execute',
    '-f',
    'json',
  ], commonEnv);
  assert.equal(draft[0].status, 'draft_created');
  assert.equal(draft[0].media_id, 'draft-media-123');

  const published = await runOpencli([
    'social-weixin',
    'publish',
    'draft-media-123',
    '--wait',
    '--timeout-seconds',
    '1',
    '--interval-seconds',
    '1',
    '--execute',
    '-f',
    'json',
  ], commonEnv);
  assert.equal(published[0].status, 'published');
  assert.equal(published[0].publish_id, 'publish-123');
  assert.equal(published[0].article_url, 'https://mp.weixin.qq.com/s/mock');
  assert.equal(published[0].msg_data_id, 'msg-123');

  const queried = await runOpencli([
    'social-weixin',
    'publish-status',
    'publish-123',
    '--wait',
    '--timeout-seconds',
    '1',
    '--interval-seconds',
    '1',
    '-f',
    'json',
  ], commonEnv);
  assert.equal(queried[0].status, 'published');
  assert.equal(queried[0].article_id, 'article-123');
  assert.deepEqual(serverErrors, []);
  assert.ok(statusCalls >= 2);
  assert.deepEqual(requests.map((request) => request.pathname), [
    '/cgi-bin/stable_token',
    '/cgi-bin/draft/add',
    '/cgi-bin/freepublish/submit',
    '/cgi-bin/freepublish/get',
    '/cgi-bin/freepublish/get',
  ]);
});

test('publish-article uploads cover and inline images before publishing', async (t) => {
  if (!opencliSocialWeixinAvailable()) {
    t.skip('opencli social-weixin is not installed in this environment');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-article-'));
  const coverPath = path.join(tempDir, 'cover.jpg');
  const inlinePath = path.join(tempDir, 'inline.png');
  const articlePath = path.join(tempDir, 'article.html');
  fs.writeFileSync(coverPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(inlinePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(articlePath, '<p>hello</p><img src="./inline.png">');

  const requests = [];
  const serverErrors = [];
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      const url = new URL(req.url, 'http://127.0.0.1');
      requests.push({
        method: req.method,
        pathname: url.pathname,
        search: url.search,
        contentType: req.headers['content-type'] || '',
        body,
      });

      if (url.pathname === '/cgi-bin/stable_token') {
        writeJson(res, { access_token: 'mock-token', expires_in: 7200 });
        return;
      }
      if (url.pathname === '/cgi-bin/material/add_material') {
        assert.equal(url.searchParams.get('access_token'), 'mock-token');
        assert.equal(url.searchParams.get('type'), 'image');
        assert.match(req.headers['content-type'] || '', /multipart\/form-data/);
        writeJson(res, { media_id: 'cover-media-123', url: 'https://mmbiz.qpic.cn/cover.jpg' });
        return;
      }
      if (url.pathname === '/cgi-bin/media/uploadimg') {
        assert.equal(url.searchParams.get('access_token'), 'mock-token');
        assert.match(req.headers['content-type'] || '', /multipart\/form-data/);
        writeJson(res, { url: 'https://mmbiz.qpic.cn/inline.png' });
        return;
      }
      if (url.pathname === '/cgi-bin/draft/add') {
        assert.equal(url.searchParams.get('access_token'), 'mock-token');
        const payload = JSON.parse(body);
        const article = payload.articles[0];
        assert.equal(article.title, '复合发布测试');
        assert.equal(article.thumb_media_id, 'cover-media-123');
        assert.equal(article.content, '<p>hello</p><img src="https://mmbiz.qpic.cn/inline.png">');
        writeJson(res, { media_id: 'draft-media-composite' });
        return;
      }
      if (url.pathname === '/cgi-bin/freepublish/submit') {
        assert.equal(url.searchParams.get('access_token'), 'mock-token');
        assert.deepEqual(JSON.parse(body), { media_id: 'draft-media-composite' });
        writeJson(res, { publish_id: 'publish-composite', msg_data_id: 'msg-composite' });
        return;
      }
      if (url.pathname === '/cgi-bin/freepublish/get') {
        assert.equal(url.searchParams.get('access_token'), 'mock-token');
        assert.deepEqual(JSON.parse(body), { publish_id: 'publish-composite' });
        writeJson(res, {
          publish_id: 'publish-composite',
          publish_status: 0,
          article_id: 'article-composite',
          article_detail: {
            item: [{ idx: 1, article_url: 'https://mp.weixin.qq.com/s/composite' }],
          },
        });
        return;
      }

      writeJson(res, { errcode: 404, errmsg: `unexpected path ${url.pathname}` }, 404);
    } catch (err) {
      serverErrors.push(err);
      writeJson(res, { errcode: 500, errmsg: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  await listen(server);
  t.after(() => server.close());

  const apiBase = `http://127.0.0.1:${server.address().port}`;
  const commonEnv = {
    ...process.env,
    SOCIAL_WEIXIN_API_BASE: apiBase,
    SOCIAL_WEIXIN_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-cache-')),
    SOCIAL_WEIXIN_APP_ID: `wx-test-${process.pid}-${Date.now()}-composite`,
    SOCIAL_WEIXIN_APP_SECRET: 'secret-test',
  };

  const published = await runOpencli([
    'social-weixin',
    'publish-article',
    '--content-file',
    articlePath,
    '--title',
    '复合发布测试',
    '--cover-image',
    coverPath,
    '--upload-inline-images',
    '--publish',
    '--wait',
    '--timeout-seconds',
    '1',
    '--interval-seconds',
    '1',
    '--execute',
    '-f',
    'json',
  ], commonEnv);

  assert.deepEqual(serverErrors, []);
  assert.equal(published[0].status, 'published');
  assert.equal(published[0].draft_media_id, 'draft-media-composite');
  assert.equal(published[0].publish_id, 'publish-composite');
  assert.equal(published[0].article_url, 'https://mp.weixin.qq.com/s/composite');
  const detail = JSON.parse(published[0].detail);
  assert.equal(detail.thumb_media_id, 'cover-media-123');
  assert.equal(detail.inline_images[0].status, 'uploaded');
  assert.equal(detail.inline_images[0].url, 'https://mmbiz.qpic.cn/inline.png');
  assert.deepEqual(requests.map((request) => request.pathname), [
    '/cgi-bin/stable_token',
    '/cgi-bin/material/add_material',
    '/cgi-bin/media/uploadimg',
    '/cgi-bin/draft/add',
    '/cgi-bin/freepublish/submit',
    '/cgi-bin/freepublish/get',
  ]);
});

test('standalone upload commands call the expected WeChat media endpoints', async (t) => {
  if (!opencliSocialWeixinAvailable()) {
    t.skip('opencli social-weixin is not installed in this environment');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-upload-'));
  const coverPath = path.join(tempDir, 'cover.jpg');
  const inlinePath = path.join(tempDir, 'inline.png');
  fs.writeFileSync(coverPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(inlinePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const requests = [];
  const serverErrors = [];
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      const url = new URL(req.url, 'http://127.0.0.1');
      requests.push({
        method: req.method,
        pathname: url.pathname,
        search: url.search,
        contentType: req.headers['content-type'] || '',
        body,
      });

      if (url.pathname === '/cgi-bin/stable_token') {
        writeJson(res, { access_token: 'mock-token', expires_in: 7200 });
        return;
      }
      if (url.pathname === '/cgi-bin/material/add_material') {
        assert.equal(url.searchParams.get('access_token'), 'mock-token');
        assert.equal(url.searchParams.get('type'), 'image');
        assert.match(req.headers['content-type'] || '', /multipart\/form-data/);
        writeJson(res, { media_id: 'standalone-cover-media', url: 'https://mmbiz.qpic.cn/standalone-cover.jpg' });
        return;
      }
      if (url.pathname === '/cgi-bin/media/uploadimg') {
        assert.equal(url.searchParams.get('access_token'), 'mock-token');
        assert.match(req.headers['content-type'] || '', /multipart\/form-data/);
        writeJson(res, { url: 'https://mmbiz.qpic.cn/standalone-inline.png' });
        return;
      }

      writeJson(res, { errcode: 404, errmsg: `unexpected path ${url.pathname}` }, 404);
    } catch (err) {
      serverErrors.push(err);
      writeJson(res, { errcode: 500, errmsg: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  await listen(server);
  t.after(() => server.close());

  const commonEnv = {
    ...process.env,
    SOCIAL_WEIXIN_API_BASE: `http://127.0.0.1:${server.address().port}`,
    SOCIAL_WEIXIN_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-cache-')),
    SOCIAL_WEIXIN_APP_ID: `wx-test-${process.pid}-${Date.now()}-upload`,
    SOCIAL_WEIXIN_APP_SECRET: 'secret-test',
  };

  const cover = await runOpencli([
    'social-weixin',
    'upload-image',
    coverPath,
    '--execute',
    '-f',
    'json',
  ], commonEnv);
  assert.equal(cover[0].status, 'uploaded');
  assert.equal(cover[0].media_id, 'standalone-cover-media');
  assert.equal(cover[0].url, 'https://mmbiz.qpic.cn/standalone-cover.jpg');

  const inline = await runOpencli([
    'social-weixin',
    'upload-content-image',
    inlinePath,
    '--execute',
    '-f',
    'json',
  ], commonEnv);
  assert.equal(inline[0].status, 'uploaded');
  assert.equal(inline[0].url, 'https://mmbiz.qpic.cn/standalone-inline.png');

  assert.deepEqual(serverErrors, []);
  assert.deepEqual(requests.map((request) => request.pathname), [
    '/cgi-bin/stable_token',
    '/cgi-bin/material/add_material',
    '/cgi-bin/media/uploadimg',
  ]);
});

test('doctor command reports missing auth as structured output', async (t) => {
  if (!opencliSocialWeixinAvailable()) {
    t.skip('opencli social-weixin is not installed in this environment');
    return;
  }

  const rows = await runOpencli([
    'social-weixin',
    'doctor',
    '-f',
    'json',
  ], {
    ...withoutWeixinCredentials(process.env),
    SOCIAL_WEIXIN_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-cache-')),
  });

  assert.equal(rows[0].status, 'missing_auth');
  assert.equal(rows[0].auth_source, 'missing');
  assert.equal(rows[0].access_token_present, false);
});

test('request command supports read-only raw GET and execute-gated POST', async (t) => {
  if (!opencliSocialWeixinAvailable()) {
    t.skip('opencli social-weixin is not installed in this environment');
    return;
  }

  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const url = new URL(req.url, 'http://127.0.0.1');
    requests.push({ method: req.method, pathname: url.pathname, accessToken: url.searchParams.get('access_token'), body });
    writeJson(res, {
      method: req.method,
      path: url.pathname,
      access_token_present: Boolean(url.searchParams.get('access_token')),
      body: body ? JSON.parse(body) : null,
    });
  });

  await listen(server);
  t.after(() => server.close());

  const commonEnv = {
    ...process.env,
    SOCIAL_WEIXIN_API_BASE: `http://127.0.0.1:${server.address().port}`,
    SOCIAL_WEIXIN_ACCESS_TOKEN: 'raw-secret-token',
  };

  const getRows = await runOpencli([
    'social-weixin',
    'request',
    'get',
    '/cgi-bin/test',
    '-f',
    'json',
  ], commonEnv);
  assert.equal(getRows[0].status, 'ok');
  assert.equal(JSON.parse(getRows[0].response).access_token_present, true);
  assert.equal(JSON.stringify(getRows).includes('raw-secret-token'), false);

  const dryRunRows = await runOpencli([
    'social-weixin',
    'request',
    'post',
    '/cgi-bin/test',
    '--body',
    '{"hello":"world"}',
    '-f',
    'json',
  ], commonEnv);
  assert.equal(dryRunRows[0].status, 'dry_run');

  const postRows = await runOpencli([
    'social-weixin',
    'request',
    'post',
    '/cgi-bin/test',
    '--body',
    '{"hello":"world"}',
    '--execute',
    '-f',
    'json',
  ], commonEnv);
  assert.equal(postRows[0].status, 'ok');
  assert.deepEqual(JSON.parse(postRows[0].response).body, { hello: 'world' });
  assert.deepEqual(requests.map((request) => request.method), ['GET', 'POST']);
  assert.deepEqual(requests.map((request) => request.accessToken), ['raw-secret-token', 'raw-secret-token']);
});

test('live publish script dry-runs the generated sample without remote writes', async (t) => {
  if (!opencliSocialWeixinAvailable()) {
    t.skip('opencli social-weixin is not installed in this environment');
    return;
  }

  const result = await spawnCommand('npm', ['run', 'publish:weixin-live-sample', '--', '--dry-run'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SOCIAL_WEIXIN_LIVE_TITLE: 'OpenCLI 脚本 dry-run 测试',
    },
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Created .*tmp\/weixin-live\/article\.html/);
  assert.match(result.stdout, /dry_run_draft_publish_and_wait/);
  assert.match(result.stdout, /OpenCLI 脚本 dry-run 测试/);
});

test('live publish script fails early when credentials are missing', async () => {
  const result = await spawnCommand('node', ['scripts/run-weixin-live-publish.js'], {
    cwd: REPO_ROOT,
    env: withoutWeixinCredentials(process.env),
  });

  assert.equal(result.code, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /Missing WeChat credentials for live publish/);
  assert.match(result.stderr, /SOCIAL_WEIXIN_ACCESS_TOKEN/);
});

function opencliSocialWeixinAvailable() {
  const result = spawnSync('opencli', ['social-weixin', 'doctor', '-f', 'json'], {
    cwd: PACKAGE_ROOT,
    env: {
      ...withoutWeixinCredentials(process.env),
      SOCIAL_WEIXIN_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-cache-')),
    },
    encoding: 'utf8',
  });
  return result.status === 0 && !/unknown command 'social-weixin'/.test(result.stderr);
}

async function runOpencli(args, env) {
  const result = await spawnOpencli(args, env);
  assert.equal(result.code, 0, [
    `status=${result.code}`,
    `signal=${result.signal}`,
    `stdout=${result.stdout}`,
    `stderr=${result.stderr}`,
  ].join('\n'));
  return parseJsonOutput(result.stdout);
}

function spawnOpencli(args, env) {
  return spawnCommand('opencli', args, {
    cwd: PACKAGE_ROOT,
    env,
  });
}

function spawnCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: 'utf8',
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`opencli timed out: ${args.join(' ')}`));
    }, 5000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function withoutWeixinCredentials(env) {
  const output = { ...env };
  for (const key of [
    'SOCIAL_WEIXIN_ACCESS_TOKEN',
    'SOCIAL_WEIXIN_APP_ID',
    'SOCIAL_WEIXIN_APP_SECRET',
  ]) {
    delete output[key];
  }
  return output;
}

function parseJsonOutput(output) {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  assert.ok(start >= 0 && end > start, `OpenCLI did not return a JSON array: ${output}`);
  return JSON.parse(output.slice(start, end + 1));
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function writeJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
