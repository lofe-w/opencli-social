# opencli-social

OpenCLI Social is a monorepo of OpenCLI plugins for operating social and content platforms.

Each platform lives in its own package and exposes a `social-<platform>` command namespace. Platform-specific setup, command examples, and API notes belong in the package README; this root README covers the workspace as a whole.

## Packages

| Package | Namespace | Status | Docs |
|---|---|---|---|
| `packages/social-wechat-article` | `social-wechat-article` | Phase 1: WeChat Article publishing | [`packages/social-wechat-article/README.md`](packages/social-wechat-article/README.md) |
| `packages/social-weixin-channels` | `social-weixin-channels` | Phase 2: WeChat Channels browser-backed publishing | [`packages/social-weixin-channels/README.md`](packages/social-weixin-channels/README.md) |

Planned platform packages and capability boundaries are tracked in [`design/00_product_overview/product_overview.md`](design/00_product_overview/product_overview.md) and [`design/domain.md`](design/domain.md).

## Install

OpenCLI Social is intentionally distributed as independent OpenCLI plugins and
companion Agent Skills. Install the CLI plugins you need; the root skill command
installs all companion Agent Skills from this repository.

### Runtime

```bash
node --version
command -v opencli || npm install -g @jackwener/opencli@latest
opencli --version
```

### CLI plugins

```bash
# Install all enabled plugins from the monorepo
opencli plugin install github:lofe-w/opencli-social

# Or install one plugin
opencli plugin install github:lofe-w/opencli-social/social-wechat-article
opencli plugin install github:lofe-w/opencli-social/social-weixin-channels

# Update later
opencli plugin update --all
```

Verify CLI discovery before configuring accounts:

```bash
opencli plugin list -f json
opencli list -f json | rg 'social-wechat-article|social-weixin-channels'
```

## Agent Skills

This repository ships thin companion skills for agents that operate high-risk publishing workflows. They are not command references; use OpenCLI help and `-f json` output as the source of truth for parameters, fields, and errors.

Install all companion skills from this repository:

```bash
npx -y skills@latest add lofe-w/opencli-social -y -g
```

Verify skill discovery:

```bash
npx -y skills@latest ls -g --json | rg 'social-wechat-article|social-weixin-channels'
```

Use `social-wechat-article` when an agent needs to configure, draft, publish, or check WeChat Official Account articles. Use `social-weixin-channels` when an agent needs to diagnose login, preflight videos, handle HITL, publish, resume jobs, or inspect unknown WeChat Channels publish results.

## Quick Start For AI Agents

If you are an AI Agent helping a user install this project, do not infer missing
setup steps. Treat installation, account configuration, and readiness checks as
separate phases.

### Step 1 - Choose and install CLI plugins

```bash
# Pick one:
opencli plugin install github:lofe-w/opencli-social
opencli plugin install github:lofe-w/opencli-social/social-wechat-article
opencli plugin install github:lofe-w/opencli-social/social-weixin-channels
```

Then verify:

```bash
opencli plugin list -f json
opencli list -f json | rg 'social-wechat-article|social-weixin-channels'
```

OpenCLI may print this warning during GitHub plugin installation:

```text
esbuild not found. TS plugin files will not be transpiled and may fail to load.
```

OpenCLI Social plugins are plain ESM JavaScript, not TypeScript. Treat this as a
non-fatal OpenCLI host warning when `opencli plugin install` exits successfully
and `opencli list -f json` shows the expected `social-*` commands.

### Step 2 - Install Agent Skills

```bash
npx -y skills@latest add lofe-w/opencli-social -y -g
```

Then verify:

```bash
npx -y skills@latest ls -g --json | rg 'social-wechat-article|social-weixin-channels'
```

### Step 3 - Configure authentication

Installation only proves the command and skill can be discovered. The CLI is not
ready to operate a platform account until the relevant authentication check
passes.

For WeChat Official Account articles, ask the user for a profile alias, AppID,
and AppSecret. The AppSecret should be passed through stdin or an environment
variable, not pasted into chat logs:

```bash
printf '%s' "$WECHAT_APP_SECRET" | OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-config \
  --app-id "$WECHAT_APP_ID" \
  --display-name "公众号A" \
  --app-secret-stdin \
  --execute \
  -f json

OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-status -f json
OPENCLI_PROFILE=oa-a opencli social-wechat-article doctor --check-token -f json
```

The current machine or server outbound IP must be included in the WeChat Official
Account API IP whitelist before token verification can succeed.

For WeChat Channels, browser login is the authentication step. The user may need
to scan a QR code, confirm on mobile, or select the target Channels account:

```bash
opencli doctor
opencli social-weixin-channels doctor -f json
opencli social-weixin-channels auth-begin --execute -f json
opencli social-weixin-channels auth-status -f json
opencli social-weixin-channels accounts-list -f json
opencli social-weixin-channels account-current -f json
```

If a command returns `status=needs_human`, pass `message`, `url`,
`screenshot_path`, and `resume_command` to the user. After the user completes
the action, run the returned `resume_command`; do not invent a replacement.

### Step 4 - Verify ready state

Use these checks before attempting any remote write:

```bash
OPENCLI_PROFILE=oa-a opencli social-wechat-article doctor --check-token -f json
opencli social-weixin-channels auth-status -f json
opencli social-weixin-channels account-current -f json
```

Remote writes such as uploading media, creating drafts, publishing, saving jobs,
or cancelling jobs require explicit `--execute`. Dry runs and read-only
diagnostics should be used first.

## Documentation

| Path | Purpose |
|---|---|
| [`design/CLAUDE.md`](design/CLAUDE.md) | Design document index |
| [`design/domain.md`](design/domain.md) | Shared social platform operations language |
| [`design/02_platforms/wechat_article.md`](design/02_platforms/wechat_article.md) | WeChat Article API and command model |
| [`design/02_platforms/weixin_channels.md`](design/02_platforms/weixin_channels.md) | WeChat Channels browser session, HITL, and publish job model |
| [`design/03_implementation_guide/opencli_plugin_guide.md`](design/03_implementation_guide/opencli_plugin_guide.md) | OpenCLI plugin implementation guide |
| [`packages/social-wechat-article/README.md`](packages/social-wechat-article/README.md) | `social-wechat-article` setup, commands, validation, and live publishing checklist |
| [`packages/social-weixin-channels/README.md`](packages/social-weixin-channels/README.md) | `social-weixin-channels` setup, commands, HITL, and publishing checklist |
| [`skills/social-wechat-article/SKILL.md`](skills/social-wechat-article/SKILL.md) | Agent strategy for safe WeChat Official Account article workflows |
| [`skills/social-weixin-channels/SKILL.md`](skills/social-weixin-channels/SKILL.md) | Agent strategy for safe WeChat Channels publishing workflows |
