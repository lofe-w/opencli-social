# publisher-weixin Guide

This package exposes WeChat Official Account publishing commands under `opencli publisher-weixin`.

## Files

| Path | Purpose |
|---|---|
| `auth.js` | Validate token acquisition |
| `upload-image.js` | Upload permanent cover image material |
| `upload-content-image.js` | Upload inline article image |
| `draft-add.js` | Create a single-article draft |
| `publish.js` | Submit a draft media ID |
| `publish-status.js` | Query publish status |
| `publish-article.js` | Composite draft + optional submit flow |
| `lib/weixin.js` | Official API helper functions |

## Rules

- Command registration files must stay in this directory root.
- Do not move command files under `src/`; OpenCLI plugin discovery will not load them.
- `--execute` is required for remote writes.
- Keep API errors typed through OpenCLI error classes.

