# 微信视频号

`social-weixin-channels` 面向视频号助手的内容发布流程。与公众号 `social-wechat-article` 不同，视频号发布目前没有可用的公开官方内容发布 API，因此本插件以 OpenCLI 浏览器会话驱动 `channels.weixin.qq.com` 网页端。

## 目标

第 2 阶段先覆盖视频发布闭环：

- 诊断 OpenCLI 浏览器 profile、视频号助手登录态和页面可达性
- 预检视频、封面、描述、话题、定时发布时间等本地输入
- 上传视频并等待页面处理完成
- 创建草稿或提交发表
- 在需要扫码、手机确认、风控处理或最终人工确认时，向 Agent 返回可恢复的 Human in the loop 状态
- 通过发布列表或页面状态查询草稿、定时、审核中、已发表和失败状态

暂不把视频号直播、商品橱窗、评论、数据分析作为首版目标。

## 实现边界

### OpenCLI 负责

- Chrome profile 选择：`--profile`、`OPENCLI_PROFILE`、`opencli profile use <alias>`
- 连接用户已登录的 Chrome/Browser Bridge
- 浏览器 session 和 adapter tab 生命周期
- 页面 cookie、HttpOnly cookie 和同源浏览器请求上下文
- 文件上传能力，例如 `IPage.uploadFiles` 或 `IPage.setFileInput`
- 截图、网络捕获、trace artifact 和敏感字段 redaction

视频号插件不得另建 cookie 仓库，也不应导出、复制或持久化完整 cookie/storage state。

### 插件负责

- 识别视频号助手是否已登录
- 识别当前视频号身份，避免多账号场景下误发
- 在页面需要人工动作时返回 `needs_human`
- 管理发布 job 的阶段、断点、输入摘要和恢复命令
- 校验本地输入并在远端写入前失败
- 驱动视频号助手表单、上传控件、草稿保存和发表按钮
- 将平台提示映射为稳定 CLI 状态和类型化错误

插件可以保存 job metadata，但不得保存 cookie、token、完整请求头或未脱敏的私密响应体。

## Human in the loop 协议

HITL 是视频号插件的一等状态，不是异常。命令遇到必须人工介入的步骤时，应返回结构化行并退出，让 Agent 通知用户；用户完成动作后，Agent 通过 `resume_command` 继续。

`--hitl=interrupt` 遇到人工断点时应以成功退出码返回 `needs_human` 行，因为这表示流程被有意暂停，而不是命令失败。`--hitl=fail` 才把同一场景转换为非零退出，供 CI 或无人值守环境使用。

稳定输出字段：

| 字段 | 含义 |
|---|---|
| `status` | `needs_human` |
| `reason` | 机器可读原因，例如 `login_required`、`mobile_confirm_required`、`account_select_required`、`final_publish_approval_required`、`captcha_required` |
| `human_action` | 用户需要做的动作，例如 `login_in_opencli_chrome_profile`、`confirm_on_wechat_mobile`、`select_channels_account` |
| `job_id` | 可恢复发布任务 ID |
| `hitl_id` | 本次人工断点 ID |
| `profile` | OpenCLI profile alias 或 context id；未知时为空 |
| `url` | 用户应打开或当前所在的视频号助手 URL |
| `message` | 给人看的简短说明 |
| `screenshot_path` | 可选诊断截图 |
| `resume_command` | Agent 可直接执行的恢复命令 |
| `expires_at` | 人工断点过期时间；不可确认时为空 |

示例：

```json
{
  "status": "needs_human",
  "reason": "login_required",
  "human_action": "login_in_opencli_chrome_profile",
  "job_id": "job_20260605_abc123",
  "hitl_id": "hitl_20260605_def456",
  "profile": "work",
  "url": "https://channels.weixin.qq.com/platform/post/create",
  "message": "请在 OpenCLI 连接的 Chrome profile 中完成微信扫码登录视频号助手。",
  "screenshot_path": "~/.opencli-social/channels/jobs/job_20260605_abc123/login.png",
  "resume_command": "opencli --profile work social-weixin-channels jobs-resume job_20260605_abc123 --execute -f json",
  "expires_at": "2026-06-05T12:34:56+08:00"
}
```

