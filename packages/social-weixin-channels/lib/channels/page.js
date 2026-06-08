import * as fs from 'node:fs';
import * as path from 'node:path';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { POSTS_URL, PUBLISH_URL } from './constants.js';

const LOGIN_FRAGMENT = 'login';
const TITLE_SELECTORS = [
  'input[placeholder*="短标题"]',
  'input[placeholder*="填写短标题"]',
  'input.weui-desktop-form__input[placeholder*="短标题"]',
];
const DESC_SELECTORS = [
  'div[contenteditable][data-placeholder="添加描述"]',
  'div.input-editor[contenteditable=""][data-placeholder="添加描述"]',
  'div[data-placeholder*="描述"][contenteditable]',
  'div.input-editor[contenteditable]',
];
const UPLOAD_TRIGGER_SELECTORS = [
  'span.add-icon.weui-icon-outlined-add',
  'div.upload-content',
  '.finder-video-upload-btn',
];

const DEEP_QUERY_FN = `
  function wujieRoot() {
    var w = document.querySelector('wujie-app');
    return (w && w.shadowRoot) || null;
  }
  function allRoots() {
    var roots = [document];
    var sr = wujieRoot();
    if (sr) roots.push(sr);
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          roots.push(iframes[i].contentDocument);
          var nested = iframes[i].contentDocument.querySelector('wujie-app');
          if (nested && nested.shadowRoot) roots.push(nested.shadowRoot);
        }
      } catch {}
    }
    return roots;
  }
  function deepQuery(selector) {
    var roots = allRoots();
    for (var i = 0; i < roots.length; i++) {
      var el = roots[i].querySelector(selector);
      if (el) return el;
    }
    return null;
  }
  function deepQueryAll(selector) {
    var results = [];
    var roots = allRoots();
    for (var i = 0; i < roots.length; i++) {
      var nodes = roots[i].querySelectorAll(selector);
      for (var j = 0; j < nodes.length; j++) results.push(nodes[j]);
    }
    return results;
  }
  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    var view = (el.ownerDocument && el.ownerDocument.defaultView) || window;
    var style = view.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }
  function deepVisibleText(maxNodes) {
    var nodes = deepQueryAll('body, main, section, article, div, form, dialog, button, a, span, input, textarea, [contenteditable]');
    var parts = [];
    var seen = new Set();
    var limit = maxNodes || 350;
    for (var i = 0; i < nodes.length && parts.length < limit; i++) {
      var el = nodes[i];
      if (!isVisible(el)) continue;
      var text = '';
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        text = el.value || el.getAttribute('placeholder') || '';
      } else {
        text = el.innerText || el.getAttribute('aria-label') || el.textContent || '';
      }
      text = String(text).replace(/\\s+/g, ' ').trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      parts.push(text);
    }
    return parts.join(' ').replace(/\\s+/g, ' ').trim();
  }
  function clickLikeUser(el) {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
`;

export async function evalPage(page, script) {
  const result = await page.evaluate(script);
  if (result && typeof result === 'object' && 'data' in result && 'session' in result) return result.data;
  return result;
}

export async function gotoPublishPage(page) {
  await page.goto(PUBLISH_URL);
  await page.wait({ time: 4 });
}

export async function gotoPostsPage(page) {
  await page.goto(POSTS_URL);
  await page.wait({ time: 4 });
}

