import { CommandExecutionError } from '@jackwener/opencli/errors';
import { createJob, readJob, updateJob, withJobLock } from './jobs.js';
import { handleHitlMode, needsHuman } from './hitl.js';
import {
  clickSubmit,
  fillPublishingFields,
  gotoPublishPage,
  inspectPage,
  uploadCover,
  uploadVideo,
  waitForLoggedIn,
  waitForSubmitResult,
} from './page.js';
import { preflightVideoInput, validateInputUnchanged } from './validation.js';

export async function startPublishVideo(page, kwargs, options = {}) {
  const input = preflightVideoInput(kwargs);
  const { job } = createJob(input, { profile: options.profile });
  if (!page) {
    return dryRunRow(input, 'dry_run_publish_video', job.job_id, job.next_command);
  }
  return runJobFromInput(page, job, input, { command: 'publish-video' });
}

export async function resumePublishVideo(page, jobId, options = {}) {
  if (!page) throw new CommandExecutionError('A browser page is required to resume a channels publish job.');
  return withJobLock(jobId, async () => {
    let job = readJob(jobId);
    validateInputUnchanged(job);
    const input = inputFromJob(job);
    if (job.stage === 'awaiting_final_approval') {
      progress('refresh publishing fields before final submit');
      await fillPublishingFields(page, input);
      return submitPreparedPage(page, job, input, { command: 'jobs-resume' });
    }
    if (job.stage === 'manual_upload_required') {
      progress('resume after manual video upload');
      await fillPublishingFields(page, input);
      job = updateJob(job, { stage: 'uploaded', last_action_id: 'manual_upload_completed' }, 'manual_upload_completed');
      if (input.publish_now && input.final_approval === 'required') {
        job = updateJob(job, { stage: 'awaiting_final_approval', last_action_id: 'awaiting_final_approval' }, 'final_approval_required');
        const row = await needsHuman(page, job, 'final_publish_approval_required', 'review_and_approve_publish_form', {
          command: 'jobs-resume',
          message: '请检查手动上传后的视频号发布表单；确认无误后继续。',
        });
        return [handleHitlMode(input.hitl, row)];
      }
      return submitPreparedPage(page, job, input, { command: 'jobs-resume' });
    }
    if (['prepared', 'auth_required', 'account_required', 'uploading', 'uploaded'].includes(job.stage)) {
      return runJobFromInput(page, job, input, { command: 'jobs-resume' });
    }
    if (['draft_created', 'submitted', 'scheduled', 'published', 'failed', 'cancelled'].includes(job.stage)) {
      return [{
        status: job.stage,
        command: 'jobs-resume',
        job_id: job.job_id,
        account_status: job.account?.status || 'unknown',
        account_name: job.account?.display_name || '',
        post_id: job.remote?.post_id || '',
        post_url: job.remote?.post_url || '',
        url: job.page?.url || '',
        detail: JSON.stringify({ message: 'job is already terminal or no longer resumable' }),
      }];
    }
    if (job.stage === 'unknown' && ['publish_submit_clicked', 'draft_submit_clicked'].includes(job.last_action_id)) {
      return waitForClickedSubmitResult(page, job, input, {
        command: 'jobs-resume',
        allowInitialPrimaryRetry: job.last_action_id === 'publish_submit_clicked',
      });
    }
    throw new CommandExecutionError(`Job stage ${job.stage} is not resumable.`);
  });
}

export function dryRunRow(input, status = 'dry_run_publish_video', jobId = '', resumeCommand = '') {
  return [{
    status,
    command: 'publish-video',
    job_id: jobId,
    account_status: 'unknown',
    account_name: input.account_name || '',
    post_id: '',
    post_url: '',
    url: '',
    detail: JSON.stringify({
      video: input.video,
      cover: input.cover || '',
      caption_preview: input.caption.slice(0, 80),
      short_title: input.short_title,
      schedule_at: input.schedule_at,
      tags: input.tags,
      publish_now: input.publish_now,
      final_approval: input.final_approval,
      hitl: input.hitl,
      resume_command: resumeCommand,
    }),
  }];
}