`--hitl` 控制策略：

| 模式 | 行为 |
|---|---|
| `interrupt` | 默认。返回 `needs_human` 并退出，适合 Agent |
| `wait` | 在命令内等待人工完成，适合人直接操作 CLI |
| `fail` | 一旦需要人工介入即失败，适合 CI |

## Job 状态机

长流程发布必须有本地 job store。默认目录：

```text
~/.opencli-social/channels/jobs/<job-id>.json
```

建议状态：

| 状态 | 含义 | 可恢复 |
|---|---|---|
| `prepared` | 输入已预检，尚未访问页面 | 是 |
| `auth_required` | 需要登录或手机确认 | 是 |
| `account_required` | 需要确认/选择视频号身份 | 是 |
| `uploading` | 正在上传视频 | 谨慎恢复，先探测页面 |
| `uploaded` | 视频已上传且页面处理完成 | 是 |
| `draft_created` | 已保存草稿 | 是 |
| `awaiting_final_approval` | 发表前等待人工批准 | 是 |
| `submitted` | 已点击发表，等待平台审核或发布结果 | 是 |
| `scheduled` | 已定时发表 | 是 |
| `published` | 已发表 | 终态 |
| `failed` | 明确失败 | 终态 |
| `unknown` | 页面或网络结果不确定 | 需要人工或诊断 |
| `cancelled` | 本地任务取消 | 终态 |

job metadata 应包含：

- `job_id`
- `created_at`、`updated_at`
- `profile`
- `stage`
- 输入文件路径、大小、mtime、sha256
- 标题/描述摘要，不保存完整敏感内容时可保存 hash 和来源路径
- 定时发布时间、话题、合集、原创声明等规范化字段
- 当前页面 URL
- 最近截图和 trace 路径
- 远端可观察 ID 或列表反查线索
- `next_command`

恢复命令必须先读取 job，再探测页面实际状态，不能盲目重放点击。

### Job store 约束

job 文件必须可版本化、可审计、可原子更新：

- `schema_version` 必须写入，首版为 `1`
- 每次状态迁移写入 `events[]` 审计记录，包含 `at`、`from_stage`、`to_stage`、`actor`、`reason`
- 写入 job 文件使用临时文件加 rename，避免进程中断留下半截 JSON
- 同一 `job_id` 恢复时必须加本地锁，例如 `<job-id>.lock`，防止两个 Agent 同时恢复并重复点击
- 同一 OpenCLI profile 默认只允许一个 `uploading`、`awaiting_final_approval` 或 `submitted` 中的发布 job；需要并发时必须显式传入覆盖参数
- `jobs-resume` 必须检查 `schema_version`，遇到未来版本时拒绝恢复并提示升级插件
- `jobs-resume` 必须检查 `last_action_id` 或等价幂等标记，避免恢复时重复执行已经成功的页面动作

建议 job 结构：

```json
{
  "schema_version": 1,
  "job_id": "job_20260605_abc123",
  "stage": "awaiting_final_approval",
  "profile": "work",
  "site": "social-weixin-channels",
  "created_at": "2026-06-05T10:00:00+08:00",
  "updated_at": "2026-06-05T10:12:00+08:00",
  "input": {
    "video": {
      "path": "/abs/a.mp4",
      "sha256": "redacted-example",
      "size_bytes": 12345678,
      "mtime_ms": 1780634400000
    },
    "description_source": "/abs/desc.md",
    "description_sha256": "redacted-example",
    "cover": null,
    "schedule_at": "",
    "tags": ["OpenCLI"]
  },
  "account": {
    "status": "single_account",
    "display_name": "示例视频号",
    "masked_id": ""
  },
  "page": {
    "url": "https://channels.weixin.qq.com/platform/post/create",
    "last_screenshot_path": "/abs/jobs/job_20260605_abc123/final-approval.png",
    "last_trace_path": ""
  },
  "remote": {
    "post_id": "",
    "post_url": "",
    "observable_key": "title+created_at"
  },
  "next_command": "opencli --profile work social-weixin-channels jobs-resume job_20260605_abc123 --execute -f json",
  "events": []
}
```

