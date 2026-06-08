# Agentic 开发契约

本文件定义 OpenCLI Social 的项目级第一优先级开发规范。未来 Agent 在设计或实现任何平台能力、CLI 命令、命令契约、认证流程、发布流程或远端写操作前，必须先按本契约校准边界。

## 优先级

1. 先阅读 `design/domain.md`，理解平台插件、内容项、草稿、发布任务、互动和状态查询等领域语言。
2. 再阅读本文件，确认 Agentic 开发边界、HITL 协议、写入保护和恢复策略。
3. 然后阅读目标平台文档和最近的 `CLAUDE.md` 本地指南。
4. 如果平台文档、issue 或实现细节与本文件冲突，以本文件中的安全、会话、HITL、写入确认和恢复约束为准，并在修改中同步更新相关文档。

## OpenCLI 与插件职责边界

OpenCLI 负责用户可见的 profile 身份上下文，以及浏览器和会话基础设施：

- profile 选择和复用，例如 `--profile`、`OPENCLI_PROFILE` 和 `opencli profile use <alias>`。浏览器平台将 profile 映射到 Chrome 会话；官方 API 平台将 profile 映射到平台凭据和 token cache。
- Chrome profile、API profile 配置目录和当前 profile 的上下文传递。
- 浏览器 session、adapter tab 生命周期、同源请求上下文和文件上传能力。
- 页面 cookie、HttpOnly cookie、storage state、截图、trace artifact 和敏感字段 redaction。

插件负责平台动作和领域状态：

- 识别平台登录态和当前页面是否可继续自动执行。
- 识别平台内发布主体，避免多账号或多主体场景下误发。
- 在当前 OpenCLI profile 内解析平台凭据、发布主体和脱敏审计字段。
- 校验本地输入，并在任何远端写入前失败。
- 执行平台动作，例如上传、填表、保存草稿、提交发布、查询状态、回复评论。
- 将平台提示、页面状态和 API 错误映射为稳定 JSON 输出或类型化错误。
- 保存可恢复 job metadata，包括阶段、输入摘要、页面证据路径和下一步命令。

插件不得另建 cookie 仓库，不得导出、复制或持久化完整 cookie/storage state，不得保存 token、完整请求头、二维码原始认证 URL 或未脱敏私密响应体。允许保存的本地状态应限于可审计、可恢复、可脱敏的任务元数据。

## 写操作契约

所有会创建、修改、删除、回复、上传、保存草稿、提交审核、发布、取消或改变远端状态的命令都属于写操作。

写操作必须满足：

- 声明 `access: 'write'`。
- 要求显式 `--execute` 才能触发远端副作用。
- dry-run 只做本地校验和计划输出，不访问会改变状态的远端端点或页面动作。
- 在获取 token、上传素材、点击提交、保存草稿或发表前完成本地输入校验。
- 对预期平台错误使用显式、带类型的失败，例如 `ArgumentError` 或 `CommandExecutionError`。
- 输出远端 ID、job ID 或可反查线索，而不仅是自然语言状态。

平台提供官方 API 时优先使用官方 API。只有当平台没有所需能力的官方 API 时，才允许使用浏览器 UI 自动化。私有接口不得替代已建模的高层写命令；如确需探索，必须先形成脱敏 endpoint notes，并让非 GET/HEAD 请求受 `--execute` 保护。

## HITL 是一等状态

Human in the loop 是发布和账号流程的一等状态，不是异常。遇到扫码登录、手机确认、账号选择、风控验证码、复杂裁剪、内容声明或最终发表前确认时，命令必须用稳定协议让 Agent 接管人机协作。

HITL 输出必须包含：

- `status`: `needs_human`
- `reason`: 机器可读原因，例如 `login_required`、`mobile_confirm_required`、`account_select_required`、`final_publish_approval_required`、`captcha_required`
- `human_action`: 用户需要完成的动作
- `job_id`: 可恢复发布任务 ID
- `hitl_id`: 本次人工断点 ID
- `profile`: OpenCLI profile alias 或上下文 ID
- `url`: 用户应查看或当前所在页面
- `message`: 给人的简短说明
- `screenshot_path`: 可选诊断截图
- `resume_command`: Agent 可直接执行的恢复命令
- `expires_at`: 人工断点过期时间，未知时为空

命令应支持三种 HITL 策略：

| 模式 | 用途 | 行为 |
|---|---|---|
| `interrupt` | Agent 默认模式 | 返回 `needs_human` 成功行并退出；Agent 保持对话，用户完成后执行 `resume_command` |
| `wait` | 人直接运行 CLI | 命令内持续监控页面状态，直到人工动作完成、二维码失效、成功、失败或超时 |
| `fail` | CI 或无人值守 | 一旦需要人工介入即非零失败 |

Agent 调用发布命令时，应将 `needs_human` 的 `message`、`url`、`screenshot_path` 告知用户，并在用户完成动作后继续执行 `resume_command`。如果使用 `--hitl=wait`，CLI 本身负责轮询登录页、二维码、手机确认或页面状态，直到成功、失效或超时。

