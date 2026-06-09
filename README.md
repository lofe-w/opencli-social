# opencli-social

OpenCLI Social is a monorepo of OpenCLI plugins for operating social and content platforms.

Each platform lives in its own package and exposes a `social-<platform>` command namespace. Platform-specific setup, command examples, and API notes belong in the package README; this root README covers the workspace as a whole.

## Packages

| Package | Namespace | Status | Docs |
|---|---|---|---|
| `packages/social-wechat-article` | `social-wechat-article` | Phase 1: WeChat Article publishing | [`packages/social-wechat-article/README.md`](packages/social-wechat-article/README.md) |
| `packages/social-weixin-channels` | `social-weixin-channels` | Phase 2: WeChat Channels browser-backed publishing | [`packages/social-weixin-channels/README.md`](packages/social-weixin-channels/README.md) |

Planned platform packages and capability boundaries are tracked in [`design/00_product_overview/product_overview.md`](design/00_product_overview/product_overview.md) and [`design/domain.md`](design/domain.md).

## Local Development

```bash
npm test
opencli plugin install file:///Users/fushuai/GitRepository/opencli-social/packages/social-wechat-article
opencli social-wechat-article doctor
opencli plugin install file:///Users/fushuai/GitRepository/opencli-social/packages/social-weixin-channels
opencli social-weixin-channels doctor -f json
```

## GitHub Install

After this repository is published to GitHub:

```bash
opencli plugin install github:<owner>/opencli-social
opencli plugin install github:<owner>/opencli-social/social-wechat-article
opencli plugin update social-wechat-article
```

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