## 命令设计

命令文件仍按 OpenCLI 插件规则平铺在包根目录。首版包建议为：

```text
packages/social-weixin-channels/
  doctor.js
  auth-status.js
  auth-begin.js
  accounts-list.js
  account-current.js
  account-resolve.js
  video-preflight.js
  publish-video.js
  jobs-get.js
  jobs-resume.js
  jobs-cancel.js
  posts-list.js
  request.js
  lib/
    channels/
      page.js
      publishing.js
      validation.js
      jobs.js
      hitl.js
```

命名空间：`social-weixin-channels`。

### 命令地图

| 命令 | 访问级别 | Strategy | Browser | Site session | 用途 |
|---|---|---|---|---|---|
| `doctor` | read | UI | true | ephemeral | 诊断 OpenCLI profile、视频号助手可达性和登录状态；未登录不失败 |
| `auth-status` | read | UI | true | ephemeral | 读取当前登录态和页面登录/扫码状态 |
| `auth-begin` | write | UI | true | persistent | 打开视频号助手登录页，返回 HITL 登录指令 |
| `accounts-list` | read | UI | true | ephemeral | 列出当前登录态可识别的视频号发布主体 |
| `account-current` | read | UI | true | ephemeral | 读取当前页面选中的视频号发布主体 |
| `account-resolve` | read | UI | true | ephemeral | 将 `--account-name` 或页面显示名解析为稳定匹配结果 |
| `video-preflight` | read | LOCAL | false | n/a | 本地校验视频、封面、描述、定时和首版范围字段 |
| `publish-video` | write | UI | true | persistent | 创建可恢复 job，上传视频，保存草稿或提交发表 |
| `jobs-get` | read | LOCAL | false | n/a | 读取本地 job metadata 和下一步命令 |
| `jobs-resume` | write | UI | true | persistent | 从本地 job 断点恢复，继续页面流程 |
| `jobs-cancel` | write | LOCAL | false | n/a | 取消本地 job；不删除远端草稿或内容 |
| `posts-list` | read | UI | true | ephemeral | 从视频号助手管理页读取最近内容，用于状态反查 |
| `request` | write | UI | true | ephemeral | browser-context raw escape hatch；非 GET/HEAD 必须 `--execute` |

所有 UI 命令设置 `domain: 'channels.weixin.qq.com'`。需要连续操作同一页面的命令使用 `siteSession: 'persistent'`；只读探测默认 ephemeral，避免污染后续发布流程。

## JSON 输出约定

OpenCLI 使用 `-f json` 输出行对象数组。视频号命令必须把机器决策需要的字段放在顶层，详细页面证据放入 `detail` JSON 字符串或 artifact 路径。

所有成功行至少包含：

| 字段 | 含义 |
|---|---|
| `status` | 稳定状态，例如 `ok`、`logged_out`、`needs_human`、`draft_created`、`submitted`、`published`、`unknown_result` |
| `command` | 规范命令名，例如 `publish-video` |
| `job_id` | 与发布流程相关时必填，否则为空 |
| `account_status` | `unknown`、`logged_out`、`single_account`、`multiple_accounts`、`needs_selection` |
| `account_name` | 当前识别的账号显示名；无法确认时为空 |
| `url` | 当前或目标页面 URL |
| `detail` | JSON 字符串，保存脱敏的补充信息 |

