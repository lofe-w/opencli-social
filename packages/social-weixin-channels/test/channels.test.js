import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getRegistry } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { createJob, readJob, updateJob, withJobLock } from '../lib/channels/jobs.js';
import { needsHuman } from '../lib/channels/hitl.js';
import { preflightVideoInput } from '../lib/channels/validation.js';

await import('../doctor.js');
await import('../auth-status.js');
await import('../auth-begin.js');
await import('../accounts-list.js');
await import('../account-current.js');
await import('../account-resolve.js');
await import('../video-preflight.js');
await import('../publish-video.js');
await import('../jobs-get.js');
await import('../jobs-resume.js');
await import('../jobs-cancel.js');
await import('../posts-list.js');
await import('../page-state.js');
await import('../request.js');

test('social-weixin-channels commands are registered with expected access levels', () => {
  const registry = getRegistry();
  const expected = {
    doctor: 'read',
    'auth-status': 'read',
    'auth-begin': 'write',
    'accounts-list': 'read',
    'account-current': 'read',
    'account-resolve': 'read',
    'video-preflight': 'read',
    'publish-video': 'write',
    'jobs-get': 'read',
    'jobs-resume': 'write',
    'jobs-cancel': 'write',
    'posts-list': 'read',
    'page-state': 'read',
    request: 'write',
  };
  for (const [name, access] of Object.entries(expected)) {
    const cmd = registry.get(`social-weixin-channels/${name}`);
    assert.ok(cmd, `${name} is registered`);
    assert.equal(cmd.access, access);
  }
  assert.equal(registry.get('social-weixin-channels/publish-video').siteSession, 'persistent');
});

test('preflight validates local video input and normalizes caption', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-channels-preflight-'));
  const video = path.join(dir, 'demo.mp4');
  fs.writeFileSync(video, Buffer.from([0x00, 0x00, 0x00, 0x18]));

  const result = preflightVideoInput({
    video,
    description: 'hello',
    tags: 'OpenCLI,测试',
    'short-title': '短标题',
    'publish-now': true,
    'final-approval': 'skip',
  });

  assert.equal(result.video, video);
  assert.equal(result.caption, 'hello\n#OpenCLI #测试');
  assert.equal(result.short_title, '短标题');
  assert.equal(result.publish_now, true);
  assert.equal(result.final_approval, 'skip');
});

test('preflight rejects unsupported or ambiguous input before remote writes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-channels-invalid-'));
  const video = path.join(dir, 'demo.mkv');
  fs.writeFileSync(video, 'x');

  assert.throws(() => preflightVideoInput({ video, description: 'x' }), ArgumentError);
  assert.throws(() => preflightVideoInput({
    video: path.join(dir, 'missing.mp4'),
    description: 'x',
  }), ArgumentError);
});

test('job store writes schema, events, and rejects concurrent resume lock', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-channels-jobs-'));
  const env = { SOCIAL_WEIXIN_CHANNELS_JOB_DIR: dir };
  const video = path.join(dir, 'demo.mp4');
  fs.writeFileSync(video, 'demo');

  const { job } = createJob({
    video,
    cover: '',
    caption: 'hello',
    description_source: 'argument',
    tags: ['test'],
    short_title: '',
    schedule_at: '',
    publish_now: false,
    final_approval: 'required',
    account_name: '',
  }, { env, profile: 'work' });

  assert.equal(job.schema_version, 1);
  assert.equal(job.stage, 'prepared');
  assert.match(job.next_command, /jobs-resume/);
  assert.equal(readJob(job.job_id, env).profile, 'work');

  const updated = updateJob(job, { stage: 'auth_required' }, 'login_required', { env });
  assert.equal(updated.events.at(-1).to_stage, 'auth_required');

  await withJobLock(job.job_id, async () => {
    await assert.rejects(() => withJobLock(job.job_id, async () => {}, env), /already locked/);
  }, env);
});

test('needsHuman returns stable agent-readable fields', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-weixin-channels-hitl-'));
  const env = { SOCIAL_WEIXIN_CHANNELS_JOB_DIR: dir };
  const video = path.join(dir, 'demo.mp4');
  fs.writeFileSync(video, 'demo');
  const { job } = createJob({
    video,
    cover: '',
    caption: 'hello',
    description_source: 'argument',
    tags: [],
    short_title: '',
    schedule_at: '',
    publish_now: true,
    final_approval: 'required',
    account_name: '',
  }, { env });

  const page = {
    evaluate: async () => 'https://channels.weixin.qq.com/platform/post/create',
    screenshot: async ({ path: screenshotPath }) => fs.writeFileSync(screenshotPath, 'png'),
  };
  const row = await needsHuman(page, job, 'login_required', 'login_in_opencli_chrome_profile', {
    command: 'publish-video',
    env,
  });
  assert.equal(row.status, 'needs_human');
  assert.equal(row.reason, 'login_required');
  assert.equal(row.job_id, job.job_id);
  assert.match(row.resume_command, /jobs-resume/);
  assert.ok(fs.existsSync(row.screenshot_path));
});
