import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ArgumentError } from '@jackwener/opencli/errors';
import { COVER_EXTENSIONS, VIDEO_EXTENSIONS } from './constants.js';

const ONE_MIB = 1024 * 1024;
const MAX_DESCRIPTION_CHARS = 2000;
const MAX_TITLE_CHARS = 60;
const MAX_VIDEO_BYTES = 4 * 1024 * ONE_MIB;
const MAX_COVER_BYTES = 10 * ONE_MIB;

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
  return parseBool(kwargs.execute, false);
}

export function parsePositiveInteger(value, defaultValue, name) {
  const raw = value === undefined || value === null || value === '' ? defaultValue : value;
  const number = Number(raw);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ArgumentError(`${name} must be a positive integer. Received: ${value}`);
  }
  return number;
}

export function parseHitl(value) {
  const mode = String(value || 'interrupt').trim();
  if (!['interrupt', 'wait', 'fail'].includes(mode)) {
    throw new ArgumentError('--hitl must be one of: interrupt, wait, fail.');
  }
  return mode;
}

export function parseFinalApproval(value) {
  const mode = String(value || 'required').trim();
  if (!['required', 'skip'].includes(mode)) {
    throw new ArgumentError('--final-approval must be one of: required, skip.');
  }
  return mode;
}

export function parseScheduleAt(raw, now = Date.now()) {
  if (!raw) return '';
  const dt = typeof raw === 'number'
    ? new Date(raw < 1e12 ? raw * 1000 : raw)
    : new Date(String(raw));
  if (Number.isNaN(dt.getTime())) {
    throw new ArgumentError(`Unable to parse --schedule-at: ${raw}`);
  }
  if (dt.getTime() <= now) {
    throw new ArgumentError('--schedule-at must be in the future.');
  }
  return dt.toISOString();
}

export function readDescription(kwargs) {
  const inline = kwargs.description == null ? '' : String(kwargs.description);
  const file = kwargs['description-file'] || '';
  if (inline && file) {
    throw new ArgumentError('Pass either --description or --description-file, not both.');
  }
  if (file) {
    const resolved = path.resolve(String(file));
    try {
      return { text: fs.readFileSync(resolved, 'utf-8'), source: resolved };
    } catch {
      throw new ArgumentError(`Description file not found or unreadable: ${resolved}`);
    }
  }
  return { text: inline, source: inline ? 'argument' : '' };
}

export function parseTags(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeTag).filter(Boolean);
  return String(raw || '')
    .split(',')
    .map(normalizeTag)
    .filter(Boolean);
}

export function buildCaption(description, tags) {
  const clean = String(description || '').trim();
  const tagText = tags
    .map((tag) => tag.startsWith('#') ? tag : `#${tag}`)
    .join(' ');
  return [clean, tagText].filter(Boolean).join('\n').trim();
}

export function preflightVideoInput(kwargs, options = {}) {
  const video = requireFile(kwargs.video, 'video', VIDEO_EXTENSIONS, MAX_VIDEO_BYTES);
  const cover = kwargs.cover ? requireFile(kwargs.cover, 'cover', COVER_EXTENSIONS, MAX_COVER_BYTES) : null;
  const description = readDescription(kwargs);
  const tags = parseTags(kwargs.tags);
  const caption = buildCaption(description.text, tags);
  const shortTitle = String(kwargs['short-title'] || '').trim();
  const scheduleAt = parseScheduleAt(kwargs['schedule-at'], options.now);
  const publishNow = parseBool(kwargs['publish-now'], false);
  const finalApproval = parseFinalApproval(kwargs['final-approval']);
  const hitl = parseHitl(kwargs.hitl);

  if (!caption) {
    throw new ArgumentError('Video description is required. Pass --description, --description-file, or --tags.');
  }
  requireTextLength(caption, 'description', MAX_DESCRIPTION_CHARS, true);
  requireTextLength(shortTitle, 'short-title', MAX_TITLE_CHARS, false);

  if (kwargs.original) {
    throw new ArgumentError('--original is not automated in the first version; omit it or handle originality declaration through HITL.');
  }
  if (kwargs.collection || kwargs.location || kwargs.activity || kwargs['ext-link']) {
    throw new ArgumentError('Collections, location, activity, and external links are outside the first version scope.');
  }

  return {
    video,
    cover,
    caption,
    description_source: description.source,
    tags,
    short_title: shortTitle,
    schedule_at: scheduleAt,
    publish_now: publishNow,
    final_approval: finalApproval,
    hitl,
    account_name: String(kwargs['account-name'] || '').trim(),
    timeout_seconds: parsePositiveInteger(kwargs.timeout, 600, 'timeout'),
  };
}

export function fileSummary(filePath) {
  if (!filePath) return null;
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    sha256: sha256File(filePath),
    size_bytes: stat.size,
    mtime_ms: Math.trunc(stat.mtimeMs),
  };
}

export function validateInputUnchanged(job) {
  const video = job.input?.video;
  if (video?.path) assertFileUnchanged(video, 'video');
  const cover = job.input?.cover;
  if (cover?.path) assertFileUnchanged(cover, 'cover');
  if (job.input?.description_source && job.input.description_source !== 'argument') {
    const summary = fileSummary(job.input.description_source);
    if (summary.sha256 !== job.input.description_sha256) {
      throw new ArgumentError(`description source changed since job creation: ${job.input.description_source}`);
    }
  }
}

function assertFileUnchanged(expected, label) {
  const current = fileSummary(expected.path);
  if (current.sha256 !== expected.sha256 || current.size_bytes !== expected.size_bytes || current.mtime_ms !== expected.mtime_ms) {
    throw new ArgumentError(`${label} file changed since job creation: ${expected.path}`);
  }
}

function requireFile(filePath, label, allowedExts, maxBytes) {
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
  if (!allowedExts.has(ext)) {
    throw new ArgumentError(`Unsupported ${label} format "${ext}". Supported: ${[...allowedExts].map((item) => item.slice(1)).join('/')}`);
  }
  if (stat.size > maxBytes) {
    throw new ArgumentError(`${label} file is too large: ${stat.size} bytes. Maximum is ${maxBytes} bytes.`);
  }
  return resolved;
}

function requireTextLength(value, name, maxChars, required) {
  const text = String(value || '');
  if (required && !text.trim()) throw new ArgumentError(`${name} is required`);
  const length = Array.from(text).length;
  if (length > maxChars) {
    throw new ArgumentError(`${name} must be at most ${maxChars} characters. Received ${length}.`);
  }
}

function normalizeTag(value) {
  return String(value || '').trim().replace(/^#+/, '');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