HITL 行使用 `status=needs_human`，并额外包含 `reason`、`human_action`、`hitl_id`、`resume_command`、`expires_at`。

发布行示例：

```json
{
  "status": "draft_created",
  "command": "publish-video",
  "job_id": "job_20260605_abc123",
  "account_status": "single_account",
  "account_name": "示例视频号",
  "post_id": "",
  "post_url": "",
  "url": "https://channels.weixin.qq.com/platform/post/list",
  "detail": "{\"video_sha256\":\"redacted-example\",\"stage\":\"draft_created\"}"
}
```

错误输出使用 OpenCLI 的类型化错误机制，不在普通结果行里伪造失败。预期平台失败应使用 `ArgumentError` 或 `CommandExecutionError`，错误信息不得包含 cookie、token、完整请求头、二维码原始认证 URL、私密响应体。`unknown_result` 是例外：当远端结果不确定且重复提交有风险时，命令可以返回 `status=unknown_result` 的成功行，要求 Agent 先执行 `posts-list` 或人工检查，而不是自动重试。

`request` 的 JSON 输出遵守“CLI envelope + redacted response”：

- 顶层包含 `status`、`method`、`path`、`http_status`、`request_id`
- 响应体默认截断并脱敏；需要完整保存时只写入 artifact 文件并返回路径
- `GET`、`HEAD` 可直接执行；`POST`、`PUT`、`PATCH`、`DELETE` 必须传 `--execute`

### Account

```bash
opencli social-weixin-channels doctor -f json
opencli social-weixin-channels auth-status -f json
opencli social-weixin-channels auth-begin --execute -f json
opencli social-weixin-channels accounts-list -f json
opencli social-weixin-channels account-current -f json
opencli social-weixin-channels account-resolve --account-name "示例视频号" -f json
```

`doctor` 是 read 命令，不应因未登录崩溃；它应报告浏览器 profile、视频号助手可达性、是否看到登录页、是否看到发布入口。

`auth-begin` 是 write-like browser command，因为它会打开登录页并可能改变浏览器态；必须 `--execute`。实际 cookie 由 OpenCLI/Chrome profile 保存。

`accounts-list`、`account-current` 和 `account-resolve` 只解决视频号助手页面内的发布主体识别；Chrome profile 和 cookie 仍由 OpenCLI 管理。写命令发现多个发布主体或当前主体与 `--account-name` 不一致时，必须返回 `needs_human/account_select_required` 或抛出 `account_mismatch`，不得猜测目标账号。

### Publishing

```bash
opencli social-weixin-channels video-preflight --video ./a.mp4 --description-file ./desc.md -f json
opencli social-weixin-channels publish-video --video ./a.mp4 --description-file ./desc.md --execute -f json
opencli social-weixin-channels publish-video --video ./a.mp4 --description-file ./desc.md --schedule-at "2026-06-05T20:00:00+08:00" --execute -f json
```

`video-preflight` 只做本地校验，不访问远端。`publish-video` 是组合命令，必须保留中间状态和 `job_id`。默认可先保存草稿；直接发表需要显式参数，例如 `--publish-now`。

首版字段：

| 字段 | 说明 |
|---|---|
| `--video` | 本地视频文件 |
| `--description` / `--description-file` | 视频描述，二选一 |
| `--cover` | 可选本地封面 |
| `--tags` | 逗号分隔话题，或后续改为重复参数 |
| `--short-title` | 可选短标题 |
| `--schedule-at` | ISO 8601 定时发布时间 |
| `--original` | 是否声明原创 |
| `--final-approval` | `required`、`skip`；默认 `required` |
| `--hitl` | `interrupt`、`wait`、`fail` |
| `--account-name` | 期望发布主体显示名；传入后必须与页面识别结果匹配 |
| `--timeout` | 页面等待上限 |
| `--execute` | 远端写入确认 |

### Jobs

