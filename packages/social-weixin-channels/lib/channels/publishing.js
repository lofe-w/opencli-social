import { CommandExecutionError } from '@jackwener/opencli/errors';
import * as crypto from 'node:crypto';
import { createJob, readJob, updateJob, withJobLock } from './jobs.js';
import { handleHitlMode, needsHuman } from './hitl.js';
import {
  clickSubmit,
  fillPublishingFields,
  gotoPublishPage,
  inspectPublishFormState,
  inspectPage,
  uploadCover,
  uploadVideo,
  waitForLoggedIn,
  waitForSubmitResult,
} from './page.js';
import { buildCaption, preflightVideoInput, readDescription, validateInputUnchanged } from './validation.js';

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
    const input = inputFromJob(job, options.kwargs || {});
    if (job.stage === 'awaiting_final_approval') {
      const guard = await ensureResumeContext(page, job, input, 'awaiting_final_approval');
      if (guard) return [handleHitlMode(input.hitl, guard)];
      progress('refresh publishing fields before final submit');
      await fillPublishingFields(page, input);
      return submitPreparedPage(page, job, input, { command: 'jobs-resume' });
    }
    if (job.stage === 'manual_upload_required') {
      const guard = await ensureResumeContext(page, job, input, 'manual_upload_required');
      if (guard) return [handleHitlMode(input.hitl, guard)];
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
      if (!input.caption_available) {
        const row = await needsHuman(page, job, 'description_required', 'provide_description_on_resume', {
          command: 'jobs-resume',
          message: '该 job 没有保存完整文案。请重新运行 jobs-resume 并传入 --description 或 --description-file。',
          detail: { caption_sha256: job.input?.caption_sha256 || '', caption_preview: job.input?.caption_preview || '' },
        });
        return [handleHitlMode(input.hitl, row)];
      }
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
      const row = await needsHuman(page, job, 'unknown_result_requires_review', 'verify_publish_result_before_retry', {
        command: 'jobs-resume',
        message: '上一次提交结果未知。请先用 posts-list/page-state 或人工检查确认是否已发布；确认未发布后重新创建发布任务，不要直接重试该非幂等提交。',
        detail: { last_action_id: job.last_action_id },
      });
      return [handleHitlMode(input.hitl, row)];
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
  if (info.account_status === 'unknown' || !info.account_name) {
    job = updateJob(job, {
      stage: 'account_required',
      account: { status: info.account_status || 'unknown', display_name: info.account_name || '' },
      page: { url: info.url || '' },
    }, 'account_unknown_required');
    const row = await needsHuman(page, job, 'account_select_required', 'confirm_channels_account', {
      command: options.command,
      message: input.account_name
        ? `无法确认当前视频号主体是否为：${input.account_name}。请在页面确认账号后继续。`
        : '无法可靠识别当前视频号主体。请在页面确认发布主体后继续，或重新运行命令并传入 --account-name。',
    });
    return [handleHitlMode(input.hitl, row)];
  }
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
  const result = await waitForSubmitResult(page, isDraft, Math.min(input.timeout_seconds, 180));
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

async function ensureResumeContext(page, job, input, stage) {
  const info = await inspectPage(page, input.account_name || job.account?.display_name || '');
  if (info.login_like || info.account_status === 'logged_out') {
    return needsHuman(page, job, 'login_required', 'login_in_opencli_chrome_profile', {
      command: 'jobs-resume',
      message: '恢复发布前需要先在 OpenCLI Chrome profile 中登录视频号助手。',
    });
  }
  if (info.captcha_like) {
    return needsHuman(page, job, 'captcha_required', 'complete_captcha_in_browser', {
      command: 'jobs-resume',
      message: '恢复发布前需要先完成页面上的验证码或风控验证。',
    });
  }
  const expectedAccount = input.account_name || job.account?.display_name || '';
  if (info.account_status !== 'single_account' || !info.account_name || (expectedAccount && info.account_name !== expectedAccount)) {
    return needsHuman(page, job, 'account_select_required', 'confirm_channels_account', {
      command: 'jobs-resume',
      message: expectedAccount
        ? `恢复发布前无法确认当前视频号主体是「${expectedAccount}」。请切换/确认账号后继续。`
        : '恢复发布前无法可靠识别当前视频号主体。请确认发布账号，或重新创建任务并传入 --account-name。',
      detail: { detected_account: info.account_name || '', detected_status: info.account_status || 'unknown' },
    });
  }

  const form = await inspectPublishFormState(page);
  if (!form.create_like || !/\/platform\/post\/create/.test(form.url || '')) {
    return needsHuman(page, job, 'resume_page_mismatch', 'open_original_publish_form', {
      command: 'jobs-resume',
      message: '恢复发布前当前浏览器页面不是视频号发布表单。请打开原发布表单或重新创建任务。',
      detail: { url: form.url || '' },
    });
  }
  if (!form.has_video) {
    return needsHuman(page, job, 'manual_upload_required', 'upload_video_in_browser', {
      command: 'jobs-resume',
      message: '恢复发布前未确认页面上已有视频预览。请在当前发布表单上传正确视频后继续。',
    });
  }
  if (!input.caption_available) {
    return needsHuman(page, job, 'description_required', 'provide_description_on_resume', {
      command: 'jobs-resume',
      message: '该 job 没有保存完整文案。请重新运行 jobs-resume 并传入 --description 或 --description-file。',
      detail: { caption_sha256: job.input?.caption_sha256 || '', caption_preview: job.input?.caption_preview || '' },
    });
  }
  if (stage === 'awaiting_final_approval') {
    const observed = form.description || '';
    const observedHash = crypto.createHash('sha256').update(observed).digest('hex');
    if (observedHash !== job.input?.caption_sha256) {
      return needsHuman(page, job, 'resume_form_mismatch', 'confirm_publish_form_content', {
        command: 'jobs-resume',
        message: '恢复发布前页面文案与 job 摘要不匹配。请确认当前表单属于该 job，或重新创建任务。',
        detail: {
          expected_caption_sha256: job.input?.caption_sha256 || '',
          observed_caption_sha256: observedHash,
          expected_caption_preview: job.input?.caption_preview || '',
          observed_caption_preview: observed.slice(0, 80),
        },
      });
    }
  }
  return null;
}

function inputFromJob(job, kwargs = {}) {
  const captionInfo = captionFromJob(job, kwargs);
  return {
    video: job.input.video.path,
    cover: job.input.cover?.path || '',
    caption: captionInfo.caption,
    caption_available: captionInfo.available,
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

function captionFromJob(job, kwargs = {}) {
  const source = job.input?.description_source || '';
  let text = '';
  let sourceKind = source;
  if (kwargs.description || kwargs['description-file']) {
    const description = readDescription(kwargs);
    text = description.text;
    sourceKind = description.source;
  } else if (source && source !== 'argument') {
    const description = readDescription({ 'description-file': source });
    text = description.text;
  }
  if (!text) return { caption: '', available: false };
  const caption = buildCaption(text, job.input?.tags || []);
  const hash = crypto.createHash('sha256').update(caption).digest('hex');
  if (job.input?.caption_sha256 && hash !== job.input.caption_sha256) {
    throw new CommandExecutionError(`Resume description does not match job caption hash. source=${sourceKind}`);
  }
  return { caption, available: true };
}
