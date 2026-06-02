import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';

const API_BASE = 'https://api.weixin.qq.com';
const CACHE_DIR = path.join(os.homedir(), '.opencli-publisher');
const TOKEN_CACHE_PATH = path.join(CACHE_DIR, 'weixin-token.json');
const TOKEN_SKEW_MS = 5 * 60 * 1000;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp']);

export function readCredentials(env = process.env) {
  return {
    appId: env.PUBLISHER_WEIXIN_APP_ID || env.WEIXIN_APPID || env.WEIXIN_APP_ID || '',
    appSecret: env.PUBLISHER_WEIXIN_APP_SECRET || env.WEIXIN_SECRET || env.WEIXIN_APP_SECRET || '',
    accessToken: env.PUBLISHER_WEIXIN_ACCESS_TOKEN || env.WEIXIN_ACCESS_TOKEN || '',
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
  const contentFile = kwargs['content-file'] || kwargs.content_file || '';
  if (contentFile) {
    const resolved = path.resolve(String(contentFile));
    try {
      return fs.readFileSync(resolved, 'utf-8');
    } catch {
      throw new ArgumentError(`Content file not found or unreadable: ${resolved}`);
    }
  }
  const content = kwargs.content == null ? '' : String(kwargs.content);
  if (!content.trim()) {
    throw new ArgumentError('Article content is required. Pass positional <content> or --content-file.');
  }
  return content;
}

export function requireImageFile(filePath, label = 'image') {
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
  if (!IMAGE_EXTENSIONS.has(ext)) {
    throw new ArgumentError(`Unsupported ${label} format "${ext}". Supported: jpg/jpeg/png/gif/bmp`);
  }
  return resolved;
}

export function buildArticle(kwargs, content, thumbMediaId) {
  const title = String(kwargs.title || '').trim();
  if (!title) throw new ArgumentError('--title is required');
  if (!thumbMediaId) throw new ArgumentError('thumb_media_id is required. Pass --thumb-media-id or --cover-image.');

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
  };
}

export async function getAccessToken(options = {}) {
  const { appId, appSecret, accessToken } = readCredentials(options.env || process.env);
  if (accessToken) {
    return { accessToken, source: 'env', expiresAt: null };
  }

  if (!appId || !appSecret) {
    throw new ArgumentError(
      'Missing WeChat credentials. Set PUBLISHER_WEIXIN_ACCESS_TOKEN or PUBLISHER_WEIXIN_APP_ID/PUBLISHER_WEIXIN_APP_SECRET.'
    );
  }

  if (!options.noCache) {
    const cached = readTokenCache();
    if (
      cached &&
      cached.appId === appId &&
      cached.accessToken &&
      cached.expiresAt &&
      cached.expiresAt - Date.now() > TOKEN_SKEW_MS
    ) {
      return { accessToken: cached.accessToken, source: 'cache', expiresAt: cached.expiresAt };
    }
  }

  const url = `${API_BASE}/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  const data = await requestJson(url, { method: 'GET', accessTokenInQuery: false });
  if (!data.access_token) {
    throw new CommandExecutionError(`WeChat token response missing access_token: ${JSON.stringify(data)}`);
  }
  const expiresAt = Date.now() + Number(data.expires_in || 7200) * 1000;
  writeTokenCache({ appId, accessToken: data.access_token, expiresAt });
  return { accessToken: data.access_token, source: 'api', expiresAt };
}

export async function uploadPermanentImage(filePath, accessToken) {
  const resolved = requireImageFile(filePath, 'image');
  const form = new FormData();
  form.append('media', fileBlob(resolved), path.basename(resolved));
  const url = withAccessToken(`${API_BASE}/cgi-bin/material/add_material?type=image`, accessToken);
  const data = await requestJson(url, { method: 'POST', body: form, accessTokenInQuery: false });
  if (!data.media_id) {
    throw new CommandExecutionError(`WeChat material upload response missing media_id: ${JSON.stringify(data)}`);
  }
  return { mediaId: data.media_id, url: data.url || '', path: resolved };
}

export async function uploadContentImage(filePath, accessToken) {
  const resolved = requireImageFile(filePath, 'image');
  const form = new FormData();
  form.append('media', fileBlob(resolved), path.basename(resolved));
  const url = withAccessToken(`${API_BASE}/cgi-bin/media/uploadimg`, accessToken);
  const data = await requestJson(url, { method: 'POST', body: form, accessTokenInQuery: false });
  if (!data.url) {
    throw new CommandExecutionError(`WeChat content image upload response missing url: ${JSON.stringify(data)}`);
  }
  return { url: data.url, path: resolved };
}

export async function addDraft(article, accessToken) {
  const url = withAccessToken(`${API_BASE}/cgi-bin/draft/add`, accessToken);
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
  const url = withAccessToken(`${API_BASE}/cgi-bin/freepublish/submit`, accessToken);
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
  const url = withAccessToken(`${API_BASE}/cgi-bin/freepublish/get`, accessToken);
  const data = await requestJson(url, {
    method: 'POST',
    json: { publish_id: publishId },
    accessTokenInQuery: false,
  });
  return data;
}

function readTokenCache() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeTokenCache(cache) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
  } catch {
    // Token caching is an optimization only.
  }
}

function withAccessToken(url, accessToken) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(accessToken)}`;
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
    throw new CommandExecutionError(`WeChat API error ${data.errcode}: ${data.errmsg || ''}`);
  }
  return data;
}

