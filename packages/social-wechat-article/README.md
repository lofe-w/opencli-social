# social-wechat-article

用于微信公众号运营的 OpenCLI 插件。当前覆盖文章发布链路，后续扩展评论、已发布内容和数据查询能力。

## Install

```bash
command -v opencli || npm install -g @jackwener/opencli@latest
opencli plugin install github:lofe-w/opencli-social/social-wechat-article
opencli plugin list -f json
opencli list -f json | rg 'social-wechat-article'
```

If OpenCLI prints `esbuild not found` during installation, verify the command
list before treating it as a failure. This package ships ESM JavaScript files and
does not require TypeScript transpilation.

Companion Agent Skill:

```bash
npx -y skills@latest add lofe-w/opencli-social --skill social-wechat-article -y -g
npx -y skills@latest ls -g --json | rg 'social-wechat-article'
```

Installation only verifies that the command and skill can be discovered. Before
the plugin can access a WeChat Official Account, configure a profile and verify
token access as described below.

## AI Agent setup

Agents should run setup in this order:

```bash
OPENCLI_PROFILE=oa-a opencli social-wechat-article doctor -f json
OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-status -f json
```

If the profile is missing credentials, ask the user for the target profile alias,
AppID, display name, and a safe way to provide AppSecret. Do not ask the user to
paste AppSecret into chat. Prefer stdin from an environment variable:

```bash
printf '%s' "$WECHAT_APP_SECRET" | OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-config \
  --app-id "$WECHAT_APP_ID" \
  --display-name "公众号A" \
  --app-secret-stdin \
  --execute \
  -f json
```

Then verify ready state:

```bash
OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-status -f json
OPENCLI_PROFILE=oa-a opencli social-wechat-article doctor --check-token -f json
```

`missing_auth` means the plugin is installed but the selected OpenCLI profile has
not been configured. Token verification can also fail if the current machine or
server outbound IP is not in the WeChat Official Account API IP whitelist.

## OpenCLI profile 认证

`social-wechat-article` 的账号只通过 OpenCLI profile 选择。每个 profile 拥有独立的公众号 `AppID`、`AppSecret`、access token cache 和审计输出；命令不读取旧式全局公众号凭据环境变量。

当前 OpenCLI 版本的 root `--profile` 只会传递给 Browser Bridge 命令；`social-wechat-article` 是本地官方 API 命令，因此请使用 `OPENCLI_PROFILE=oa-a opencli ...` 或先运行 `opencli profile use oa-a` 来选择 profile。设计目标是未来 OpenCLI 将 root `--profile` 也传递给本地插件命令。

先按微信官方文档获取公众号凭据并配置 API IP 白名单：

