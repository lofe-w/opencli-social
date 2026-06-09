import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildArticle,
  configureProfileAuth,
  currentProfile,
  describeAuthConfig,
  doctor,
  getAccessToken,
  normalizePublishStatus,
  parseBool,
  parsePositiveInteger,
  preflightArticleInput,
  publishStatusRow,
  rawRequest,
  readContentInput,
  rewriteInlineImages,
  waitForPublishCompletion,
} from '../lib/wechat-article.js';

test('parseBool accepts common truthy and falsey values', () => {
  assert.equal(parseBool(true), true);
  assert.equal(parseBool('yes'), true);
  assert.equal(parseBool('0'), false);
  assert.equal(parseBool(undefined, true), true);
});

test('getAccessToken uses stable token endpoint by default', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ access_token: 'stable-token', expires_in: 7200 }), { status: 200 });
  };

  try {
    const env = configuredProfileEnv();
    const token = await getAccessToken({
      noCache: true,
      env,
    });

    assert.equal(token.accessToken, 'stable-token');
    assert.equal(token.source, 'stable_api');
    assert.equal(calls[0].url, 'https://api.weixin.qq.com/cgi-bin/stable_token');
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      grant_type: 'client_credential',
      appid: 'wx123',
      secret: 'secret123',
      force_refresh: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getAccessToken can use legacy token endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ access_token: 'legacy-token', expires_in: 7200 }), { status: 200 });
  };

  try {
    const env = configuredProfileEnv();
    const token = await getAccessToken({
      noCache: true,
      legacyToken: true,
      env,
    });

    assert.equal(token.accessToken, 'legacy-token');
    assert.equal(token.source, 'api');
    assert.match(calls[0].url, /\/cgi-bin\/token\?/);
    assert.equal(calls[0].init.method, 'GET');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('describeAuthConfig reports profile auth readiness without exposing secrets', () => {
  const env = configuredProfileEnv({ apiBase: 'https://api.weixin.qq.com/' });
  const config = describeAuthConfig(env);

  assert.equal(config.auth_source, 'profile_config');
  assert.equal(config.profile, 'oa-test');
  assert.equal(config.account_name, '测试公众号');
  assert.equal(config.access_token_present, false);
  assert.equal(config.ready, true);
  assert.equal(JSON.stringify(config).includes('secret123'), false);
  assert.equal(config.api_base, 'https://api.weixin.qq.com');
});

test('currentProfile resolves OpenCLI default profile aliases', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-config-'));
  fs.writeFileSync(path.join(configDir, 'browser-profiles.json'), JSON.stringify({
    version: 1,
    aliases: { work: 'ctx123' },
    defaultContextId: 'ctx123',
  }));

  assert.equal(currentProfile({ OPENCLI_CONFIG_DIR: configDir }), 'work');
  assert.equal(currentProfile({ OPENCLI_CONFIG_DIR: configDir, OPENCLI_PROFILE: 'ctx123' }), 'work');
  assert.equal(currentProfile({ OPENCLI_CONFIG_DIR: configDir, OPENCLI_PROFILE: 'personal' }), 'personal');
});

test('doctor returns missing_auth instead of throwing when profile is absent', async () => {
  const result = await doctor({ env: { OPENCLI_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-config-')) } });

  assert.equal(result.status, 'missing_auth');
  assert.equal(result.auth_source, 'missing_profile');
  assert.equal(result.profile, '');
  assert.equal(result.access_token_present, false);
  assert.equal(result.checks.some((check) => check.name === 'auth' && check.status === 'missing'), true);
});

test('doctor treats expired profile cache without a secret as missing auth', async () => {
  const env = profileEnv();
  const dir = path.join(env.OPENCLI_SOCIAL_HOME, 'profiles', env.OPENCLI_PROFILE, 'social-wechat-article');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    schema_version: 1,
    platform: 'social-wechat-article',
    profile: env.OPENCLI_PROFILE,
    display_name: '测试公众号',
    app_id: 'wx123',
    api_base: 'https://api.weixin.qq.com',
    secret_ref: 'profile-secret:app-secret',
  }));
  fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({
    appId: 'wx123',
    mode: 'stable',
    apiBase: 'https://api.weixin.qq.com',
    accessToken: 'expired-token',
    expiresAt: Date.now() - 1000,
  }));

  const result = await doctor({ env });

  assert.equal(result.status, 'missing_auth');
  assert.equal(result.auth_source, 'stale_cache');
  assert.equal(result.cache_present, true);
  assert.equal(result.cache_fresh, false);
  assert.equal(JSON.stringify(result).includes('expired-token'), false);
});

