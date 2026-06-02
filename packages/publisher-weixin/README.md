# publisher-weixin

OpenCLI plugin for WeChat Official Account publishing.

## Environment

```bash
export PUBLISHER_WEIXIN_APP_ID="wx..."
export PUBLISHER_WEIXIN_APP_SECRET="..."
```

or provide a managed token:

```bash
export PUBLISHER_WEIXIN_ACCESS_TOKEN="..."
```

## Commands

```bash
opencli publisher-weixin auth

opencli publisher-weixin upload-image ./cover.jpg --execute
opencli publisher-weixin upload-content-image ./inline.jpg --execute

opencli publisher-weixin draft-add "正文 HTML" \
  --title "标题" \
  --cover-image ./cover.jpg \
  --digest "摘要" \
  --execute

opencli publisher-weixin publish <draft_media_id> --execute
opencli publisher-weixin publish-status <publish_id>

opencli publisher-weixin publish-article "正文 HTML" \
  --title "标题" \
  --cover-image ./cover.jpg \
  --publish \
  --execute
```

Without `--execute`, write commands return a dry-run row and do not call remote write endpoints.