1. 登录 [微信开发者平台](https://developers.weixin.qq.com/platform/)。
2. 使用微信扫码登录后，进入 `我的业务 - 公众号/服务号`，点击对应公众号进入详情页。
3. 在详情页查看 `AppID` 和 `AppSecret` 信息。具体以官方文档 [如何查看和重置 AppSecret](https://developers.weixin.qq.com/doc/oplatform/developers/dev/appid.html) 为准。
4. 如果已经忘记 `AppSecret`，通过 `重置` 重新生成并妥善保存。微信官方说明平台不会储存和显示 `AppSecret`；重置后旧 `AppSecret` 会失效，需要同步更新所有使用它的系统。
5. 继续进入 `基础信息 - 开发信息`，在 `API IP白名单` 中添加运行 `opencli social-wechat-article` 的机器或服务器出口公网 IP。配置规则以官方文档 [API IP 白名单](https://developers.weixin.qq.com/doc/oplatform/developers/basic_func/ip_whitelist.html) 为准。

使用 AppID/AppSecret 获取 access token 时，微信会校验 API IP 白名单。如果本地网络、办公出口或部署服务器 IP 变化，需要同步更新白名单。

```bash
printf '%s' '你的 AppSecret' | OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-config \
  --app-id wx123 \
  --display-name "公众号A" \
  --app-secret-stdin \
  --execute

OPENCLI_PROFILE=oa-a opencli social-wechat-article doctor --check-token -f json
```

配置会写入当前用户的 OpenCLI Social profile 目录：

- `~/.opencli-social/profiles/<profile>/social-wechat-article/config.json`
- `~/.opencli-social/profiles/<profile>/social-wechat-article/app-secret`
- `~/.opencli-social/profiles/<profile>/social-wechat-article/token.json`

`app-secret` 文件使用本地 profile 级 secret 文件保存，命令输出只显示 `account_id_masked`，不会打印 AppSecret 或 access token。

## 命令

```bash
OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-config --app-id wx123 --display-name "公众号A" --app-secret-stdin --execute
OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-status -f json
OPENCLI_PROFILE=oa-a opencli social-wechat-article profile-clear --execute

OPENCLI_PROFILE=oa-a opencli social-wechat-article doctor
OPENCLI_PROFILE=oa-a opencli social-wechat-article doctor --check-token

OPENCLI_PROFILE=oa-a opencli social-wechat-article auth
OPENCLI_PROFILE=oa-a opencli social-wechat-article auth --no-cache
OPENCLI_PROFILE=oa-a opencli social-wechat-article auth --force-refresh
OPENCLI_PROFILE=oa-a opencli social-wechat-article auth --legacy-token

OPENCLI_PROFILE=oa-a opencli social-wechat-article upload-image ./cover.jpg --execute
OPENCLI_PROFILE=oa-a opencli social-wechat-article upload-content-image ./inline.jpg --execute

OPENCLI_PROFILE=oa-a opencli social-wechat-article draft-add "正文 HTML" \
  --title "标题" \
  --cover-image ./cover.jpg \
  --upload-inline-images \
  --digest "摘要" \
  --execute

OPENCLI_PROFILE=oa-a opencli social-wechat-article publish <draft_media_id> --execute
OPENCLI_PROFILE=oa-a opencli social-wechat-article publish <draft_media_id> --wait --execute
OPENCLI_PROFILE=oa-a opencli social-wechat-article publish-status <publish_id>
OPENCLI_PROFILE=oa-a opencli social-wechat-article publish-status <publish_id> --wait
OPENCLI_PROFILE=oa-a opencli social-wechat-article publish-status <publish_id> --wait --fail-on-failure

OPENCLI_PROFILE=oa-a opencli social-wechat-article publish-article "正文 HTML" \
  --title "标题" \
  --cover-image ./cover.jpg \
  --upload-inline-images \
  --publish \
  --wait \
  --execute

OPENCLI_PROFILE=oa-a opencli social-wechat-article request get /cgi-bin/get_api_domain
OPENCLI_PROFILE=oa-a opencli social-wechat-article request post /cgi-bin/freepublish/get \
  --body '{"publish_id":"publish_id"}' \
  --execute
```

不传 `--execute` 时，写命令会返回 dry-run 输出行，并且不会调用远程写入端点。

`publish` 和 `publish-article --publish` 会提交一个异步微信发布任务。已提交任务不等于文章已经发布。使用 `--wait` 或 `publish-status --wait` 获取最终状态和文章 URL。如果微信报告原创失败、审核拒绝等终态发布失败，带等待的发布命令会以非零状态退出。`publish-status --wait` 默认只做观察；如果它也应在微信终态失败时非零退出，请添加 `--fail-on-failure`。

`auth` 默认使用微信 stable access-token 端点。`--force-refresh` 会强制刷新 stable token，应谨慎使用；`--legacy-token` 会回退到较旧的 `/cgi-bin/token` 端点。

`doctor` 是推荐的第一条诊断命令。未选择或未配置 profile 时，它会返回 `missing_auth` 而不是失败，并只输出 `profile`、`account_id_masked`、`app_id_present`、`app_secret_present` 等状态，不打印 token。需要实际验证 token 获取时，再加 `--check-token`。

`request` 是 raw escape hatch，会复用当前认证配置并自动附加 `access_token`。`GET` 和 `HEAD` 可直接执行；`POST`、`PUT`、`PATCH`、`DELETE` 必须加 `--execute`。它主要用于官方 API 新端点的只读探测或修复，不应替代高层发布命令。

## JSON 输出约定

OpenCLI 支持 `-f json`，例如：

```bash
opencli social-wechat-article doctor -f json
opencli social-wechat-article publish-status <publish_id> -f json
```

命令返回稳定的行对象数组。高层命令会把 `profile`、`account_name`、`account_id_masked` 和关键远端 ID 放在顶层字段，例如 `media_id`、`draft_media_id`、`publish_id`、`article_id` 和 `article_url`。`detail`、`checks`、`raw` 和 `response` 字段是 JSON 字符串，供需要完整上下文的 agent 二次解析。错误通过 OpenCLI 的命令错误机制返回，输出不得包含 access token、app secret 或完整认证查询串。

## 校验

- 封面图片会作为永久图片素材上传。支持格式：bmp/gif/jpg/jpeg/png，最大 10 MiB。
- 文章内容可以通过位置参数 HTML 或 `--content-file` 传入，但不能两者同时传入。
- 文章内联图片必须使用微信图片 URL。可使用 `--upload-inline-images` 自动上传本地 HTML 图片路径，也可以用 `upload-content-image` 逐张上传图片并引用返回的 URL。支持格式：jpg/jpeg/png，大小小于 1 MiB。
- 文章草稿会在远程提交前按微信字段限制进行本地检查。
- `draft-add --execute` 和 `publish-article --execute` 会在获取 token 或上传媒体前执行本地预检，因此无效文章输入不会留下远程素材。
- 发布状态值会规范化为 `published`、`publishing`、`originality_failed`、`failed`、`review_rejected`、`deleted_after_publish` 或 `banned_after_publish`。

## 真实发布检查清单

```bash
printf '%s' '你的 AppSecret' | OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-config \
  --app-id wxf8bdb853b23f503a \
  --display-name "公众号A" \
  --app-secret-stdin \
  --execute
OPENCLI_PROFILE=oa-a opencli social-wechat-article auth
```

使用 AppID/AppSecret 时，当前机器或网络 IP 必须在微信公众号 API IP 白名单内。发布 API 还要求账号具备相应资格和所需 API 权限。

真实测试前先生成本地示例素材：

```bash
npm run prepare:wechat-article-live-sample
```

然后发布并等待最终文章 URL：

```bash
npm run publish:wechat-article-live-sample
```

对同一份已准备好的示例执行 dry-run，避免远程写入：

```bash
npm run publish:wechat-article-live-sample -- --dry-run
```

该脚本等价于运行以下真实发布命令：

```bash
OPENCLI_PROFILE=oa-a opencli social-wechat-article publish-article \
  --content-file tmp/wechat-article-live/article.html \
  --title "OpenCLI 微信发布测试" \
  --cover-image tmp/wechat-article-live/cover.png \
  --upload-inline-images \
  --publish \
  --wait \
  --execute
```
