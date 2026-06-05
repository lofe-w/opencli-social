# opencli-social

OpenCLI Social is a monorepo of OpenCLI plugins for operating social and content platforms.

Each platform lives in its own package and exposes a `social-<platform>` command namespace. Platform-specific setup, command examples, and API notes belong in the package README; this root README covers the workspace as a whole.

## Packages

| Package | Namespace | Status | Docs |
|---|---|---|---|
| `packages/social-weixin` | `social-weixin` | Phase 1: WeChat Official Account publishing | [`packages/social-weixin/README.md`](packages/social-weixin/README.md) |
| `packages/social-weixin-channels` | `social-weixin-channels` | Phase 2: WeChat Channels browser-backed publishing | [`packages/social-weixin-channels/README.md`](packages/social-weixin-channels/README.md) |

Planned platform packages and capability boundaries are tracked in [`design/00_product_overview/product_overview.md`](design/00_product_overview/product_overview.md) and [`design/domain.md`](design/domain.md).

## Local Development

```bash
npm test
opencli plugin install file:///Users/fushuai/GitRepository/opencli-social/packages/social-weixin
opencli social-weixin doctor
opencli plugin install file:///Users/fushuai/GitRepository/opencli-social/packages/social-weixin-channels
opencli social-weixin-channels doctor -f json
```

## GitHub Install

After this repository is published to GitHub:

```bash
opencli plugin install github:<owner>/opencli-social
opencli plugin install github:<owner>/opencli-social/social-weixin
opencli plugin update social-weixin
```

## Documentation

| Path | Purpose |
|---|---|
| [`design/CLAUDE.md`](design/CLAUDE.md) | Design document index |
| [`design/domain.md`](design/domain.md) | Shared social platform operations language |
| [`design/02_platforms/weixin_official_account.md`](design/02_platforms/weixin_official_account.md) | WeChat Official Account API and command model |
| [`design/02_platforms/weixin_channels.md`](design/02_platforms/weixin_channels.md) | WeChat Channels browser session, HITL, and publish job model |
| [`design/03_implementation_guide/opencli_plugin_guide.md`](design/03_implementation_guide/opencli_plugin_guide.md) | OpenCLI plugin implementation guide |
| [`packages/social-weixin/README.md`](packages/social-weixin/README.md) | `social-weixin` setup, commands, validation, and live publishing checklist |
| [`packages/social-weixin-channels/README.md`](packages/social-weixin-channels/README.md) | `social-weixin-channels` setup, commands, HITL, and publishing checklist |
