# 微信公众号

`social-weixin` 使用微信官方 API 端点，而不是浏览器自动化。

## 认证

插件接受以下配置：

- `SOCIAL_WEIXIN_ACCESS_TOKEN`，用于外部托管的 token
- `SOCIAL_WEIXIN_APP_ID` 加 `SOCIAL_WEIXIN_APP_SECRET`

通过 appid/secret 获取的 access token 会缓存到 `~/.opencli-social/weixin-token.json`。

token 获取默认使用稳定版 access-token 端点。`auth --force-refresh` 会请求强制刷新 stable token，`auth --legacy-token` 会回退到较旧的 `/cgi-bin/token` 端点。

## 命令地图

| 命令 | 访问级别 | 用途 |
|---|---|---|
| `doctor` | read | 诊断认证、缓存和 API base 配置；可选验证 token 获取 |
| `auth` | read | 校验 token 获取 |
| `upload-image` | write | 上传用于文章封面的永久图片素材 |
| `upload-content-image` | write | 上传正文内联图片并返回 URL |
| `draft-add` | write | 创建单篇文章草稿 |
| `publish` | write | 提交草稿 media ID 进入发布流程 |
| `publish-status` | read | 查询 publish ID |
| `publish-article` | write | 创建草稿，并可选择提交发布 |
| `request` | write | raw API escape hatch；GET/HEAD 可直接执行，其他方法必须 `--execute` |

当前命令集中 Publishing 能力域已经可用。后续微信能力应继续放在同一个 `social-weixin` 命名空间下，例如已发布内容查询、评论管理和数据查询，而不是新增发布专用命名空间。

`publish` 和 `publish-article --publish` 只会提交一个异步微信发布任务。除非传入 `--wait`，否则它们返回 `submitted`。最终发布结果必须通过 `publish-status`、`publish-status --wait` 或带等待的发布命令确认。带等待的发布命令会把微信终态发布失败视为命令失败。除非传入 `--fail-on-failure`，否则 `publish-status --wait` 仍然只是观察性命令。

## 官方 API 端点

| 能力 | 端点 |
|---|---|
| stable access token | `/cgi-bin/stable_token` |
| legacy access token | `/cgi-bin/token` |
| 永久素材 | `/cgi-bin/material/add_material` |
| 内联图片 | `/cgi-bin/media/uploadimg` |
| 新增草稿 | `/cgi-bin/draft/add` |
| 提交发布 | `/cgi-bin/freepublish/submit` |
| 发布状态 | `/cgi-bin/freepublish/get` |

`request` 可以访问上表之外的官方 API 端点，但必须保持在配置的微信 API base 下，并复用已有 token 获取逻辑。由于它可能触发写入，命令本身声明 `access: 'write'`；非 GET/HEAD 方法还需要显式 `--execute`。

## 文章字段

支持的字段：

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

多图文草稿会留给后续命令处理，该命令将接受结构化 JSON 文件。

## 发布状态映射

| 微信 `publish_status` | CLI 状态 | 含义 |
|---|---|---|
| `0` | `published` | 发布成功 |
| `1` | `publishing` | 发布任务仍在运行 |
| `2` | `originality_failed` | 原创校验失败 |
| `3` | `failed` | 一般发布失败 |
| `4` | `review_rejected` | 平台审核未通过 |
| `5` | `deleted_after_publish` | 成功后所有文章被用户删除 |
| `6` | `banned_after_publish` | 成功后所有文章被系统封禁 |

## 本地校验

- 封面图片使用永久素材上传，格式必须为 bmp/gif/jpg/jpeg/png，大小不超过 10 MiB。
- 文章内容可以来自位置参数 HTML 或 `--content-file`；同时传入两者会被拒绝。
- 正文内联图片必须在创建草稿前通过 `/cgi-bin/media/uploadimg` 上传，格式必须为 jpg/jpeg/png，大小小于 1 MiB。
- `--upload-inline-images` 会在创建草稿前，将本地或 `file://` HTML 图片源重写为微信上传 URL。
- 如果文章 HTML 中包含外部非微信 `<img src>` 值，会在提交草稿前被拒绝，因为微信会过滤非 uploadimg 图片 URL。远程图片必须先下载到本地，或单独上传。
- 标题、作者、摘要、原文 URL、正文长度和封面裁剪字段会在远程写入调用前进行本地校验。
- 组合草稿/发布命令会在获取 token 或上传媒体前执行本地预检，因此无效文章输入不会留下远程素材副作用。