export async function capturePageState(page, target = 'current') {
  if (target === 'publish') await gotoPublishPage(page);
  if (target === 'posts') await gotoPostsPage(page);
  const state = await evalPage(page, `
    (() => {
      ${DEEP_QUERY_FN}
      var buttons = deepQueryAll('button, [role="button"], a.weui-desktop-btn, .weui-desktop-btn').filter(isVisible).map(function(btn) {
        return {
          text: (btn.innerText || btn.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
          disabled: !!(btn.disabled || btn.getAttribute('disabled') !== null || btn.getAttribute('aria-disabled') === 'true' ||
            btn.classList.contains('disabled') || btn.classList.contains('weui-desktop-btn_disabled')),
          class_name: String(btn.className || '').slice(0, 120)
        };
      }).filter(function(btn) { return btn.text; }).slice(0, 80);
      var fields = deepQueryAll('input, textarea, [contenteditable]').filter(isVisible).map(function(el) {
        return {
          tag: el.tagName || '',
          placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '',
          text: String(el.value || el.innerText || el.textContent || '').replace(/\\s+/g, ' ').slice(0, 160),
        };
      }).slice(0, 60);
      return {
        url: location.href,
        title: document.title || '',
        text: deepVisibleText(500).slice(0, 3000),
        buttons,
        fields,
      };
    })()
  `);
  const screenshotPath = `/tmp/social-weixin-channels-page-state-${Date.now()}.png`;
  await safeScreenshot(page, screenshotPath);
  return { ...(state || {}), screenshot_path: screenshotPath };
}

export async function inspectPublishFormState(page) {
  const state = await evalPage(page, `
    (() => {
      ${DEEP_QUERY_FN}
      var text = deepVisibleText(500);
      var fields = deepQueryAll('input, textarea, [contenteditable]').filter(isVisible).map(function(el) {
        return {
          tag: el.tagName || '',
          placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '',
          text: String(el.value || el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim(),
        };
      });
      function findField(pattern) {
        for (var i = 0; i < fields.length; i++) {
          if (pattern.test(fields[i].placeholder) || pattern.test(fields[i].text)) return fields[i].text || '';
        }
        return '';
      }
      var buttons = deepQueryAll('button, [role="button"], a.weui-desktop-btn, .weui-desktop-btn').filter(isVisible).map(function(btn) {
        return {
          text: (btn.innerText || btn.textContent || '').replace(/\\s+/g, ' ').trim(),
          disabled: !!(btn.disabled || btn.getAttribute('disabled') !== null || btn.getAttribute('aria-disabled') === 'true' ||
            btn.classList.contains('disabled') || btn.classList.contains('weui-desktop-btn_disabled')),
        };
      });
      var hasVideo = Boolean(deepQuery('video') || deepQuery('[class*="preview-video"]') ||
        deepQuery('[class*="video-thumb"]') || deepQuery('[class*="video"][class*="preview"]'));
      return {
        url: location.href,
        create_like: /\\/platform\\/post\\/create/.test(location.href) || /添加描述|短标题|保存草稿|发表/.test(text),
        has_video: hasVideo,
        description: findField(/描述|添加描述/),
        short_title: findField(/短标题|标题/),
        text_preview: text.slice(0, 800),
        buttons,
      };
    })()
  `);
  return state || {};
}

export async function inspectPage(page, accountName = '') {
  const info = await evalPage(page, `
    (() => {
      ${DEEP_QUERY_FN}
      var text = deepVisibleText();
      var url = location.href;
      var createLike = /发表视频|添加描述|短标题|保存草稿|发表/.test(text) || url.indexOf('/platform/post/create') >= 0;
      var loginLike = url.indexOf(${JSON.stringify(LOGIN_FRAGMENT)}) >= 0 || (!createLike && /扫码登录|微信登录|二维码/.test(text));
      var account = '';
      var selectors = [
        '[class*="account"]',
        '[class*="avatar"]',
        '[class*="nickname"]',
        '[class*="name"]',
        '.weui-desktop-account__nickname'
      ];
      for (var i = 0; i < selectors.length && !account; i++) {
        var els = deepQueryAll(selectors[i]);
        for (var j = 0; j < els.length; j++) {
          var t = (els[j].innerText || els[j].textContent || '').replace(/\\s+/g, ' ').trim();
          if (t && t.length <= 40 && !/发表|发布|视频|评论|数据|首页/.test(t)) {
            account = t;
            break;
          }
        }
      }
      var expected = ${JSON.stringify(accountName)};
      var accountStatus = loginLike ? 'logged_out' : account ? 'single_account' : 'unknown';
      if (expected && text.indexOf(expected) < 0 && account !== expected) accountStatus = 'needs_selection';
      if (expected && (text.indexOf(expected) >= 0 || account === expected)) {
        accountStatus = 'single_account';
        account = expected;
      }
      return {
        url,
        title: document.title || '',
        text_preview: text.slice(0, 300),
        login_like: loginLike,
        create_like: createLike,
        account_status: accountStatus,
        account_name: account,
        needs_mobile_confirm: /手机.{0,8}确认|请在手机上确认|确认登录/.test(text),
        captcha_like: /验证码|安全验证|风险|风控/.test(text),
      };
    })()
  `);
  return info || {};
}

