# OpenCLI Publisher - Agent Guide

This file is the main entrypoint for agents working in this repository. It mirrors `CLAUDE.md`; keep both files in sync.

## Project Overview

OpenCLI Publisher is a monorepo of OpenCLI plugins for publishing content to social platforms. Each platform lives in its own sub-plugin and uses a `publisher-<platform>` command namespace to avoid collisions with built-in OpenCLI adapters.

Phase 1 implements `publisher-weixin`, a WeChat Official Account publishing plugin backed by official WeChat API endpoints.

## Tech Stack

| Area | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Plugin host | OpenCLI plugin system |
| Package layout | npm workspaces |
| Commands | ESM JavaScript files registered via `@jackwener/opencli/registry` |
| Auth | Environment variables and WeChat Official Account access tokens |

## Documentation Map

| Path | Purpose | When to read |
|---|---|---|
| `design/CLAUDE.md` | Design documentation index | Before feature work |
| `design/domain.md` | Domain language and cross-platform publishing model | Before implementing commands |
| `design/02_platforms/weixin_official_account.md` | WeChat Official Account API model and command map | Before changing `publisher-weixin` |
| `design/03_implementation_guide/opencli_plugin_guide.md` | OpenCLI plugin implementation conventions | Before adding commands or packages |
| `packages/publisher-weixin/CLAUDE.md` | WeChat plugin local guide | Before editing that package |
| `issues/` | Local issues and implementation notes | When planning work |
| `memory/` | Durable project memory | When resuming context |

## Global Rules

1. Read `design/domain.md` before feature development.
2. Use official platform APIs when available. Use browser UI automation only when a platform has no official API for the required capability.
3. Publishing commands are write operations. They must declare `access: 'write'` and use explicit, typed failures for expected platform errors.
4. Do not silently publish when validation fails. If a field cannot be applied or verified, throw before submitting.
5. Keep command namespaces distinct from OpenCLI built-ins. Use `publisher-weixin`, `publisher-xiaohongshu`, etc.
6. Plugin command files that call `cli(...)` must live directly in each plugin package root because OpenCLI scans plugin directories flatly.
7. Helper modules may live in package subdirectories such as `lib/`.
8. New markdown documents must be added to the nearest `CLAUDE.md` index.
9. Keep temporary captures, screenshots, and raw API samples in `tmp/` or `memory/`, not in package roots.
10. Keep `AGENTS.md` and `CLAUDE.md` synchronized.

## Development Commands

```bash
npm test
opencli plugin install file:///Users/fushuai/GitRepository/opencli-publisher/packages/publisher-weixin
opencli publisher-weixin auth
```

## Distribution

During local development, install sub-plugin directories with `file://`. After publishing the repository to GitHub, users can install the whole monorepo or a specific sub-plugin:

```bash
opencli plugin install github:<owner>/opencli-publisher
opencli plugin install github:<owner>/opencli-publisher/publisher-weixin
opencli plugin update publisher-weixin
```

