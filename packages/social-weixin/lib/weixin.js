import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';

const DEFAULT_API_BASE = 'https://api.weixin.qq.com';
const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.opencli-social');
const TOKEN_SKEW_MS = 5 * 60 * 1000;
const ONE_MIB = 1024 * 1024;
const TEN_MIB = 10 * ONE_MIB;

const PERMANENT_IMAGE_EXTENSIONS = new Set(['.bmp', '.gif', '.jpg', '.jpeg', '.png']);
const CONTENT_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const WEIXIN_IMAGE_HOSTS = new Set(['mmbiz.qpic.cn', 'mmbiz.qlogo.cn', 'mmbiz.qpic.com']);
const PUBLISH_STATUS = new Map([
  [0, { status: 'published', terminal: true, failure: false, label: 'success' }],
  [1, { status: 'publishing', terminal: false, failure: false, label: 'publishing' }],
  [2, { status: 'originality_failed', terminal: true, failure: true, label: 'originality check failed' }],
  [3, { status: 'failed', terminal: true, failure: true, label: 'general publish failure' }],
  [4, { status: 'review_rejected', terminal: true, failure: true, label: 'platform review rejected' }],
  [5, { status: 'deleted_after_publish', terminal: true, failure: true, label: 'all articles deleted after publish' }],
  [6, { status: 'banned_after_publish', terminal: true, failure: true, label: 'all articles banned after publish' }],
]);

export function readCredentials(env = process.env) {
  return {
    appId: env.SOCIAL_WEIXIN_APP_ID || '',
    appSecret: env.SOCIAL_WEIXIN_APP_SECRET || '',
    accessToken: env.SOCIAL_WEIXIN_ACCESS_TOKEN || '',
  };
}

export function describeAuthConfig(env = process.env) {
  const credentials = readCredentials(env);
  const cache = readTokenCache(env);
  const hasAppCredentials = Boolean(credentials.appId && credentials.appSecret);
  const cacheFresh = Boolean(cache?.expiresAt && cache.expiresAt - Date.now() > TOKEN_SKEW_MS);
  let authSource = 'missing';
  if (credentials.accessToken) authSource = 'env_access_token';
  else if (hasAppCredentials) authSource = 'env_app_credentials';
  else if (cache?.accessToken && cacheFresh) authSource = 'cache';
  else if (cache?.accessToken) authSource = 'stale_cache';

  return {
    auth_source: authSource,
    api_base: apiBase(env),
    cache_path: tokenCachePath(env),
    cache_present: Boolean(cache?.accessToken),
    cache_expires_at: cache?.expiresAt ? new Date(cache.expiresAt).toISOString() : '',
    cache_fresh: cacheFresh,
    app_id_present: Boolean(credentials.appId),
    app_secret_present: Boolean(credentials.appSecret),
    access_token_present: Boolean(credentials.accessToken),
    ready: Boolean(credentials.accessToken || hasAppCredentials || (cache?.accessToken && cacheFresh)),
  };
}