export async function waitForLoggedIn(page, timeoutSeconds = 120) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let last = null;
  while (Date.now() < deadline) {
    await page.wait({ time: 3 });
    last = await inspectPage(page);
    if (!last.login_like) return last;
  }
  throw new CommandExecutionError(`Login did not complete within ${timeoutSeconds}s.`);
}

export async function uploadVideo(page, videoPath, timeoutSeconds) {
  await uploadFile(page, videoPath);
  await waitForUploadDone(page, path.basename(videoPath), Math.max(30, timeoutSeconds) * 1000);
}

export async function uploadCover(page, coverPath) {
  if (!coverPath) return { status: 'skipped' };
  if (page.setFileInput) {
    for (const sel of ['input[type="file"][accept*="image"]', 'input[type="file"]']) {
      try {
        await page.setFileInput([coverPath], sel);
        await page.wait({ time: 1 });
        return { status: 'uploaded', path: coverPath };
      } catch {}
    }
  }
  return { status: 'needs_human', path: coverPath };
}

export async function fillPublishingFields(page, input) {
  if (input.short_title) {
    await fillField(page, TITLE_SELECTORS, input.short_title, 'short-title');
  }
  await fillField(page, DESC_SELECTORS, input.caption, 'description');
  if (input.schedule_at) {
    await setScheduleTime(page, new Date(input.schedule_at));
  }
}

export async function clickSubmit(page, isDraft) {
  const labels = isDraft
    ? ['存草稿', '保存草稿', '草稿']
    : ['发表', '发布'];
  let clicked = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    clicked = await findAndClickSubmitOnce(page, labels);
    if (clicked?.ok) return clicked;
    if (!clicked?.saw_target_disabled) break;
    await page.wait({ time: 5 });
  }
  await safeScreenshot(page, `/tmp/social-weixin-channels_${isDraft ? 'draft' : 'publish'}_button.png`);
  throw new CommandExecutionError(`Unable to find enabled ${labels[0]} button. Diagnostics: ${JSON.stringify(clicked || {})}`);
}