test('fresh profile token cache works even when app secret is unavailable', async () => {
  const env = profileEnv();
  const dir = path.join(env.OPENCLI_SOCIAL_HOME, 'profiles', env.OPENCLI_PROFILE, 'social-wechat-article');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    schema_version: 1,
    platform: 'social-wechat-article',
    profile: env.OPENCLI_PROFILE,
    display_name: '测试公众号',
    app_id: 'wx123',
    api_base: 'https://api.weixin.qq.com',
    secret_ref: 'profile-secret:app-secret',
  }));
  fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({
    appId: 'wx123',
    mode: 'stable',
    apiBase: 'https://api.weixin.qq.com',
    accessToken: 'fresh-token',
    expiresAt: Date.now() + 60 * 60 * 1000,
  }));

  const result = await doctor({ env });
  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'cache');
  assert.equal(result.cache_fresh, true);

  const token = await getAccessToken({ env });
  assert.equal(token.accessToken, 'fresh-token');
  assert.equal(token.source, 'cache');
  assert.equal(token.profile, 'oa-test');
});

test('doctor can check token acquisition without printing the token', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ access_token: 'doctor-token', expires_in: 7200 }), { status: 200 });

  try {
    const env = configuredProfileEnv();
    const result = await doctor({
      checkToken: true,
      noCache: true,
      env,
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.token_source, 'stable_api');
    assert.equal(JSON.stringify(result).includes('doctor-token'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rawRequest appends configured auth and parses JSON responses', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, path: new URL(String(url)).pathname }), { status: 200 });
  };

  try {
    const env = configuredProfileEnv();
    const result = await rawRequest('get', '/cgi-bin/test?x=1', {
      env,
      accessToken: 'secret-token',
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.method, 'GET');
    assert.deepEqual(result.response, { ok: true, path: '/cgi-bin/test' });
    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get('x'), '1');
    assert.equal(url.searchParams.get('access_token'), 'secret-token');
    assert.equal(calls[0].init.method, 'GET');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('readContentInput rejects positional content and content-file together', () => {
  assert.throws(() => readContentInput({
    content: '<p>inline</p>',
    'content-file': './article.html',
  }), /either positional <content> or --content-file/);
});

test('readContentInput reads content-file and records its base directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-wechat-article-'));
  const filePath = path.join(dir, 'article.html');
  fs.writeFileSync(filePath, '<p>from file</p>');

  const input = readContentInput({ 'content-file': filePath });
  assert.equal(input.content, '<p>from file</p>');
  assert.equal(input.baseDir, dir);
  assert.equal(input.source, filePath);
});

test('buildArticle maps draft fields to WeChat API shape', () => {
  const article = buildArticle({
    title: '标题',
    author: '作者',
    digest: '摘要',
    'source-url': 'https://example.com',
    'show-cover-pic': true,
    'need-open-comment': true,
    'only-fans-can-comment': false,
  }, '<p>content</p>', 'thumb123');

  assert.equal(article.title, '标题');
  assert.equal(article.thumb_media_id, 'thumb123');
  assert.equal(article.show_cover_pic, 1);
  assert.equal(article.need_open_comment, 1);
  assert.equal(article.only_fans_can_comment, 0);
  assert.equal(article.content_source_url, 'https://example.com');
});

test('buildArticle rejects over-limit fields before remote submission', () => {
  assert.throws(() => buildArticle({
    title: '超'.repeat(33),
  }, '<p>content</p>', 'thumb123'), /title must be at most 32 characters/);

  assert.throws(() => buildArticle({
    title: '标题',
    author: '作'.repeat(17),
  }, '<p>content</p>', 'thumb123'), /author must be at most 16 characters/);

  assert.throws(() => buildArticle({
    title: '标题',
  }, 'a'.repeat(20000), 'thumb123'), /content must be fewer than 20000 characters/);

  assert.throws(() => buildArticle({
    title: '标题',
    'source-url': 'ftp://example.com',
  }, '<p>content</p>', 'thumb123'), /content_source_url must use http or https/);
});

test('buildArticle rejects inline images that were not uploaded to WeChat first', () => {
  assert.throws(() => buildArticle({
    title: '标题',
  }, '<p><img src="https://example.com/a.jpg"></p>', 'thumb123'), /uploadimg URL/);
});

test('buildArticle rejects mutually exclusive or dependent article options', () => {
  assert.throws(() => buildArticle({
    title: '标题',
    'thumb-media-id': 'thumb123',
    'cover-image': './cover.jpg',
  }, '<p>content</p>', 'thumb123'), /either --thumb-media-id or --cover-image/);

  assert.throws(() => buildArticle({
    title: '标题',
    'only-fans-can-comment': true,
  }, '<p>content</p>', 'thumb123'), /requires --need-open-comment/);
});

test('preflightArticleInput requires cover source when execution will create a real draft', async () => {
  await assert.rejects(() => preflightArticleInput({
    title: '标题',
  }, {
    content: '<p>content</p>',
    baseDir: process.cwd(),
  }), /thumb_media_id is required/);

  const dry = await preflightArticleInput({
    title: '标题',
  }, {
    content: '<p>content</p>',
    baseDir: process.cwd(),
  }, {
    allowMissingThumb: true,
  });
  assert.equal(dry.article.thumb_media_id, 'dry_run_thumb_media_id');
});

test('preflightArticleInput validates cover image before remote writes', async () => {
  await assert.rejects(() => preflightArticleInput({
    title: '标题',
    'cover-image': '/missing/cover.jpg',
  }, {
    content: '<p>content</p>',
    baseDir: process.cwd(),
  }), /permanent image file not found/);
});

test('buildArticle accepts WeChat inline image URLs', () => {
  const article = buildArticle({
    title: '标题',
  }, '<p><img src="https://mmbiz.qpic.cn/sz_mmbiz_jpg/test/0"></p>', 'thumb123');

  assert.equal(article.content.includes('mmbiz.qpic.cn'), true);
});

test('rewriteInlineImages dry-run validates local images and rewrites to WeChat placeholders', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-wechat-article-'));
  const imagePath = path.join(dir, 'inline.jpg');
  fs.writeFileSync(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const rewritten = await rewriteInlineImages('<p><img src="./inline.jpg"></p>', {
    enabled: true,
    baseDir: dir,
    dryRun: true,
  });

  assert.match(rewritten.content, /https:\/\/mmbiz\.qpic\.cn\/dry-run\/inline\.jpg/);
  assert.equal(rewritten.images.length, 1);
  assert.equal(rewritten.images[0].status, 'dry_run_upload');
});

test('rewriteInlineImages uploads local images with the provided upload function', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-wechat-article-'));
  const imagePath = path.join(dir, 'inline.png');
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const uploadedPaths = [];
  const rewritten = await rewriteInlineImages('<p><img src="inline.png"></p>', {
    enabled: true,
    baseDir: dir,
    uploadImage: async (filePath) => {
      uploadedPaths.push(filePath);
      return { url: 'https://mmbiz.qpic.cn/uploaded/inline.png' };
    },
  });

  assert.deepEqual(uploadedPaths, [imagePath]);
  assert.match(rewritten.content, /https:\/\/mmbiz\.qpic\.cn\/uploaded\/inline\.png/);
  assert.equal(rewritten.images[0].status, 'uploaded');
});