export async function doctor(options = {}) {
  const env = options.env || process.env;
  const config = describeAuthConfig(env);
  const checkToken = parseBool(options.checkToken, false);
  const checks = [];

  if (config.access_token_present) {
    checks.push({ name: 'auth', status: 'ok', detail: 'access token is available from environment' });
  } else if (config.app_id_present && config.app_secret_present) {
    checks.push({ name: 'auth', status: 'ok', detail: 'app id and app secret are configured' });
  } else if (config.cache_present && config.cache_fresh) {
    checks.push({ name: 'auth', status: 'ok', detail: 'fresh cached token is available' });
  } else if (config.cache_present) {
    checks.push({ name: 'auth', status: 'missing', detail: 'cached token is expired; set app credentials or a fresh access token' });
  } else {
    checks.push({ name: 'auth', status: 'missing', detail: 'set SOCIAL_WEIXIN_ACCESS_TOKEN or SOCIAL_WEIXIN_APP_ID/SOCIAL_WEIXIN_APP_SECRET' });
  }

  checks.push({ name: 'api_base', status: 'ok', detail: config.api_base });
  checks.push({ name: 'cache', status: config.cache_present ? 'ok' : 'missing', detail: config.cache_path });

  let tokenSource = '';
  let expiresAt = '';
  if (checkToken && config.ready) {
    try {
      const token = await getAccessToken({
        noCache: options.noCache,
        forceRefresh: options.forceRefresh,
        legacyToken: options.legacyToken,
        env,
      });
      tokenSource = token.source;
      expiresAt = token.expiresAt ? new Date(token.expiresAt).toISOString() : '';
      checks.push({ name: 'token_request', status: 'ok', detail: token.source });
    } catch (err) {
      checks.push({ name: 'token_request', status: 'error', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  const hasError = checks.some((check) => check.status === 'error');
  const hasMissingAuth = checks.some((check) => check.name === 'auth' && check.status === 'missing');
  return {
    status: hasError ? 'error' : hasMissingAuth ? 'missing_auth' : 'ok',
    auth_source: config.auth_source,
    api_base: config.api_base,
    cache_path: config.cache_path,
    cache_present: config.cache_present,
    cache_fresh: config.cache_fresh,
    app_id_present: config.app_id_present,
    app_secret_present: config.app_secret_present,
    access_token_present: config.access_token_present,
    token_source: tokenSource,
    expires_at: expiresAt,
    checks,
  };
}

export function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  throw new ArgumentError(`Invalid boolean value: ${value}`);
}

export function requireExecute(kwargs) {
  if (!parseBool(kwargs.execute, false)) {
    return false;
  }
  return true;
}

export function readTextArg(kwargs) {
  return readContentInput(kwargs).content;
}

export function readContentInput(kwargs) {
  const contentFile = kwargs['content-file'] || kwargs.content_file || '';
  const positionalContent = kwargs.content == null ? '' : String(kwargs.content);
  if (contentFile && positionalContent.trim()) {
    throw new ArgumentError('Pass either positional <content> or --content-file, not both.');
  }
  if (contentFile) {
    const resolved = path.resolve(String(contentFile));
    try {
      return {
        content: fs.readFileSync(resolved, 'utf-8'),
        baseDir: path.dirname(resolved),
        source: resolved,
      };
    } catch {
      throw new ArgumentError(`Content file not found or unreadable: ${resolved}`);
    }
  }
  const content = positionalContent;
  if (!content.trim()) {
    throw new ArgumentError('Article content is required. Pass positional <content> or --content-file.');
  }
  return { content, baseDir: process.cwd(), source: 'argument' };
}

export function requireImageFile(filePath, options = {}) {
  const label = options.label || 'image';
  const extensions = options.extensions || PERMANENT_IMAGE_EXTENSIONS;
  const maxBytes = options.maxBytes || TEN_MIB;
  const resolved = path.resolve(String(filePath || ''));
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new ArgumentError(`${label} file not found: ${resolved}`);
  }
  if (!stat.isFile()) {
    throw new ArgumentError(`${label} path is not a file: ${resolved}`);
  }
  const ext = path.extname(resolved).toLowerCase();
  if (!extensions.has(ext)) {
    throw new ArgumentError(`Unsupported ${label} format "${ext}". Supported: ${[...extensions].map((item) => item.slice(1)).join('/')}`);
  }
  if (stat.size > maxBytes) {
    throw new ArgumentError(`${label} file is too large: ${stat.size} bytes. Maximum is ${maxBytes} bytes.`);
  }
  return resolved;
}

export function requireContentImageFile(filePath) {
  return requireImageFile(filePath, {
    label: 'content image',
    extensions: CONTENT_IMAGE_EXTENSIONS,
    maxBytes: ONE_MIB,
  });
}

export function requirePermanentImageFile(filePath) {
  return requireImageFile(filePath, {
    label: 'permanent image',
    extensions: PERMANENT_IMAGE_EXTENSIONS,
    maxBytes: TEN_MIB,
  });
}

export function buildArticle(kwargs, content, thumbMediaId) {
  const title = String(kwargs.title || '').trim();
  if (!title) throw new ArgumentError('--title is required');
  if (!thumbMediaId) throw new ArgumentError('thumb_media_id is required. Pass --thumb-media-id or --cover-image.');
  if (kwargs['thumb-media-id'] && kwargs['cover-image']) {
    throw new ArgumentError('Pass either --thumb-media-id or --cover-image, not both.');
  }

  const article = {
    title,
    thumb_media_id: thumbMediaId,
    author: String(kwargs.author || ''),
    digest: String(kwargs.digest || ''),
    show_cover_pic: parseBool(kwargs['show-cover-pic'], false) ? 1 : 0,
    content,
    content_source_url: String(kwargs['source-url'] || ''),
    need_open_comment: parseBool(kwargs['need-open-comment'], false) ? 1 : 0,
    only_fans_can_comment: parseBool(kwargs['only-fans-can-comment'], false) ? 1 : 0,
  };

  if (kwargs['pic-crop-235-1']) article.pic_crop_235_1 = String(kwargs['pic-crop-235-1']);
  if (kwargs['pic-crop-1-1']) article.pic_crop_1_1 = String(kwargs['pic-crop-1-1']);

  validateArticle(article);
  return article;
}

export function compactArticleForOutput(article) {
  return {
    title: article.title,
    author: article.author || '',
    digest: article.digest || '',
    thumb_media_id: article.thumb_media_id,
    need_open_comment: article.need_open_comment,
    only_fans_can_comment: article.only_fans_can_comment,
    content_length: article.content.length,
    content_bytes: Buffer.byteLength(article.content, 'utf8'),
  };
}

export function validateArticle(article) {
  requireTextLength(article.title, 'title', 32, true);
  requireTextLength(article.author, 'author', 16, false);
  requireTextLength(article.digest, 'digest', 128, false);
  requireTextBytes(article.content_source_url, 'content_source_url', 1024, false);
  validateOptionalUrl(article.content_source_url, 'content_source_url');

  if (!article.content || !String(article.content).trim()) {
    throw new ArgumentError('content is required');
  }
  const contentLength = Array.from(String(article.content)).length;
  if (contentLength >= 20000) {
    throw new ArgumentError(`content must be fewer than 20000 characters. Received ${contentLength}.`);
  }
  const contentBytes = Buffer.byteLength(String(article.content), 'utf8');
  if (contentBytes >= ONE_MIB) {
    throw new ArgumentError(`content must be smaller than 1 MiB. Received ${contentBytes} bytes.`);
  }

  validateCrop(article.pic_crop_235_1, 'pic_crop_235_1');
  validateCrop(article.pic_crop_1_1, 'pic_crop_1_1');
  if (article.only_fans_can_comment && !article.need_open_comment) {
    throw new ArgumentError('--only-fans-can-comment requires --need-open-comment.');
  }
  validateInlineImageSources(String(article.content));
}

export function normalizePublishStatus(value) {
  const numeric = Number(value);
  const known = PUBLISH_STATUS.get(numeric);
  if (known) return { code: numeric, ...known };
  return {
    code: Number.isNaN(numeric) ? null : numeric,
    status: value == null ? 'unknown' : `status_${value}`,
    terminal: false,
    failure: false,
    label: 'unknown',
  };
}

export function publishStatusRow(data, fallbackPublishId = '') {
  const normalized = normalizePublishStatus(data.publish_status);
  const items = Array.isArray(data.article_detail?.item) ? data.article_detail.item : [];
  return {
    status: normalized.status,
    publish_id: data.publish_id || fallbackPublishId,
    publish_status: data.publish_status ?? '',
    article_id: data.article_id || '',
    article_url: items.map((item) => item.article_url).filter(Boolean).join(','),
    fail_idx: Array.isArray(data.fail_idx) ? data.fail_idx.join(',') : data.fail_idx ?? '',
    raw: JSON.stringify(data),
  };
}

export async function rewriteInlineImages(content, options = {}) {
  const shouldUpload = parseBool(options.enabled, false);
  if (!shouldUpload) {
    validateInlineImageSources(String(content));
    return { content, images: [] };
  }

  const baseDir = options.baseDir || process.cwd();
  const dryRun = parseBool(options.dryRun, false);
  const uploadImage = options.uploadImage;
  const matches = [...String(content).matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi)];
  if (!matches.length) return { content, images: [] };

  let output = '';
  let cursor = 0;
  const images = [];

  for (const match of matches) {
    const fullTag = match[0];
    const quote = match[1];
    const src = match[2];
    const srcIndexInTag = fullTag.indexOf(`${quote}${src}${quote}`);
    const srcStart = match.index + srcIndexInTag + 1;
    const srcEnd = srcStart + src.length;

    output += String(content).slice(cursor, srcStart);

    if (isWeixinImageSrc(src)) {
      output += src;
      images.push({ source: src, url: src, status: 'kept' });
    } else {
      const localPath = resolveLocalImageSource(src, baseDir);
      requireContentImageFile(localPath);
      const uploaded = dryRun
        ? { url: `https://mmbiz.qpic.cn/dry-run/${encodeURIComponent(path.basename(localPath))}` }
        : await uploadImage(localPath);
      output += uploaded.url;
      images.push({ source: src, path: localPath, url: uploaded.url, status: dryRun ? 'dry_run_upload' : 'uploaded' });
    }

    cursor = srcEnd;
  }

  output += String(content).slice(cursor);
  return { content: output, images };
}

export async function preflightArticleInput(kwargs, contentInput, options = {}) {
  if (kwargs['cover-image']) requirePermanentImageFile(kwargs['cover-image']);
  const rewritten = await rewriteInlineImages(contentInput.content, {
    enabled: kwargs['upload-inline-images'],
    baseDir: contentInput.baseDir,
    dryRun: true,
  });
  const thumbMediaId = String(kwargs['thumb-media-id'] || '')
    || (kwargs['cover-image'] || parseBool(options.allowMissingThumb, false) ? 'dry_run_thumb_media_id' : '');
  const article = buildArticle(kwargs, rewritten.content, thumbMediaId);
  return { article, rewritten };
}

export async function getAccessToken(options = {}) {
  const { appId, appSecret, accessToken } = readCredentials(options.env || process.env);
  if (accessToken) {
    return { accessToken, source: 'env', expiresAt: null };
  }

  if (!appId || !appSecret) {
    throw new ArgumentError(
      'Missing WeChat credentials. Set SOCIAL_WEIXIN_ACCESS_TOKEN or SOCIAL_WEIXIN_APP_ID/SOCIAL_WEIXIN_APP_SECRET.'
    );
  }

  if (!options.noCache) {
    const cached = readTokenCache(options.env);
    if (
      cached &&
      cached.appId === appId &&
      cached.mode === tokenMode(options) &&
      cached.apiBase === apiBase(options.env) &&
      cached.accessToken &&
      cached.expiresAt &&
      cached.expiresAt - Date.now() > TOKEN_SKEW_MS
    ) {
      return { accessToken: cached.accessToken, source: 'cache', expiresAt: cached.expiresAt };
    }
  }

  const mode = tokenMode(options);
  const data = mode === 'legacy'
    ? await requestJson(
      `${apiBase(options.env)}/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
      { method: 'GET', accessTokenInQuery: false }
    )
    : await requestJson(`${apiBase(options.env)}/cgi-bin/stable_token`, {
      method: 'POST',
      json: {
        grant_type: 'client_credential',
        appid: appId,
        secret: appSecret,
        force_refresh: parseBool(options.forceRefresh, false),
      },
      accessTokenInQuery: false,
    });
  if (!data.access_token) {
    throw new CommandExecutionError(`WeChat token response missing access_token: ${JSON.stringify(data)}`);
  }
  const expiresAt = Date.now() + Number(data.expires_in || 7200) * 1000;
  writeTokenCache({ appId, mode, apiBase: apiBase(options.env), accessToken: data.access_token, expiresAt }, options.env);
  return { accessToken: data.access_token, source: mode === 'legacy' ? 'api' : 'stable_api', expiresAt };
}

export async function uploadPermanentImage(filePath, accessToken) {
  const resolved = requirePermanentImageFile(filePath);
  const form = new FormData();
  form.append('media', fileBlob(resolved), path.basename(resolved));
  const url = withAccessToken(`${apiBase()}/cgi-bin/material/add_material?type=image`, accessToken);
  const data = await requestJson(url, { method: 'POST', body: form, accessTokenInQuery: false });
  if (!data.media_id) {
    throw new CommandExecutionError(`WeChat material upload response missing media_id: ${JSON.stringify(data)}`);
  }
  return { mediaId: data.media_id, url: data.url || '', path: resolved };
}

export async function uploadContentImage(filePath, accessToken) {
  const resolved = requireContentImageFile(filePath);
  const form = new FormData();
  form.append('media', fileBlob(resolved), path.basename(resolved));
  const url = withAccessToken(`${apiBase()}/cgi-bin/media/uploadimg`, accessToken);
  const data = await requestJson(url, { method: 'POST', body: form, accessTokenInQuery: false });
  if (!data.url) {
    throw new CommandExecutionError(`WeChat content image upload response missing url: ${JSON.stringify(data)}`);
  }
  return { url: data.url, path: resolved };
}

export async function addDraft(article, accessToken) {
  const url = withAccessToken(`${apiBase()}/cgi-bin/draft/add`, accessToken);
  const data = await requestJson(url, {
    method: 'POST',
    json: { articles: [article] },
    accessTokenInQuery: false,
  });
  if (!data.media_id) {
    throw new CommandExecutionError(`WeChat draft add response missing media_id: ${JSON.stringify(data)}`);
  }
  return { mediaId: data.media_id };
}

export async function submitPublish(mediaId, accessToken) {
  if (!mediaId) throw new ArgumentError('media_id is required');
  const url = withAccessToken(`${apiBase()}/cgi-bin/freepublish/submit`, accessToken);
  const data = await requestJson(url, {
    method: 'POST',
    json: { media_id: mediaId },
    accessTokenInQuery: false,
  });
  if (!data.publish_id) {
    throw new CommandExecutionError(`WeChat publish submit response missing publish_id: ${JSON.stringify(data)}`);
  }
  return {
    publishId: data.publish_id,
    msgDataId: data.msg_data_id || '',
  };
}

export async function getPublishStatus(publishId, accessToken) {
  if (!publishId) throw new ArgumentError('publish_id is required');
  const url = withAccessToken(`${apiBase()}/cgi-bin/freepublish/get`, accessToken);
  const data = await requestJson(url, {
    method: 'POST',
    json: { publish_id: publishId },
    accessTokenInQuery: false,
  });
  return data;
}

export async function rawRequest(method, requestPath, options = {}) {
  const normalizedMethod = String(method || '').trim().toUpperCase();
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
    throw new ArgumentError(`Unsupported request method: ${method}`);
  }

  const url = buildApiUrl(requestPath, options.env);
  const shouldAuth = !parseBool(options.noAuth, false);
  const authenticatedUrl = shouldAuth
    ? withAccessToken(url, options.accessToken || (await getAccessToken({ env: options.env })).accessToken)
    : url;
  const data = await requestJson(authenticatedUrl, {
    method: normalizedMethod,
    json: options.json,
    accessTokenInQuery: false,
  });

  return {
    method: normalizedMethod,
    path: requestPath,
    status: 'ok',
    response: data,
  };
}

export async function waitForPublishCompletion(publishId, accessToken, options = {}) {
  const timeoutSeconds = parsePositiveInteger(options.timeoutSeconds ?? 300, 'timeout-seconds');
  const intervalSeconds = parsePositiveInteger(options.intervalSeconds ?? 5, 'interval-seconds');
  const failOnFailure = parseBool(options.failOnFailure, false);
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastData = null;

  while (Date.now() <= deadline) {
    lastData = await getPublishStatus(publishId, accessToken);
    const normalized = normalizePublishStatus(lastData.publish_status);
    if (normalized.terminal) {
      if (failOnFailure && normalized.failure) {
        throw new CommandExecutionError(
          `WeChat publish task ${publishId} finished unsuccessfully: ${normalized.status}. Result: ${JSON.stringify(lastData)}`
        );
      }
      return lastData;
    }
    await sleep(intervalSeconds * 1000);
  }

  throw new CommandExecutionError(
    `WeChat publish task did not finish within ${timeoutSeconds}s. Last status: ${JSON.stringify(lastData)}`
  );
}

export function parsePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ArgumentError(`${name} must be a positive integer. Received: ${value}`);
  }
  return number;
}

function readTokenCache(env = process.env) {
  try {
    return JSON.parse(fs.readFileSync(tokenCachePath(env), 'utf-8'));
  } catch {
    return null;
  }
}

function writeTokenCache(cache, env = process.env) {
  try {
    const filePath = tokenCachePath(env);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
  } catch {
    // Token caching is an optimization only.
  }
}

function tokenMode(options) {
  return parseBool(options.legacyToken, false) ? 'legacy' : 'stable';
}

export function apiBase(env = process.env) {
  return String(env?.SOCIAL_WEIXIN_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
}

function tokenCachePath(env = process.env) {
  return path.join(env?.SOCIAL_WEIXIN_CACHE_DIR || DEFAULT_CACHE_DIR, 'weixin-token.json');
}

function withAccessToken(url, accessToken) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(accessToken)}`;
}

function buildApiUrl(requestPath, env = process.env) {
  const text = String(requestPath || '').trim();
  if (!text) throw new ArgumentError('request path is required');
  if (/^https?:\/\//i.test(text)) {
    const parsed = new URL(text);
    const base = new URL(apiBase(env));
    if (parsed.origin !== base.origin) {
      throw new ArgumentError(`Raw request URL must stay under ${base.origin}`);
    }
    return parsed.toString();
  }
  if (!text.startsWith('/')) {
    throw new ArgumentError('request path must start with /');
  }
  return `${apiBase(env)}${text}`;
}

function fileBlob(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = ext === '.png'
    ? 'image/png'
    : ext === '.gif'
      ? 'image/gif'
      : ext === '.bmp'
        ? 'image/bmp'
        : 'image/jpeg';
  return new Blob([fs.readFileSync(filePath)], { type });
}

async function requestJson(url, options = {}) {
  const init = {
    method: options.method || 'GET',
    body: options.body,
    headers: options.headers || undefined,
  };
  if (options.json !== undefined) {
    init.body = JSON.stringify(options.json);
    init.headers = { ...(init.headers || {}), 'Content-Type': 'application/json' };
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new CommandExecutionError(`WeChat API request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new CommandExecutionError(`WeChat API returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new CommandExecutionError(`WeChat API HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  if (typeof data.errcode === 'number' && data.errcode !== 0) {
    throw new CommandExecutionError(formatWeixinApiError(data));
  }
  return data;
}

function requireTextLength(value, name, maxChars, required) {
  const text = String(value || '');
  if (required && !text.trim()) throw new ArgumentError(`${name} is required`);
  const length = Array.from(text).length;
  if (length > maxChars) {
    throw new ArgumentError(`${name} must be at most ${maxChars} characters. Received ${length}.`);
  }
}

function requireTextBytes(value, name, maxBytes, required) {
  const text = String(value || '');
  if (required && !text.trim()) throw new ArgumentError(`${name} is required`);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > maxBytes) {
    throw new ArgumentError(`${name} must be at most ${maxBytes} bytes. Received ${bytes}.`);
  }
}

function validateCrop(value, name) {
  if (!value) return;
  const parts = String(value).split('_').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0 || part > 1)) {
    throw new ArgumentError(`${name} must use x1_y1_x2_y2 with each value between 0 and 1.`);
  }
  const [x1, y1, x2, y2] = parts;
  if (x1 >= x2 || y1 >= y2) {
    throw new ArgumentError(`${name} must have x1 < x2 and y1 < y2.`);
  }
}

function validateOptionalUrl(value, name) {
  if (!value) return;
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new ArgumentError(`${name} must be a valid URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ArgumentError(`${name} must use http or https.`);
  }
}

function validateInlineImageSources(content) {
  const imageSources = [...content.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter(Boolean);
  for (const src of imageSources) {
    let parsed;
    try {
      parsed = new URL(src);
    } catch {
      throw new ArgumentError(
        `Article inline image must use a WeChat uploadimg URL. Invalid image src: ${src}`
      );
    }
    if (!WEIXIN_IMAGE_HOSTS.has(parsed.hostname)) {
      throw new ArgumentError(
        `Article inline image must use a WeChat uploadimg URL before draft submission: ${src}`
      );
    }
  }
}

function isWeixinImageSrc(src) {
  try {
    const parsed = new URL(src);
    return WEIXIN_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function resolveLocalImageSource(src, baseDir) {
  if (/^https?:\/\//i.test(src)) {
    throw new ArgumentError(`Remote inline image cannot be uploaded automatically. Download it first or upload it with upload-content-image: ${src}`);
  }
  if (/^data:/i.test(src)) {
    throw new ArgumentError('Data URL inline images are not supported. Save the image as a local jpg/png file first.');
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) && !/^file:/i.test(src)) {
    throw new ArgumentError(`Unsupported inline image URL scheme: ${src}`);
  }
  if (/^file:/i.test(src)) {
    try {
      return fileURLToPath(src);
    } catch {
      throw new ArgumentError(`Invalid file URL for inline image: ${src}`);
    }
  }
  return path.resolve(baseDir, src);
}

function formatWeixinApiError(data) {
  const base = `WeChat API error ${data.errcode}: ${data.errmsg || ''}`;
  switch (Number(data.errcode)) {
    case 40164:
      return `${base}. Configure the current server IP in the WeChat Official Account API IP whitelist.`;
    case 48001:
      return `${base}. The account is not authorized for this API; publishing APIs require an eligible account and may require certification.`;
    case 53503:
      return `${base}. The draft did not pass WeChat publish checks; inspect the draft in the Official Account console.`;
    case 53504:
    case 53505:
      return `${base}. WeChat requires this draft to be opened and saved manually in the Official Account console before publishing.`;
    default:
      return base;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
