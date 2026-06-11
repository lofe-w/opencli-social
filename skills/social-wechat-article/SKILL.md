---
name: social-wechat-article
description: 使用 OpenCLI 的 social-wechat-article 插件安全编排微信公众号文章认证、诊断、素材上传、草稿创建、发布和状态查询。适用于 Agent 需要通过 `opencli social-wechat-article` 配置 AppID/AppSecret、创建草稿、发布文章或查询发布状态的场景。
---

# social-wechat-article

本 Skill 只规定 Agent 的安全编排策略。命令参数、字段和错误细节以 `opencli social-wechat-article --help`、子命令 `--help`、`-f json` 输出和插件 README 为准，不要把本 Skill 当作第二份命令手册。

## 安装和可用性

本 Skill 不会自动安装 CLI 插件，也不代表账号已经可用。先确认 OpenCLI、插件和 Skill 均可发现：

```bash
node --version
command -v opencli || npm install -g @jackwener/opencli@latest
opencli --version
opencli plugin list -f json
opencli list -f json | rg 'social-wechat-article'
npx -y skills@latest ls -g --json | rg 'social-wechat-article'
```

插件缺失时，安装对应 CLI 插件：

```bash
opencli plugin install github:lofe-w/opencli-social/social-wechat-article
```

Skill 缺失时，安装对应 Agent Skill：

```bash
npx -y skills@latest add lofe-w/opencli-social --skill social-wechat-article -y -g
```

安装完成只说明命令可发现。真正可发布前，必须完成 profile 凭据配置并通过 `doctor --check-token`。

## 默认姿态

- 使用 `-f json`，让后续判断基于稳定字段。
- 先发现和诊断，再写入：`plugin list` -> `doctor` -> `auth-status` -> 目标命令。
- 通过 `OPENCLI_PROFILE=<alias>` 或 `opencli profile use <alias>` 选择公众号 profile；当前本地官方 API 插件不要依赖 root `--profile` 传递。
- 不输出、不记录 AppSecret、access token、完整认证查询串或未脱敏响应。
- 写操作只有在用户明确要配置、上传、创建草稿、发布或清理时才加 `--execute`。探索、排查、预览默认 dry-run。
- `request` 是 escape hatch。优先使用高层命令；非 GET/HEAD raw 请求必须有用户明确授权并加 `--execute`。

## 认证流程

从只读状态开始：

```bash
OPENCLI_PROFILE=oa-a opencli social-wechat-article doctor -f json
OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-status -f json
```

配置 AppID/AppSecret 属于写入本地 profile secret。只在用户明确提供凭据并授权配置时执行：

```bash
printf '%s' "$APP_SECRET" | OPENCLI_PROFILE=oa-a opencli social-wechat-article auth-config \
  --app-id wx123 \
  --display-name "公众号A" \
  --app-secret-stdin \
  --execute \
  -f json
```

需要验证微信 token 和 IP 白名单时再运行：

```bash
OPENCLI_PROFILE=oa-a opencli social-wechat-article doctor --check-token -f json
```

如果 token 获取失败，先向用户说明可能是 AppID/AppSecret、账号权限或微信 API IP 白名单问题；不要猜测或打印 secret。

## 发布编排

当用户只要求准备或检查内容时，先跑 dry-run，不加 `--execute`：

```bash
OPENCLI_PROFILE=oa-a opencli social-wechat-article publish-article \
  --content-file article.html \
  --title "标题" \
  --cover-image cover.png \
  --upload-inline-images \
  --publish \
  --wait \
  -f json
```

只有用户明确要真实创建远端素材、草稿或发布时，才重复同一命令并加 `--execute`：

```bash
OPENCLI_PROFILE=oa-a opencli social-wechat-article publish-article \
  --content-file article.html \
  --title "标题" \
  --cover-image cover.png \
  --upload-inline-images \
  --publish \
  --wait \
  --execute \
  -f json
```

发布提交是异步任务。拿到 `publish_id` 后，用状态查询确认终态：

```bash
OPENCLI_PROFILE=oa-a opencli social-wechat-article publish-status <publish-id> --wait --fail-on-failure -f json
```

把最终 `article_url`、`publish_id`、失败状态和账号脱敏字段转述给用户。微信返回原创失败、审核拒绝、删除、封禁等终态时，不要伪装成功。

## 失败和恢复

- 参数、本地文件、图片格式、HTML 内容校验失败时，修正输入后重试；这些失败应发生在远端写入前。
- 远端 API 失败时，读取类型化错误和 JSON 字段，优先建议 `doctor --check-token`、账号权限检查或微信后台配置检查。
- 如果已经创建了草稿或提交了发布任务，不要重复提交同一内容来“试一下”。先用 `publish-status` 或远端 ID 反查。
- `profile-clear --execute` 会清理当前 profile 配置；只有用户明确要求重置账号配置时才运行。
