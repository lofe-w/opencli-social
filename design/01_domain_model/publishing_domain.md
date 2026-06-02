# Publishing Domain Model

## Entity Sketch

| Entity | Stable fields |
|---|---|
| Credential | platform, app_id/account_id, scope, source |
| MediaAsset | platform, media_id/url, type, local_path, uploaded_at |
| Draft | platform, media_id/draft_id, title, created_at |
| PublishJob | platform, publish_id, draft_id, status, submitted_at |

## WeChat Status Mapping

WeChat Official Account publish status is platform-specific. Commands expose both raw status fields and normalized `status` text so agents can make decisions without discarding raw data.

## Safety Model

Remote writes use `--execute` by default. A command may support dry-run even if it cannot fully validate remote constraints locally.

