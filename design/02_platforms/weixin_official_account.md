# WeChat Official Account

`publisher-weixin` uses official WeChat API endpoints instead of browser automation.

## Authentication

The plugin accepts:

- `PUBLISHER_WEIXIN_ACCESS_TOKEN` for externally managed tokens
- `PUBLISHER_WEIXIN_APP_ID` plus `PUBLISHER_WEIXIN_APP_SECRET`
- fallback aliases `WEIXIN_APPID`, `WEIXIN_APP_ID`, `WEIXIN_SECRET`, `WEIXIN_APP_SECRET`

Access tokens fetched through appid/secret are cached under `~/.opencli-publisher/weixin-token.json`.

## Command Map

| Command | Access | Purpose |
|---|---|---|
| `auth` | read | Validate token acquisition |
| `upload-image` | write | Upload permanent image material for article covers |
| `upload-content-image` | write | Upload inline content image and return URL |
| `draft-add` | write | Create one article draft |
| `publish` | write | Submit a draft media ID for publication |
| `publish-status` | read | Query a publish ID |
| `publish-article` | write | Create a draft and optionally submit it |

## Official API Endpoints

| Capability | Endpoint |
|---|---|
| access token | `/cgi-bin/token` |
| permanent material | `/cgi-bin/material/add_material` |
| inline image | `/cgi-bin/media/uploadimg` |
| add draft | `/cgi-bin/draft/add` |
| submit publish | `/cgi-bin/freepublish/submit` |
| publish status | `/cgi-bin/freepublish/get` |

## Article Fields

Supported fields:

- title
- author
- digest
- content
- content_source_url
- thumb_media_id or cover-image upload
- show_cover_pic
- need_open_comment
- only_fans_can_comment
- pic_crop_235_1
- pic_crop_1_1

Multi-article drafts are intentionally left for a later command that accepts a structured JSON file.