async function findAndClickSubmitOnce(page, labels) {
  return evalPage(page, `
    (async function(labels) {
      ${DEEP_QUERY_FN}
      function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
      function scrollAllToBottom() {
        window.scrollTo(0, document.body.scrollHeight);
        var sr = wujieRoot();
        var roots = [document.scrollingElement, document.documentElement, document.body];
        if (sr) {
          roots.push(sr.host);
          var all = sr.querySelectorAll('*');
          for (var i = 0; i < all.length; i++) {
            if (all[i].scrollHeight > all[i].clientHeight + 20) roots.push(all[i]);
          }
        }
        for (var j = 0; j < roots.length; j++) {
          try { roots[j].scrollTop = roots[j].scrollHeight; } catch {}
        }
      }
      scrollAllToBottom();
      await sleep(500);
      var btns = deepQueryAll('button, [role="button"], a.weui-desktop-btn, .weui-desktop-btn');
      var candidates = [];
      var sawTargetDisabled = false;
      for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        var text = (btn.innerText || btn.textContent || '').trim();
        var disabled = btn.disabled || btn.getAttribute('disabled') !== null ||
          btn.classList.contains('weui-desktop-btn_disabled') ||
          btn.classList.contains('disabled') ||
          btn.getAttribute('aria-disabled') === 'true';
        if (text) candidates.push({ text: text.slice(0, 80), disabled: !!disabled, visible: isVisible(btn) });
        for (var j = 0; j < labels.length; j++) {
          if (text === labels[j] || text.indexOf(labels[j]) >= 0) {
            if (disabled && isVisible(btn)) sawTargetDisabled = true;
            try { btn.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
            await sleep(250);
            if (!disabled && isVisible(btn)) {
              clickLikeUser(btn);
              return { ok: true, text };
            }
          }
        }
      }
      var fields = [];
      var inputs = deepQueryAll('input, textarea, [contenteditable]');
      for (var f = 0; f < inputs.length; f++) {
        var inp = inputs[f];
        if (!isVisible(inp)) continue;
        fields.push({
          tag: inp.tagName,
          placeholder: inp.getAttribute('placeholder') || inp.getAttribute('data-placeholder') || '',
          text: ((inp.value || inp.innerText || inp.textContent || '') + '').replace(/\\s+/g, ' ').slice(0, 120),
          disabled: !!inp.disabled,
          ariaInvalid: inp.getAttribute('aria-invalid') || '',
          classes: inp.className || ''
        });
      }
      var fullText = deepVisibleText();
      var diagnostics = {
        candidates,
        saw_target_disabled: sawTargetDisabled,
        fields,
        error_text: (fullText.match(/.{0,20}(错误|失败|必填|请选择|请填写|不能为空|上传中|转码中|处理中|不符合|低于|至少|不能|等待完成).{0,80}/g) || []).slice(0, 20),
        tail_text: fullText.slice(-800)
      };
      return { ok: false, ...diagnostics };
    })(${JSON.stringify(labels)})
  `);
}

export async function waitForSubmitResult(page, isDraft, timeoutSeconds = 120) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let last = null;
  while (Date.now() < deadline) {
    await page.wait({ time: 2 });
    last = await evalPage(page, `
      (() => {
        ${DEEP_QUERY_FN}
        var text = deepVisibleText();
        var url = location.href;
        var buttons = deepQueryAll('button, [role="button"], a.weui-desktop-btn, .weui-desktop-btn');
        var clickedContinuation = false;
        var modalText = '';
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          if (!isVisible(btn)) continue;
          var label = (btn.innerText || btn.textContent || '').replace(/\\s+/g, ' ').trim();
          var disabled = btn.disabled || btn.getAttribute('disabled') !== null ||
            btn.classList.contains('weui-desktop-btn_disabled') ||
            btn.classList.contains('disabled') ||
            btn.getAttribute('aria-disabled') === 'true';
          if (disabled) continue;
          var nearby = '';
          var cursor = btn;
          for (var depth = 0; depth < 5 && cursor; depth++) {
            nearby = (cursor.innerText || '').replace(/\\s+/g, ' ').trim();
            if (/以下事项需注意|身份验证|确认发表|确定发表|确认发布|提交后|审核|规范/.test(nearby)) break;
            cursor = cursor.parentElement;
          }
          if (
            (label === '我知道了' && /以下事项需注意|身份验证|规范/.test(nearby)) ||
            (/^(确认|确定|继续|继续发表|确认发表|确定发表|确认发布)$/.test(label) && /发表|发布|提交|审核/.test(nearby))
          ) {
            modalText = nearby.slice(0, 500);
            clickLikeUser(btn);
            clickedContinuation = true;
            break;
          }
        }
        return {
          url,
          text: text.slice(0, 500),
          clicked_continuation: clickedContinuation,
          modal_text: modalText,
          success: ${isDraft ? '/草稿已保存|暂存成功|保存成功/' : '/已发表|发布成功|发表成功|审核中|发表成功，进入审核|已提交审核/'}.test(text) || url.indexOf('/platform/post/list') >= 0,
          failed: /失败|错误|违规|不符合|请重试/.test(text),
        };
      })()
    `);
    if (last?.clicked_continuation) {
      process.stderr.write(`[social-weixin-channels] continued post-submit confirmation: ${last.modal_text || ''}\n`);
      continue;
    }
    if (last?.success) return last;
    if (last?.failed) {
      throw new CommandExecutionError(`Platform reported submit failure: ${last.text}`);
    }
  }
  return { ...(last || {}), unknown: true };
}