## 长流程发布任务

发布任务不是一次性脚本，而是可恢复 job。任何包含上传、草稿、审核、发布或人工断点的长流程命令，都必须建模为状态机。

推荐阶段：

| 阶段 | 含义 |
|---|---|
| `prepared` | 输入已预检，尚未访问远端 |
| `auth_required` | 需要登录、扫码或手机确认 |
| `account_required` | 需要确认或选择平台内发布主体 |
| `uploading` | 正在上传媒体 |
| `uploaded` | 媒体已上传且平台处理完成 |
| `draft_created` | 已保存远端草稿 |
| `awaiting_final_approval` | 发表前等待人工确认 |
| `submitted` | 已提交审核或发表，等待平台终态 |
| `scheduled` | 已定时发表 |
| `published` | 已发布 |
| `failed` | 明确失败 |
| `unknown` | 页面或远端结果不确定，需要诊断或人工确认 |
| `cancelled` | 本地任务取消 |

job store 必须：

- 写入 `schema_version`。
- 原子更新，使用临时文件加 rename。
- 记录 `events[]` 审计轨迹，包括时间、前后阶段、actor 和原因。
- 保存输入文件路径、大小、mtime、sha256、内容来源和脱敏摘要。
- 保存当前 profile、页面 URL、截图/trace 路径、远端可观察 ID 或反查线索。
- 保存 `next_command` 或等价恢复命令。
- 对同一 job 恢复加本地锁，防止重复点击。
- 检查未来 `schema_version` 并拒绝恢复。
- 使用 `last_action_id` 或等价幂等标记，避免重复执行已经成功的页面动作。

恢复命令必须先读取 job，再探测真实页面状态，确认页面、账号、输入和阶段能对齐后才继续。不得按本地阶段盲目重放点击。

## 账号和主体安全

OpenCLI profile 解决用户可见的身份上下文；浏览器平台用它选择会话，API 平台用它选择凭据和 token cache。插件解决平台内发布主体。写操作前必须确认当前主体安全：

- 当前 profile 与 job profile 一致，或用户显式覆盖。
- 页面显示的发布主体、或 API profile 配置的发布主体，与命令期望匹配。
- 页面展示多个主体、主体不明确或读取失败时，进入 `needs_human/account_select_required` 或抛出 `account_mismatch`。
- 输出实际识别到的账号名称或脱敏 ID，便于审计。

不要用默认页面主体、最近使用主体、第一个列表项或旧式全局凭据猜测发布目标。

## 未知结果和重试

远端写入后如果结果不可确认，例如页面跳转失败、网络中断、按钮点击后状态未知或平台没有返回稳定 ID，命令必须返回 `unknown_result` 或类型化错误，并提供截图、trace 和状态反查命令。

`unknown_result` 之后不得自动重试提交、发布、回复、删除等非幂等写操作。Agent 应先执行状态查询、内容列表反查或要求人工检查。

## Agent 可读输出

命令输出应服务 Agent 编排，而不是只服务人眼阅读。JSON 顶层字段必须稳定、紧凑、可决策：

- `status`
- `command`
- `job_id`
- `account_status`
- `account_name`
- `remote_id`、`post_id`、`publish_id` 或其他远端 ID
- `url`
- `reason`
- `resume_command`
- `detail`

详细页面证据、原始响应摘要和诊断信息应放入脱敏 artifact 或 `detail` JSON 字符串。错误输出使用 OpenCLI 类型化错误机制，不在普通结果行里伪造失败。

## 验证要求

涉及本契约的实现至少验证：

- dry-run 不产生远端副作用。
- 写命令缺少 `--execute` 时不会写入远端。
- 无效输入在远端写入前失败。
- `needs_human` 行字段稳定，`resume_command` 可执行。
- job store 可创建、更新、恢复、取消，并拒绝未来 schema。
- 敏感字段不会落盘或出现在 JSON 输出中。
- 多账号、多主体或主体不匹配时不会继续写操作。
- `unknown_result` 后不会自动重试非幂等写操作。

## Agent 执行清单

未来 Agent 开始功能开发时，按此清单自检：

1. 我是否先阅读了 `design/domain.md`、本文件、目标平台文档和最近的 `CLAUDE.md`？
2. 我是否正确区分了 OpenCLI 负责的会话层和插件负责的平台动作层？
3. 我是否避免保存 cookie、token、完整 header 和未脱敏私密响应？
4. 所有远端写操作是否声明 `access: 'write'` 并要求 `--execute`？
5. 失败是否在远端副作用前发生，而不是静默降级？
6. 需要人工介入时是否返回稳定 `needs_human`，而不是让命令卡死或崩溃？
7. 长流程是否有 job、状态机、锁、审计事件、恢复命令和幂等保护？
8. 多账号或主体不明确时是否停止并要求确认？
9. 结果不确定时是否先反查状态，而不是自动重试写入？
10. 新增 Markdown 是否加入最近的 `CLAUDE.md` 索引，并保持 `AGENTS.md` 与 `CLAUDE.md` 同步？
