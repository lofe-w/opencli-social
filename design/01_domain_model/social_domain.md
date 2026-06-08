# 社交平台运营领域模型

## 实体草图

| 实体 | 稳定字段 |
|---|---|
| Credential | platform, profile, app_id/account_id, display_name, scope, source |
| MediaAsset | platform, media_id/url, type, local_path, uploaded_at |
| Draft | platform, media_id/draft_id, title, created_at |
| PublishJob | platform, publish_id, draft_id, status, submitted_at |
| Post | platform, post_id/article_id, title, url, status, published_at |
| Comment | platform, comment_id, post_id, author_id, content, status, created_at |
| Reply | platform, reply_id, comment_id, content, created_at |
| MetricSnapshot | platform, subject_type, subject_id, metric, value, collected_at |

## 微信状态映射

微信公众号发布状态具有平台特异性。命令会同时暴露原始状态字段和规范化的 `status` 文本，让 Agent 能在不丢弃原始数据的情况下做决策。

## 能力域边界

Publishing 负责素材、草稿、提交发布和发布状态。Content Library 负责查询远端内容记录。Engagement 负责评论和回复等互动对象。Analytics 负责读取统计指标，不负责解释业务归因。

## 安全模型

远程写入默认使用 `--execute` 作为显式确认。创建、修改、删除、回复、提交审核或提交发布都属于写入。即使命令无法在本地完整校验远端约束，也可以支持 dry-run。

多账号使用 OpenCLI profile 作为用户可见的身份上下文。浏览器平台将 profile 映射到 Chrome 会话；官方 API 平台将 profile 映射到平台凭据、token cache 和发布主体。平台插件不得在写操作中猜测账号；输出应保留 `profile` 和脱敏账号标识用于审计。
