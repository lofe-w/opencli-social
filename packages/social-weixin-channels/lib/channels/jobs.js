import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';
import { JOB_SCHEMA_VERSION, SITE, jobDir } from './constants.js';
import { fileSummary } from './validation.js';

export function createJob(input, options = {}) {
  const now = isoNow();
  const jobId = options.jobId || `job_${compactTimestamp()}_${crypto.randomBytes(3).toString('hex')}`;
  const dir = ensureJobDir(options.env);
  const job = {
    schema_version: JOB_SCHEMA_VERSION,
    job_id: jobId,
    stage: 'prepared',
    site: SITE,
    profile: options.profile || process.env.OPENCLI_PROFILE || '',
    created_at: now,
    updated_at: now,
    input: {
      video: fileSummary(input.video),
      cover: input.cover ? fileSummary(input.cover) : null,
      description_source: input.description_source || '',
      description_sha256: input.description_source && input.description_source !== 'argument'
        ? fileSummary(input.description_source).sha256
        : '',
      caption_sha256: crypto.createHash('sha256').update(input.caption).digest('hex'),
      caption_preview: input.caption.slice(0, 80),
      short_title: input.short_title,
      schedule_at: input.schedule_at,
      tags: input.tags,
      publish_now: input.publish_now,
      final_approval: input.final_approval,
      account_name: input.account_name,
    },
    account: {
      status: 'unknown',
      display_name: '',
      masked_id: '',
    },
    page: {
      url: '',
      last_screenshot_path: '',
      last_trace_path: '',
    },
    remote: {
      post_id: '',
      post_url: '',
      observable_key: `${crypto.createHash('sha256').update(input.caption).digest('hex').slice(0, 12)}+${now}`,
    },
    next_command: resumeCommand(jobId, options.profile),
    last_action_id: '',
    events: [{
      at: now,
      from_stage: '',
      to_stage: 'prepared',
      actor: 'cli',
      reason: 'job_created',
    }],
  };
  writeJob(job, options.env);
  return { job, path: jobPath(jobId, options.env), dir };
}

export function readJob(jobId, env = process.env) {
  const filePath = jobPath(jobId, env);
  let job;
  try {
    job = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    throw new ArgumentError(`Job not found or unreadable: ${jobId}`);
  }
  if (job.schema_version !== JOB_SCHEMA_VERSION) {
    throw new CommandExecutionError(`Unsupported job schema_version ${job.schema_version}; upgrade ${SITE} before resuming.`);
  }
  return job;
}

export function updateJob(job, patch = {}, reason = 'updated', options = {}) {
  const from = job.stage;
  const next = {
    ...job,
    ...patch,
    page: { ...(job.page || {}), ...(patch.page || {}) },
    account: { ...(job.account || {}), ...(patch.account || {}) },
    remote: { ...(job.remote || {}), ...(patch.remote || {}) },
    updated_at: isoNow(),
  };
  if (patch.stage && patch.stage !== from) {
    next.events = [
      ...(job.events || []),
      {
        at: next.updated_at,
        from_stage: from,
        to_stage: patch.stage,
        actor: options.actor || 'cli',
        reason,
      },
    ];
  }
  next.next_command = next.next_command || resumeCommand(next.job_id, next.profile);
  writeJob(next, options.env);
  return next;
}

export function cancelJob(jobId, options = {}) {
  const job = readJob(jobId, options.env);
  return updateJob(job, { stage: 'cancelled' }, 'cancelled', options);
}

export async function withJobLock(jobId, fn, env = process.env) {
  const lockPath = `${jobPath(jobId, env)}.lock`;
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx');
  } catch {
    throw new CommandExecutionError(`Job ${jobId} is already locked by another resume process.`);
  }
  try {
    fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`, 'utf-8');
    return await fn();
  } finally {
    try {
      fs.closeSync(fd);
    } catch {}
    try {
      fs.unlinkSync(lockPath);
    } catch {}
  }
}

export function jobPath(jobId, env = process.env) {
  const safe = String(jobId || '').trim();
  if (!/^job_[A-Za-z0-9_-]+$/.test(safe)) {
    throw new ArgumentError(`Invalid job_id: ${jobId}`);
  }
  return path.join(jobDir(env), `${safe}.json`);
}

export function resumeCommand(jobId, profile = '') {
  const profilePart = profile ? `--profile ${shellQuote(profile)} ` : '';
  return `opencli ${profilePart}${SITE} jobs-resume ${jobId} --execute -f json`;
}

export function ensureJobDir(env = process.env) {
  const dir = jobDir(env);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJob(job, env = process.env) {
  ensureJobDir(env);
  const filePath = jobPath(job.job_id, env);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(job, null, 2) + '\n', 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function isoNow() {
  return new Date().toISOString();
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