```bash
opencli social-weixin-channels jobs-get <job-id> -f json
opencli social-weixin-channels jobs-resume <job-id> --execute -f json
opencli social-weixin-channels jobs-cancel <job-id> --execute -f json
```

`jobs-resume` 必须检查：

- 输入文件仍存在且 hash 未变，除非用户显式允许
- 当前 profile 与 job profile 一致，或用户显式覆盖
- 页面实际状态与 job stage 可对齐
- 若上次状态为 `submitted`，优先查询发布列表，不重复提交

### Content Library

```bash
opencli social-weixin-channels posts-list --limit 20 -f json
```

首版用于发布后反查状态和 ID。返回字段至少包含 `status`、`title`、`publish_time`、`post_url`、`raw_status`、`detail`。

### Escape Hatch

```bash
opencli social-weixin-channels request get /cgi-bin/mmfinderassistant-bin/online_heartbeat -f json
opencli social-weixin-channels request post /some/path --body '{}' --execute -f json
```

`request` 只允许访问 `channels.weixin.qq.com` 同源或明确 allowlist 的视频号助手路径，并使用当前 OpenCLI 浏览器上下文。它用于诊断和填补尚未建模的只读能力，不应替代高层发布命令。非 GET/HEAD 请求必须 `--execute`，且实现前需要补充脱敏 endpoint notes。

## 页面流程

已知入口：

- 登录/首页：`https://channels.weixin.qq.com`
- 发布页：`https://channels.weixin.qq.com/platform/post/create`
- 管理页：`https://channels.weixin.qq.com/platform/post/list`

首版页面锚点：

- 登录：扫码登录、二维码过期、已扫码、手机端确认
- 发布入口：发表视频、保存草稿、发表
- 上传：`input[type="file"]`
- 表单：视频描述、短标题、封面、添加到合集、位置、活动、扩展链接
- 发布方式：不定时、定时发表、请选择发表时间
- 原创相关：声明原创、原创类型、内容声明

不要把截图当作 API 证据；截图只用于 UI 词汇和诊断。若未来使用私有接口，必须先形成脱敏 endpoint notes，记录 method/path、认证机制、CSRF/指纹要求、请求体、响应 ID、错误和分页，并且 raw 写操作必须受 `--execute` 保护。

## 账号和多账号

多 Chrome profile 由 OpenCLI 解决。插件只在视频号助手页面内识别当前视频号身份：

- `doctor` 和 `auth-status` 应输出 `account_status`：`unknown`、`logged_out`、`single_account`、`multiple_accounts`、`needs_selection`
- 如果页面展示多个视频号身份，写操作必须进入 `needs_human`，或要求 `--account-name` / `--account-id` 与页面识别结果匹配
- `publish-video` 输出中要保留实际识别到的账号名称或脱敏 ID，便于审计

首版不要求解决跨 Chrome profile 的账号管理；那是 OpenCLI profile 的职责。首版只要求在当前 profile 和当前视频号助手页面内避免误发。

## 安全和写入保护

- 所有会打开登录页、保存草稿、上传视频、发表、取消或修改远端状态的命令声明 `access: 'write'`
- 所有远端写操作必须要求 `--execute`
- dry-run 必须执行本地校验，并报告将要访问的页面和将要执行的阶段
- JSON 输出不得包含 cookie、token、完整请求头、二维码原始认证 URL、私密响应体
- 诊断 trace 必须依赖 OpenCLI redaction；插件自有 job metadata 也要避免写入敏感字段
- 最终发表默认需要 HITL，除非用户明确传入跳过人工确认的参数

## 错误模型

预期错误应类型化：

| 状态或错误 | 场景 |
|---|---|
| `needs_human/login_required` | 未登录或登录态失效 |
| `needs_human/mobile_confirm_required` | 已扫码但需要手机确认 |
| `needs_human/account_select_required` | 多视频号身份或身份不明确 |
| `needs_human/final_publish_approval_required` | 发表前等待确认 |
| `needs_human/captcha_required` | 验证码或风控 |
| `invalid_input` | 本地文件、描述、定时字段不合法 |
| `upload_failed` | 文件上传失败 |
| `processing_timeout` | 上传后平台处理超时 |
| `ui_changed` | 找不到稳定页面锚点 |
| `unknown_result` | 点击后无法确认是否成功 |

