import * as fs from 'node:fs';
import * as path from 'node:path';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { SITE } from './constants.js';
import { jobDir } from './constants.js';

export async function needsHuman(page, job, reason, humanAction, options = {}) {
  const hitlId = options.hitlId || `hitl_${Date.now().toString(36)}`;
  const message = options.message || defaultMessage(reason);
  const screenshotPath = options.screenshotPath || path.join(jobDir(options.env), job.job_id, `${reason}.png`);
  await captureScreenshot(page, screenshotPath);
  const url = await currentUrl(page);
  return {
    status: 'needs_human',
    command: options.command || '',
    reason,
    human_action: humanAction,
    job_id: job.job_id,
    hitl_id: hitlId,
    profile: job.profile || '',
    url,
    message,
    screenshot_path: screenshotPath,
    resume_command: job.next_command || `opencli ${SITE} jobs-resume ${job.job_id} --execute -f json`,
    expires_at: options.expiresAt || '',
    account_status: job.account?.status || 'unknown',
    account_name: job.account?.display_name || '',
    detail: JSON.stringify(options.detail || {}),
  };
}

export function handleHitlMode(mode, row) {
  if (mode === 'fail') {
    throw new CommandExecutionError(`${row.reason}: ${row.message}`);
  }
  return row;
}

function defaultMessage(reason) {
  switch (reason) {
    case 'login_required':
      return '请在 OpenCLI 连接的 Chrome profile 中完成微信扫码登录视频号助手。';
    case 'mobile_confirm_required':
      return '请在微信手机端完成确认。';
    case 'account_select_required':
      return '请在视频号助手页面选择正确的发布主体。';
    case 'final_publish_approval_required':
      return '请检查视频号发布表单，确认内容、账号和发布设置后继续。';
    case 'captcha_required':
      return '请在页面完成验证码或风控验证。';
    default:
      return '请在浏览器中完成人工操作后继续。';
  }
}

async function currentUrl(page) {
  if (!page) return '';
  try {
    return unwrap(await page.evaluate('() => location.href')) || '';
  } catch {
    return '';
  }
}

async function captureScreenshot(page, screenshotPath) {
  if (!page || !screenshotPath) return '';
  try {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } catch {
    return '';
  }
}

function unwrap(result) {
  if (result && typeof result === 'object' && 'data' in result && 'session' in result) return result.data;
  return result;
}
