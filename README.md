# opencli-publisher

OpenCLI Publisher is a monorepo of publishing plugins for OpenCLI.

Phase 1 ships `publisher-weixin`, a WeChat Official Account publishing plugin built on official WeChat API endpoints.

## Install During Local Development

```bash
opencli plugin install file:///Users/fushuai/GitRepository/opencli-publisher/packages/publisher-weixin
opencli publisher-weixin auth
```

## Install From GitHub

After this repository is pushed to GitHub:

```bash
opencli plugin install github:<owner>/opencli-publisher
opencli plugin install github:<owner>/opencli-publisher/publisher-weixin
opencli plugin update publisher-weixin
```

## WeChat Official Account Environment

Set either the publisher-specific variables or the shorter fallback names:

```bash
export PUBLISHER_WEIXIN_APP_ID="wx..."
export PUBLISHER_WEIXIN_APP_SECRET="..."

# Optional: bypass appid/secret token exchange with a managed token.
export PUBLISHER_WEIXIN_ACCESS_TOKEN="..."
```

## Commands

```bash
opencli publisher-weixin auth
opencli publisher-weixin upload-image ./cover.jpg
opencli publisher-weixin draft-add "正文 HTML" --title "标题" --cover-image ./cover.jpg --execute
opencli publisher-weixin publish <draft_media_id> --execute
opencli publisher-weixin publish-status <publish_id>
opencli publisher-weixin publish-article "正文 HTML" --title "标题" --cover-image ./cover.jpg --publish --execute
```

See `packages/publisher-weixin/README.md` for details.