export async function listPosts(page, limit = 20) {
  await gotoPostsPage(page);
  const rows = await evalPage(page, `
    (() => {
      ${DEEP_QUERY_FN}
      var pageText = deepVisibleText();
      if (/你还没有发表过视频|暂无视频/.test(pageText)) return [];
      var items = [];
      var candidates = Array.prototype.slice.call(deepQueryAll('[class*="post"], [class*="video"], [class*="item"], [class*="list"], tr, li, a')).filter(isVisible);
      var seen = new Set();
      for (var i = 0; i < candidates.length && items.length < ${Number(limit)}; i++) {
        var el = candidates[i];
        var text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!text || text.length < 2 || text.length > 500) continue;
        if (/(^|\\s)(首页\\s+)?内容管理 视频 图文 音乐 音频 草稿箱 主页 活动($|\\s)/.test(text)) continue;
        if (/^草稿箱$|^内容管理$|^视频$|^图文$|^音乐$|^音频$|^主页$|^活动$/.test(text)) continue;
        var timeMatch = text.match(/20\\d{2}年\\d{1,2}月\\d{1,2}日\\s+\\d{1,2}:\\d{2}/);
        var hasPublishedTime = Boolean(timeMatch);
        var hasExplicitStatus = /审核|已发表|草稿|定时|失败/.test(text);
        if (!hasPublishedTime && !hasExplicitStatus) continue;
        var title = text.slice(0, 80);
        var publishTime = timeMatch ? timeMatch[0] : '';
        if (hasPublishedTime) {
          title = text.slice(0, timeMatch.index).replace(/^.*发表视频\\s+/, '').trim();
          if (!title || title.length < 4 || /^视频管理|^视频\\s*\\(|^20\\d{2}年|^\\d+(\\s+\\d+)+$/.test(title)) continue;
        }
        var key = (title || text) + '|' + publishTime;
        if (seen.has(key)) continue;
        seen.add(key);
        var a = el.querySelector('a[href]');
        var href = a ? a.href : '';
        if (!/^https:\\/\\/channels\\.weixin\\.qq\\.com\\//.test(href)) href = '';
        items.push({
          status: /失败/.test(text) ? 'failed' : /草稿/.test(text) ? 'draft' : /定时/.test(text) ? 'scheduled' : /审核/.test(text) ? 'reviewing' : /已发表/.test(text) || hasPublishedTime ? 'published' : 'unknown',
          title,
          publish_time: publishTime,
          post_url: href,
          raw_status: text,
          detail: JSON.stringify({ text })
        });
      }
      return items;
    })()
  `);
  return Array.isArray(rows) ? rows : [];
}

export async function rawBrowserRequest(page, method, requestPath, body) {
  const normalizedMethod = String(method || '').trim().toUpperCase();
  const data = await evalPage(page, `
    (async function(method, requestPath, body) {
      var url = new URL(requestPath, location.origin);
      if (url.origin !== location.origin || url.hostname !== 'channels.weixin.qq.com') {
        return { ok: false, error: 'request path must stay under channels.weixin.qq.com' };
      }
      var init = { method, credentials: 'include', headers: {} };
      if (body !== undefined && body !== null) {
        init.headers['Content-Type'] = 'application/json';
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      var response = await fetch(url.toString(), init);
      var text = await response.text();
      var parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      return { ok: true, http_status: response.status, path: url.pathname + url.search, response: parsed, text: parsed ? '' : text.slice(0, 1000) };
    })(${JSON.stringify(normalizedMethod)}, ${JSON.stringify(requestPath)}, ${JSON.stringify(body)})
  `);
  if (!data?.ok) throw new CommandExecutionError(data?.error || 'raw browser request failed');
  return data;
}

