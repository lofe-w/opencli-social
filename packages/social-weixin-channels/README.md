# social-weixin-channels

OpenCLI plugin for WeChat Channels creator publishing through the official web creator center at `channels.weixin.qq.com`.

The plugin does not store cookies or browser storage. OpenCLI profiles own login state; this package only performs platform actions and stores recoverable publish job metadata under `~/.opencli-social/channels/jobs`.

## Install

```bash
opencli plugin install file:///Users/fushuai/GitRepository/opencli-social/packages/social-weixin-channels
opencli social-weixin-channels doctor -f json
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