test('rewriteInlineImages refuses remote non-WeChat images even when enabled', async () => {
  await assert.rejects(() => rewriteInlineImages('<img src="https://example.com/a.jpg">', {
    enabled: true,
  }), /Remote inline image cannot be uploaded automatically/);
});

test('normalizePublishStatus follows WeChat freepublish status semantics', () => {
  assert.equal(normalizePublishStatus(0).status, 'published');
  assert.equal(normalizePublishStatus(0).terminal, true);
  assert.equal(normalizePublishStatus(1).status, 'publishing');
  assert.equal(normalizePublishStatus(1).terminal, false);
  assert.equal(normalizePublishStatus(2).status, 'originality_failed');
  assert.equal(normalizePublishStatus(4).status, 'review_rejected');
});

test('publishStatusRow includes final article URLs and failure indexes', () => {
  const row = publishStatusRow({
    publish_id: 'pub123',
    publish_status: 0,
    article_id: 'article123',
    article_detail: {
      item: [
        { idx: 1, article_url: 'https://mp.weixin.qq.com/s/a' },
        { idx: 2, article_url: 'https://mp.weixin.qq.com/s/b' },
      ],
    },
    fail_idx: [],
  });

  assert.equal(row.status, 'published');
  assert.equal(row.article_id, 'article123');
  assert.equal(row.article_url, 'https://mp.weixin.qq.com/s/a,https://mp.weixin.qq.com/s/b');
  assert.equal(row.fail_idx, '');
});

test('waitForPublishCompletion can fail command on terminal publish failure', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    publish_id: 'pub123',
    publish_status: 4,
    fail_idx: [1],
  }), { status: 200 });

  try {
    await assert.rejects(() => waitForPublishCompletion('pub123', 'token123', {
      timeoutSeconds: 1,
      intervalSeconds: 1,
      failOnFailure: true,
    }), /finished unsuccessfully: review_rejected/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('waitForPublishCompletion returns terminal failure when failOnFailure is disabled', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    publish_id: 'pub123',
    publish_status: 4,
    fail_idx: [1],
  }), { status: 200 });

  try {
    const result = await waitForPublishCompletion('pub123', 'token123', {
      timeoutSeconds: 1,
      intervalSeconds: 1,
    });
    assert.equal(result.publish_status, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('parsePositiveInteger rejects invalid wait options', () => {
  assert.equal(parsePositiveInteger('5', 'interval-seconds'), 5);
  assert.throws(() => parsePositiveInteger('0', 'interval-seconds'), /positive integer/);
  assert.throws(() => parsePositiveInteger('1.5', 'interval-seconds'), /positive integer/);
});

function profileEnv() {
  return {
    OPENCLI_PROFILE: 'oa-test',
    OPENCLI_SOCIAL_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-social-home-')),
  };
}

function configuredProfileEnv(options = {}) {
  const env = profileEnv();
  configureProfileAuth({
    appId: options.appId || 'wx123',
    appSecret: options.appSecret || 'secret123',
    displayName: options.displayName || '测试公众号',
    apiBase: options.apiBase || 'https://api.weixin.qq.com',
    env,
  });
  return env;
}