async function clickUploadTrigger(page) {
  return evalPage(page, `
    (() => {
      ${DEEP_QUERY_FN}
      var sels = ${JSON.stringify(UPLOAD_TRIGGER_SELECTORS)};
      for (var i = 0; i < sels.length; i++) {
        var el = deepQuery(sels[i]);
        if (el && isVisible(el)) {
          clickLikeUser(el);
          return { ok: true, sel: sels[i] };
        }
      }
      return { ok: false };
    })()
  `);
}

async function uploadFile(page, absPath) {
  const stat = fs.statSync(absPath);
  const preferNativeFileInput = stat.size > 20 * 1024 * 1024;
  if (preferNativeFileInput && page.setFileInput) {
    await clickUploadTrigger(page);
    await page.wait({ time: 1 });
    for (const sel of ['input[type="file"][accept*="video"]', 'input[type="file"]']) {
      try {
        await page.setFileInput([absPath], sel);
        return;
      } catch {}
    }
  }

  const fileData = fs.readFileSync(absPath);
  const base64Full = fileData.toString('base64');
  const fileName = path.basename(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const mimeMap = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/avi', '.webm': 'video/webm' };
  const mimeType = mimeMap[ext] || 'video/mp4';

  await evalPage(page, '() => { window.__oc_chunks = []; }');
  const chunkSize = 50_000;
  for (let i = 0; i < base64Full.length; i += chunkSize) {
    const chunk = base64Full.slice(i, i + chunkSize);
    await evalPage(page, `((c) => { window.__oc_chunks.push(c); })(${JSON.stringify(chunk)})`);
  }
  await clickUploadTrigger(page);
  await page.wait({ time: 0.5 });
  const result = await evalPage(page, `
    (function(params) {
      ${DEEP_QUERY_FN}
      var inputSels = ['input[type="file"][accept*="video"]', 'input[type="file"]'];
      var input = null;
      for (var i = 0; i < inputSels.length; i++) {
        input = deepQuery(inputSels[i]);
        if (input) break;
      }
      if (!input) { window.__oc_chunks = []; return { ok: false, error: 'No file input found' }; }
      try {
        var b64 = window.__oc_chunks.join('');
        window.__oc_chunks = [];
        var binary = atob(b64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var dt = new DataTransfer();
        dt.items.add(new File([bytes], params.fileName, { type: params.mimeType }));
        Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        return { ok: true };
      } catch(e) {
        window.__oc_chunks = [];
        return { ok: false, error: e.message };
      }
    })(${JSON.stringify({ fileName, mimeType })})
  `);
  if (!result?.ok) {
    await safeScreenshot(page, '/tmp/social-weixin-channels_upload_debug.png');
    throw new CommandExecutionError(`Video file injection failed: ${result?.error || 'unknown'}`);
  }
}

async function waitForUploadDone(page, fileName, maxMs) {
  const pollMs = 3000;
  const maxAttempts = Math.ceil(maxMs / pollMs);
  for (let i = 0; i < maxAttempts; i++) {
    const done = await evalPage(page, `
      ((fileName) => {
        ${DEEP_QUERY_FN}
        var bodyText = deepVisibleText();
        function visibleQuery(selector) {
          var nodes = deepQueryAll(selector);
          for (var n = 0; n < nodes.length; n++) {
            if (isVisible(nodes[n])) return nodes[n];
          }
          return null;
        }
        var uploading = visibleQuery('[class*="upload"][class*="progress"]') ||
          visibleQuery('[class*="uploading"]') ||
          visibleQuery('[class*="transcoding"]') ||
          visibleQuery('.weui-desktop-upload__status');
        var preview = deepQuery('video') ||
          deepQuery('[class*="preview-video"]') ||
          deepQuery('[class*="video-thumb"]') ||
          deepQuery('[class*="video"][class*="preview"]');
        var uploadFailed = deepQuery('[class*="upload-fail"]') || deepQuery('[class*="upload-error"]');
        if (uploadFailed || /上传失败|转码失败|处理失败/.test(bodyText)) return { done: false, failed: true };
        var hasFileEvidence = fileName && bodyText.indexOf(fileName) >= 0;
        var hasSuccessText = /上传成功|转码完成|处理完成/.test(bodyText);
        return { done: !uploading && (!!preview || hasFileEvidence || hasSuccessText), failed: false };
      })(${JSON.stringify(fileName)})
    `);
    if (done?.failed) throw new CommandExecutionError('Video upload failed.');
    if (done?.done) return;
    if (i > 0 && i % 10 === 0) {
      process.stderr.write('[social-weixin-channels] waiting for visible upload completion\n');
    }
    await page.wait({ time: pollMs / 1000 });
  }
  throw new CommandExecutionError(`Video upload/processing timed out after ${Math.ceil(maxMs / 1000)}s.`);
}

async function fillField(page, selectors, text, fieldName) {
  const result = await evalPage(page, `
    (function(selectors, text) {
      ${DEEP_QUERY_FN}
      var el = null;
      var foundSel = null;
      for (var i = 0; i < selectors.length; i++) {
        var candidate = deepQuery(selectors[i]);
        if (candidate && isVisible(candidate)) {
          el = candidate;
          foundSel = selectors[i];
          break;
        }
      }
      if (!el) return { ok: false };
      el.focus();
      function emitInputEvents(target, value) {
        try { target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, composed: true, data: value, inputType: 'insertText' })); } catch {}
        try { target.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: value, inputType: 'insertText' })); } catch {
          target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }
        target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, composed: true, data: value }));
        target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, key: 'Process' }));
      }
      if (el.isContentEditable) {
        el.textContent = '';
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
        var inserted = document.execCommand('insertText', false, text);
        if (!inserted) el.textContent = text;
        emitInputEvents(el, text);
      } else {
        var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
        if (nativeSetter) nativeSetter.call(el, text);
        else el.value = text;
        emitInputEvents(el, text);
      }
      var actual = el.isContentEditable ? (el.innerText || el.textContent || '') : (el.value || '');
      el.blur();
      return { ok: actual.indexOf(text) >= 0, sel: foundSel, actual: actual };
    })(${JSON.stringify(selectors)}, ${JSON.stringify(text)})
  `);
  if (!result?.ok) {
    await safeScreenshot(page, `/tmp/social-weixin-channels_${fieldName}_debug.png`);
    throw new CommandExecutionError(`Unable to fill ${fieldName} field.`);
  }
}

async function setScheduleTime(page, dt) {
  const targetYear = dt.getFullYear();
  const targetMonth = dt.getMonth() + 1;
  const targetDay = dt.getDate();
  const targetHour = dt.getHours();
  const targetMin = dt.getMinutes();
  const pad = (n) => String(n).padStart(2, '0');
  const result = await evalPage(page, `
    (async function(TY, TM, TD, TH, TMin) {
      ${DEEP_QUERY_FN}
      function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
      var pad = function(n) { return String(n).padStart(2, '0'); };
      var labels = deepQueryAll('label');
      var radioOk = false;
      for (var i = 0; i < labels.length; i++) {
        if ((labels[i].innerText || labels[i].textContent || '').trim() === '定时') {
          clickLikeUser(labels[i]);
          labels[i].click();
          radioOk = true;
          break;
        }
      }
      if (!radioOk) return { ok: false, reason: 'no-radio' };
      await sleep(600);
      var dateDl = deepQuery('dl.weui-desktop-picker__date');
      if (!dateDl) return { ok: false, reason: 'no-date-dl' };
      var dateDt = dateDl.querySelector('dt.weui-desktop-picker__dt');
      if (!dateDt) return { ok: false, reason: 'no-date-dt' };
      clickLikeUser(dateDt);
      await sleep(500);
      var reached = false;
      for (var nav = 0; nav < 24; nav++) {
        var lbls = Array.prototype.map.call(dateDl.querySelectorAll('.weui-desktop-picker__panel__label'), function(l) { return (l.innerText || '').trim(); });
        var ma = lbls.join('').match(/(\\d{4})年\\s*(\\d{1,2})月/);
        if (!ma) return { ok: false, reason: 'label-parse', labels: lbls.join('|') };
        var cy = parseInt(ma[1], 10), cm = parseInt(ma[2], 10);
        if (cy === TY && cm === TM) { reached = true; break; }
        var goNext = (cy < TY) || (cy === TY && cm < TM);
        var arrow = goNext ? dateDl.querySelector('.weui-desktop-btn__icon__right') : dateDl.querySelector('.weui-desktop-btn__icon__left');
        if (!arrow) return { ok: false, reason: 'no-arrow', cy: cy, cm: cm };
        clickLikeUser(arrow);
        await sleep(350);
      }
      if (!reached) return { ok: false, reason: 'month-not-reached' };
      var bd = dateDl.querySelector('.weui-desktop-picker__panel__bd');
      var anchors = bd ? Array.prototype.slice.call(bd.querySelectorAll('a')) : [];
      var dayEl = null;
      for (var k = 0; k < anchors.length; k++) {
        var t = (anchors[k].innerText || anchors[k].textContent || '').trim();
        var cls = anchors[k].className || '';
        if (t === String(TD) && cls.indexOf('faded') < 0 && cls.indexOf('disabled') < 0) {
          dayEl = anchors[k];
          break;
        }
      }
      if (!dayEl) return { ok: false, reason: 'day-disabled-or-missing', day: TD };
      clickLikeUser(dayEl);
      await sleep(500);
      var timeDl = deepQuery('dl.weui-desktop-picker__time');
      if (!timeDl) return { ok: false, reason: 'no-time-dl' };
      var timeDt = timeDl.querySelector('dt.weui-desktop-picker__dt');
      if (timeDt) clickLikeUser(timeDt);
      await sleep(500);
      function pickFromColumn(ol, value) {
        if (!ol) return false;
        var lis = ol.querySelectorAll('li');
        for (var i = 0; i < lis.length; i++) {
          if ((lis[i].innerText || '').trim() === value && (lis[i].className || '').indexOf('disabled') < 0) {
            clickLikeUser(lis[i]);
            return true;
          }
        }
        return false;
      }
      if (!pickFromColumn(timeDl.querySelector('ol.weui-desktop-picker__time__hour'), pad(TH))) return { ok: false, reason: 'hour-disabled', hour: TH };
      await sleep(300);
      if (!pickFromColumn(timeDl.querySelector('ol.weui-desktop-picker__time__minute'), pad(TMin))) return { ok: false, reason: 'minute-disabled', minute: TMin };
      await sleep(300);
      var inp = deepQuery('input[placeholder*="发表时间"]');
      return { ok: true, value: inp ? inp.value : null };
    })(${targetYear}, ${targetMonth}, ${targetDay}, ${targetHour}, ${targetMin})
  `);
  if (!result?.ok) {
    await safeScreenshot(page, '/tmp/social-weixin-channels_schedule_debug.png');
    throw new CommandExecutionError(`Schedule setting failed: ${result?.reason || 'unknown'}`);
  }
  const expected = `${targetYear}-${pad(targetMonth)}-${pad(targetDay)} ${pad(targetHour)}:${pad(targetMin)}`;
  if (!String(result.value || '').includes(expected)) {
    throw new CommandExecutionError(`Schedule setting was not verified. expected=${expected} actual=${result.value || ''}`);
  }
}

async function safeScreenshot(page, filePath) {
  try {
    await page.screenshot({ path: filePath, fullPage: true });
  } catch {}
}
