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

```bash
# Install all enabled plugins from the monorepo
opencli plugin install github:lofe-w/opencli-social

# Or install one plugin
opencli plugin install github:lofe-w/opencli-social/social-wechat-article
opencli plugin install github:lofe-w/opencli-social/social-weixin-channels

# Update later
opencli plugin update --all
```

## Agent Skills

This repository ships thin companion skills for agents that operate high-risk publishing workflows. They are not command references; use OpenCLI help and `-f json` output as the source of truth for parameters, fields, and errors.

Install OpenCLI first:

```bash
npm install -g @jackwener/opencli@latest
opencli --version
```

```bash
npx skills add lofe-w/opencli-social --skill social-wechat-article
npx skills add lofe-w/opencli-social --skill social-weixin-channels
```

Use `social-wechat-article` when an agent needs to configure, draft, publish, or check WeChat Official Account articles. Use `social-weixin-channels` when an agent needs to diagnose login, preflight videos, handle HITL, publish, resume jobs, or inspect unknown WeChat Channels publish results.

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
