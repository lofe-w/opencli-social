# social-weixin-channels

OpenCLI plugin for WeChat Channels creator publishing through the official web creator center at `channels.weixin.qq.com`.

The plugin does not store cookies or browser storage. OpenCLI profiles own login state; this package only performs platform actions and stores recoverable publish job metadata under `~/.opencli-social/channels/jobs`.

## Install

```bash
command -v opencli || npm install -g @jackwener/opencli@latest
opencli plugin install github:lofe-w/opencli-social/social-weixin-channels
opencli plugin list -f json
opencli list -f json | rg 'social-weixin-channels'
```

If OpenCLI prints `esbuild not found` during installation, verify the command
list before treating it as a failure. This package ships ESM JavaScript files and
does not require TypeScript transpilation.

Companion Agent Skill:

```bash
npx -y skills@latest add lofe-w/opencli-social --skill social-weixin-channels -y -g
npx -y skills@latest ls -g --json | rg 'social-weixin-channels'
```

Installation only verifies that the command and skill can be discovered. Browser
session health, WeChat Channels login, and target account confirmation are
separate readiness checks.

## AI Agent Setup

Agents should run setup in this order:

```bash
opencli doctor
opencli social-weixin-channels doctor -f json
opencli social-weixin-channels auth-status -f json
```

If login is required, start the HITL login flow:

```bash
opencli social-weixin-channels auth-begin --execute -f json
```

If the command returns `status=needs_human`, pass `message`, `url`,
`screenshot_path`, and `resume_command` to the user. Wait for the user to scan
the QR code, confirm on mobile, or select the correct account, then run the
returned `resume_command`; do not invent a replacement.

Verify ready state before publishing:

```bash
opencli social-weixin-channels auth-status -f json
opencli social-weixin-channels accounts-list -f json
opencli social-weixin-channels account-current -f json
```

## Commands

```bash
opencli social-weixin-channels doctor -f json
opencli social-weixin-channels auth-status -f json
opencli social-weixin-channels auth-begin --execute -f json
opencli social-weixin-channels accounts-list -f json
opencli social-weixin-channels account-current -f json
opencli social-weixin-channels account-resolve --account-name "账号名" -f json

opencli social-weixin-channels video-preflight \
  --video ./demo.mp4 \
  --description "发布文案" \
  --tags "OpenCLI,测试" \
  -f json

opencli social-weixin-channels publish-video \
  --video ./demo.mp4 \
  --description "发布文案" \
  --tags "OpenCLI,测试" \
  --execute \
  -f json

opencli social-weixin-channels publish-video \
  --video ./demo.mp4 \
  --description "发布文案" \
  --publish-now \
  --final-approval required \
  --execute \
  -f json

opencli social-weixin-channels jobs-get <job-id> -f json
opencli social-weixin-channels jobs-resume <job-id> --execute -f json
opencli social-weixin-channels jobs-resume <job-id> --description "发布文案" --execute -f json
opencli social-weixin-channels jobs-cancel <job-id> --execute -f json
opencli social-weixin-channels posts-list --limit 20 -f json
opencli social-weixin-channels page-state --target current -f json
opencli social-weixin-channels request get / -f json
```

## JSON Policy

All commands return compact rows with stable top-level fields. Publishing rows include `status`, `command`, `job_id`, `account_status`, `account_name`, `url`, and `detail`. HITL rows use `status=needs_human` and include `reason`, `human_action`, `hitl_id`, `message`, `screenshot_path`, `resume_command`, and `expires_at`.

Expected platform failures use OpenCLI typed errors. If a publish click result is not verifiable, the command returns `status=unknown_result`; agents must not automatically retry the submit action and should use `posts-list` or human inspection first.

Job metadata stores file summaries, caption hash, and caption preview only. It does not store full captions. If the original caption came from `--description`, resumable stages that need to verify or refill the form require passing `jobs-resume --description ...` or `--description-file ...`; captions originally loaded from `--description-file` are re-read and hash-checked.
