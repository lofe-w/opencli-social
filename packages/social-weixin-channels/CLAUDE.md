# social-weixin-channels 指南

本包在 `opencli social-weixin-channels` 下暴露微信视频号助手发布命令。视频号发布没有公开官方发布 API，因此本包使用 OpenCLI 浏览器会话驱动 `channels.weixin.qq.com` 网页端。

## 文件

| 路径 | 用途 |
|---|---|
| `doctor.js` | 诊断 OpenCLI browser、登录态和发布页可达性 |
| `auth-status.js` | 读取当前登录态 |
| `auth-begin.js` | 打开登录页并返回 HITL 登录指令 |
| `accounts-list.js` | 读取页面中可识别的视频号主体 |
| `account-current.js` | 读取当前视频号主体 |
| `account-resolve.js` | 校验期望主体是否与页面匹配 |
| `video-preflight.js` | 本地校验视频、描述、封面、定时和首版范围字段 |
| `publish-video.js` | 创建可恢复 job，上传视频，保存草稿或提交发表 |
| `jobs-get.js` | 读取本地 job metadata |
| `jobs-resume.js` | 从本地 job 断点恢复 |
| `jobs-cancel.js` | 取消本地 job metadata |
| `posts-list.js` | 读取最近内容用于发布结果反查 |
| `page-state.js` | 只读捕获当前页面可见文本、按钮和截图，用于 HITL/调试反查 |
| `request.js` | 受保护的同源 browser-context raw escape hatch |
| `lib/channels/` | 页面驱动、校验、HITL 和 job store 实现 |

## 规则

- 不要保存、导出或复制 cookie/storage state；OpenCLI profile 负责浏览器会话。
- 插件只保存可恢复 job metadata，不保存 token、完整 header、二维码原始 URL、完整文案或未脱敏私密响应；文案只保存 hash 与 preview。
- 远端写操作必须声明 `access: 'write'` 并要求 `--execute`。
- 发布流程必须保留 `job_id`、`resume_command` 和稳定 JSON 字段。
- 遇到扫码、手机确认、账号选择、验证码、自动上传失败/超时、封面裁剪或最终发表前确认时，返回 `status=needs_human`。
- `jobs-resume` 在提交前必须确认当前页面、账号、视频和表单内容与 job 对齐；无法确认时返回 `needs_human`。
- `unknown_result` 后不要重试发表；先用 `posts-list`、`page-state` 或人工检查反查状态，确认未发布后重新创建发布任务。
- 如果原始文案来自 `--description`，恢复时需要重新传入 `jobs-resume --description ...` 或 `--description-file ...`。