async function runJobFromInput(page, job, input, options = {}) {
  progress('open publish page');
  job = updateJob(job, { stage: 'prepared' }, 'resume_or_start');
  await gotoPublishPage(page);
  let info = await inspectPage(page, input.account_name);
  job = updateJob(job, {
    page: { url: info.url || '' },
    account: { status: info.account_status || 'unknown', display_name: info.account_name || '' },
  }, 'page_inspected');

  if (info.captcha_like) {
    job = updateJob(job, { stage: 'auth_required' }, 'captcha_required');
    const row = await needsHuman(page, job, 'captcha_required', 'complete_captcha_in_browser', {
      command: options.command,
      message: '请在视频号助手页面完成验证码或风控验证后继续。',
    });
    return [handleHitlMode(input.hitl, row)];
  }

  if (info.login_like || info.account_status === 'logged_out') {
    job = updateJob(job, { stage: 'auth_required' }, 'login_required');
    if (input.hitl === 'wait') {
      info = await waitForLoggedIn(page, Math.min(120, input.timeout_seconds));
      job = updateJob(job, {
        stage: 'prepared',
        page: { url: info.url || '' },
        account: { status: info.account_status || 'unknown', display_name: info.account_name || '' },
      }, 'login_completed');
    } else {
      const row = await needsHuman(page, job, 'login_required', 'login_in_opencli_chrome_profile', {
        command: options.command,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      });
      return [handleHitlMode(input.hitl, row)];
    }
  }

  info = await inspectPage(page, input.account_name);
  if (info.account_status === 'needs_selection') {
    job = updateJob(job, {
      stage: 'account_required',
      account: { status: 'needs_selection', display_name: info.account_name || '' },
      page: { url: info.url || '' },
    }, 'account_select_required');
    const row = await needsHuman(page, job, 'account_select_required', 'select_channels_account', {
      command: options.command,
      message: input.account_name
        ? `请切换到视频号发布主体：${input.account_name}`
        : '请确认当前视频号发布主体后继续。',
    });
    return [handleHitlMode(input.hitl, row)];
  }

  progress('upload video');
  job = updateJob(job, {
    stage: 'uploading',
    account: { status: info.account_status || 'unknown', display_name: info.account_name || input.account_name || '' },
    page: { url: info.url || '' },
    last_action_id: 'upload_video',
  }, 'upload_started');
  try {
    await uploadVideo(page, input.video, input.timeout_seconds);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    job = updateJob(job, { stage: 'manual_upload_required' }, 'manual_upload_required');
    const row = await needsHuman(page, job, 'manual_upload_required', 'upload_video_in_browser', {
      command: options.command,
      message: `自动上传视频未完成。请在当前视频号助手页面手动上传视频文件，然后继续该 job：${input.video}`,
      detail: { platform_message: message.slice(0, 1000) },
    });
    return [handleHitlMode(input.hitl, row)];
  }
  job = updateJob(job, { stage: 'uploaded', last_action_id: 'fill_fields' }, 'upload_completed');

  progress('upload cover if needed');
  const cover = await uploadCover(page, input.cover);
  if (cover.status === 'needs_human') {
    job = updateJob(job, { stage: 'uploaded' }, 'cover_needs_human');
    const row = await needsHuman(page, job, 'final_publish_approval_required', 'upload_or_adjust_cover', {
      command: options.command,
      message: `请在页面手动上传或调整封面：${cover.path}`,
    });
    return [handleHitlMode(input.hitl, row)];
  }

  progress('fill publishing fields');
  await fillPublishingFields(page, input);

  if (input.publish_now && input.final_approval === 'required') {
    job = updateJob(job, { stage: 'awaiting_final_approval', last_action_id: 'awaiting_final_approval' }, 'final_approval_required');
    const row = await needsHuman(page, job, 'final_publish_approval_required', 'review_and_approve_publish_form', {
      command: options.command,
      message: '请检查视频号发布表单中的账号、视频、描述、定时和其它平台提示；确认无误后回复我继续。',
    });
    return [handleHitlMode(input.hitl, row)];
  }

  return submitPreparedPage(page, job, input, options);
}

async function submitPreparedPage(page, job, input, options = {}) {
  const isDraft = !input.publish_now;
  progress(isDraft ? 'click save draft' : 'click publish');
  job = updateJob(job, {
    last_action_id: isDraft ? 'click_save_draft' : 'click_publish',
  }, isDraft ? 'click_save_draft' : 'click_publish');
  try {
    await clickSubmit(page, isDraft);
  } catch (err) {
    throw err;
  }
  return waitForClickedSubmitResult(page, job, input, options);
}

async function waitForClickedSubmitResult(page, job, input, options = {}) {
  const isDraft = !input.publish_now;
  progress(isDraft ? 'wait for draft result' : 'wait for publish result');
  const result = await waitForSubmitResult(page, isDraft, Math.min(input.timeout_seconds, 180), {
    allowInitialPrimaryRetry: Boolean(options.allowInitialPrimaryRetry),
  });
  const stage = isDraft
    ? 'draft_created'
    : input.schedule_at
      ? 'scheduled'
      : result.unknown
        ? 'unknown'
        : 'submitted';
  job = updateJob(job, {
    stage,
    page: { url: result.url || '' },
    last_action_id: isDraft ? 'draft_submit_clicked' : 'publish_submit_clicked',
  }, isDraft ? 'draft_created' : result.unknown ? 'unknown_result' : 'publish_submitted');

  return [{
    status: stage === 'unknown' ? 'unknown_result' : stage,
    command: options.command || '',
    job_id: job.job_id,
    account_status: job.account?.status || 'unknown',
    account_name: job.account?.display_name || '',
    post_id: job.remote?.post_id || '',
    post_url: job.remote?.post_url || '',
    url: result.url || job.page?.url || '',
    detail: JSON.stringify({
      raw_status: result.text || '',
      unknown_result: Boolean(result.unknown),
      next_command: job.next_command,
    }),
  }];
}

function progress(message) {
  process.stderr.write(`[social-weixin-channels] ${message}\n`);
}

function inputFromJob(job) {
  return {
    video: job.input.video.path,
    cover: job.input.cover?.path || '',
    caption: job.input.caption || job.input.caption_preview || '',
    description_source: job.input.description_source || '',
    tags: job.input.tags || [],
    short_title: job.input.short_title || '',
    schedule_at: job.input.schedule_at || '',
    publish_now: Boolean(job.input.publish_now),
    final_approval: job.input.final_approval || 'required',
    hitl: 'interrupt',
    account_name: job.input.account_name || '',
    timeout_seconds: 600,
  };
}