`unknown_result` 不能自动重试提交。应输出截图、trace 和建议的 `posts-list` 或人工检查命令。

## 验证策略

- validation 单元测试：文件存在、扩展名、大小、描述二选一、定时格式和最小提前时间
- job store 单元测试：创建、更新、恢复、取消、hash 变化检测、敏感字段不落盘
- HITL 输出测试：`needs_human` 行字段稳定，`resume_command` 可执行
- JSON 契约测试：每个命令的 `-f json` 输出包含设计要求的顶层字段，错误不泄露敏感字段
- account 识别 fixture 测试：未登录、单账号、多账号、当前账号不匹配
- job 并发测试：锁存在时拒绝第二个 `jobs-resume`，未来 `schema_version` 拒绝恢复
- 页面 helper fixture 测试：用静态 HTML 覆盖登录页、上传页、错误弹窗和发布成功状态
- 从 `/tmp` 运行安装后的 `doctor`、`video-preflight`，确认不依赖仓库当前目录
- live 测试只做登录态诊断和草稿保存；真实发表必须单独人工确认

## 首版范围决策

| 能力 | 首版决策 | 说明 |
|---|---|---|
| 视频发布 | 支持 | 核心路径：预检、上传、保存草稿、可选发表 |
| 直接发表 | 支持但需显式参数 | `--publish-now` 加 `--execute`，默认仍要求 final approval HITL |
| 保存草稿 | 支持 | 作为最安全的首个 live write 验证路径 |
| 定时发表 | 支持基础 ISO 时间 | 若页面校验不稳定，返回 `needs_human` |
| 封面上传/裁剪 | 支持基础封面上传；复杂裁剪可 HITL | 首版不承诺高级裁剪自动化 |
| 话题 tags | 支持基础输入 | 页面填写失败必须在远端写入前报错 |
| 原创声明 | 默认不自动处理 | 用户传 `--original` 时可尝试；遇到原创类型/协议/内容声明弹窗进入 HITL |
| 内容声明 | 不自动选择 | 出现时进入 HITL |
| 合集、位置、活动、扩展链接 | 范围外 | 首版如传入相关字段应本地拒绝，后续单独建模 |
| 商品橱窗、直播、数据分析 | 范围外 | 后续能力域 |
| 私有接口发布 | 范围外 | 只允许诊断型 `request`，不得替代高层 UI 发布命令 |
| 跨 profile 账号管理 | 范围外 | 由 OpenCLI profile 解决 |

## Companion Skill

实现完成并通过 smoke test 后，应创建 `social-weixin-channels` companion skill，指导未来 Agent：

- 第一条命令运行 `opencli social-weixin-channels doctor -f json`
- 使用 `accounts-list` / `account-current` 确认发布主体
- 默认创建草稿，不直接发表
- 遇到 `status=needs_human` 时把 `message`、`url`、`screenshot_path` 告知用户，然后执行 `resume_command`
- 不在 `unknown_result` 后自动重试提交
- 不使用 `request` 执行未明确批准的非 GET/HEAD 写请求

## 开放问题

- 视频号助手是否稳定返回可用于反查的 post ID，还是只能通过管理页标题/时间匹配
- 封面上传、裁剪和视频处理完成状态的最稳定 DOM/网络信号是什么
- 定时发表最小提前时间以页面提示还是平台接口错误为准
- 原创声明、内容声明、活动、扩展链接是否纳入首版，还是作为后续 issue
- 是否需要为 `social-weixin-channels` 写 companion skill，指导未来 Agent 处理 HITL 和恢复命令
