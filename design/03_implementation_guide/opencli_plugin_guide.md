# OpenCLI Plugin Guide

## Layout

OpenCLI scans plugin package directories flatly. Any file that registers commands with `cli(...)` must live directly in the package root:

```text
packages/publisher-weixin/
  auth.js
  draft-add.js
  publish.js
  lib/
    weixin.js
```

Helper modules can live under `lib/`.

## Command Rules

- Import only from OpenCLI public exports such as `@jackwener/opencli/registry` and `@jackwener/opencli/errors`.
- Always declare `access`.
- Use `Strategy.LOCAL` for official API commands that do not need a browser.
- Keep output rows compact and include remote IDs.
- Throw `ArgumentError` for invalid local input.
- Throw `CommandExecutionError` for platform API errors.

## Distribution

Local development:

```bash
opencli plugin install file:///absolute/path/opencli-publisher/packages/publisher-weixin
```

GitHub monorepo distribution:

```bash
opencli plugin install github:<owner>/opencli-publisher
opencli plugin install github:<owner>/opencli-publisher/publisher-weixin
opencli plugin update publisher-weixin
```

