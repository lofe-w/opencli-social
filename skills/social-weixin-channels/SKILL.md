---
name: social-weixin-channels
description: 使用 OpenCLI 的 social-weixin-channels 插件安全编排微信视频号登录诊断、账号确认、视频预检、HITL 人工断点、发布 job、恢复和结果反查。适用于 Agent 需要通过 `opencli social-weixin-channels` 登录浏览器会话、发布视频、恢复 job 或检查未知发布结果的场景。
---

# social-weixin-channels

本 Skill 只规定 Agent 的安全编排策略。命令参数、页面字段和错误细节以 `opencli social-weixin-channels --help`、子命令 `--help`、`-f json` 输出和插件 README 为准。

## 安装和可用性

本 Skill 不会自动安装 CLI 插件，也不代表视频号浏览器会话已经登录。先确认 OpenCLI、插件和 Skill 均可发现：

```bash
node --version
command -v opencli || npm install -g @jackwener/opencli@latest
opencli --version
opencli plugin list -f json
opencli list -f json | rg 'social-weixin-channels'
npx -y skills@latest ls -g --json | rg 'social-weixin-channels'
```

插件缺失时，安装对应 CLI 插件：

```bash
opencli plugin install github:lofe-w/opencli-social/social-weixin-channels
```

Skill 缺失时，安装对应 Agent Skill：

```bash
npx -y skills@latest add lofe-w/opencli-social --skill social-weixin-channels -g -y --copy
```

安装完成只说明命令可发现。真正可发布前，必须确认 OpenCLI browser 可用、视频号已登录，并且目标账号明确。

## 默认姿态

- 使用 `-f json`，根据 `status`、`reason`、`job_id`、`resume_command`、`screenshot_path` 和 `url` 决策。
- 视频号没有公开发布 API，本插件通过 OpenCLI 浏览器会话操作 `channels.weixin.qq.com`。不要保存、导出或复制 cookie/storage state。
- 先诊断登录和账号，再预检视频，最后才执行发布命令。
- 写操作只有在用户明确要登录、上传、保存草稿、提交发布、恢复或取消 job 时才加 `--execute`。
- `needs_human` 是正常状态，不是异常。把 CLI 返回的人类动作转述给用户，等待用户完成后执行 `resume_command`。
- `unknown_result` 后不要自动重试提交发布；先反查 `posts-list`、`jobs-get`、`page-state` 或要求人工确认。
- `request` 是同源 browser-context escape hatch。优先使用高层命令；非 GET/HEAD raw 请求必须有明确授权和 `--execute`。

## 浏览器前置条件

视频号发布依赖 OpenCLI 浏览器会话。登录、页面操作或截图失败时，先运行：

```bash
opencli doctor
```

## 登录和账号

从只读诊断开始：

```bash
opencli social-weixin-channels doctor -f json
opencli social-weixin-channels auth-status -f json
```

需要登录时，打开登录流程并把 `needs_human` 信息转给用户：

```bash
opencli social-weixin-channels auth-begin --execute -f json
```

用户完成扫码、手机确认或账号选择后，继续读取账号状态：

```bash
opencli social-weixin-channels accounts-list -f json
opencli social-weixin-channels account-current -f json
```

如果用户指定发布主体，发布前解析并确认：

```bash
opencli social-weixin-channels account-resolve --account-name "账号名" -f json
```

账号不明确、多个主体无法判断或页面主体不匹配时，停止发布并请用户确认，不要默认选择第一个账号或最近账号。

## 发布编排

先做本地预检。预检失败时修正文件、文案、标签、封面或定时字段，不访问远端写入页面：

```bash
opencli social-weixin-channels video-preflight \
  --video ./demo.mp4 \
  --description "发布文案" \
  --tags "OpenCLI,测试" \
  -f json
```

只有用户明确同意创建远端发布 job 后，才执行：

```bash
opencli social-weixin-channels publish-video \
  --video ./demo.mp4 \
  --description "发布文案" \
  --tags "OpenCLI,测试" \
  --execute \
  -f json
```

如果要立即发表，并且插件要求最终人工确认，保留 HITL：

```bash
opencli social-weixin-channels publish-video \
  --video ./demo.mp4 \
  --description "发布文案" \
  --publish-now \
  --final-approval required \
  --execute \
  -f json
```

输出包含 `status=needs_human` 时，向用户展示 `message`、`human_action`、`url`、`screenshot_path` 和 `resume_command`。用户完成动作后，执行返回的恢复命令；不要自己编造恢复命令。

## Job 恢复和结果反查

查看 job：

```bash
opencli social-weixin-channels jobs-get <job-id> -f json
```

恢复 job：

```bash
opencli social-weixin-channels jobs-resume <job-id> --execute -f json
```

如果原始文案来自 `--description`，恢复时通常需要重新传入一致的文案或 `--description-file`，让插件校验 hash：

```bash
opencli social-weixin-channels jobs-resume <job-id> \
  --description "发布文案" \
  --execute \
  -f json
```

不确定是否发布成功时，先反查：

```bash
opencli social-weixin-channels posts-list --limit 20 -f json
opencli social-weixin-channels page-state --target current -f json
```

`unknown_result` 之后不要重复执行 `publish-video --execute` 或 `jobs-resume --execute` 来碰运气。只有确认没有提交成功，并且用户重新授权，才能创建新的发布任务。

取消本地 job metadata 也属于写操作：

```bash
opencli social-weixin-channels jobs-cancel <job-id> --execute -f json
```
