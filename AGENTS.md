# OpenCLI Social - Agent 指南

本文件是 Agent 在本仓库工作的主要入口。它与 `CLAUDE.md` 互为镜像；请保持两个文件同步。

## 项目概览

OpenCLI Social 是一组用于操作社交和内容平台的 OpenCLI 插件 monorepo。每个平台位于独立的子插件中，并使用 `social-<platform>` 命令命名空间，以避免与 OpenCLI 内置适配器冲突。

第 1 阶段实现 `social-wechat-article`，这是一个基于微信官方 API 端点的微信公众号运营插件。当前覆盖发布链路，并为后续的评论、已发布内容和数据查询能力预留领域边界。

## 技术栈

| 领域 | 技术 |
|---|---|
| 运行时 | Node.js 20+ |
| 插件宿主 | OpenCLI 插件系统 |
| 包布局 | npm workspaces |
| 命令 | 通过 `@jackwener/opencli/registry` 注册的 ESM JavaScript 文件 |
| 认证 | OpenCLI profile 级平台凭据和 access token cache |

## 文档地图

| 路径 | 用途 | 阅读时机 |
|---|---|---|
| `design/CLAUDE.md` | 设计文档索引 | 开始功能开发前 |
| `design/domain.md` | 领域语言和跨平台社交平台运营模型 | 实现命令前 |
| `design/02_platforms/wechat_article.md` | 微信公众号 API 模型和命令地图 | 修改 `social-wechat-article` 前 |
| `design/02_platforms/weixin_channels.md` | 微信视频号发布插件、浏览器会话边界和 HITL 设计 | 设计或实现视频号发布前 |
| `design/03_implementation_guide/agentic_development_contract.md` | 项目级 Agentic 开发契约、HITL、会话边界和写入保护 | 开发任何平台能力或远端写操作前 |
| `design/03_implementation_guide/opencli_plugin_guide.md` | OpenCLI 插件实现约定 | 添加命令或包前 |
| `packages/social-wechat-article/CLAUDE.md` | 微信插件本地指南 | 编辑该包前 |
| `packages/social-weixin-channels/CLAUDE.md` | 微信视频号插件本地指南 | 编辑该包前 |
| `skills/social-wechat-article/SKILL.md` | 公众号文章 Agent 使用策略 | 让 Agent 操作公众号文章发布链路前 |
| `skills/social-weixin-channels/SKILL.md` | 视频号 Agent 使用策略 | 让 Agent 操作视频号发布链路前 |
| `issues/` | 本地 issue 和实现说明 | 规划工作时 |
| `memory/` | 持久化项目记忆 | 恢复上下文时 |

## 全局规则

1. 功能开发前先阅读 `design/domain.md`。
2. 开发任何平台能力、CLI 命令、认证流程、发布流程或远端写操作前，必须阅读并遵循 `design/03_implementation_guide/agentic_development_contract.md`；其中的会话边界、HITL、写入确认、job 恢复、账号安全和敏感信息约束是项目级第一优先级。
3. 本项目是 CLI monorepo。开发任何 CLI 命令、命令契约、认证配置、输出格式或插件能力前，必须先使用 OpenAI curated `cli-creator` Skill（https://github.com/openai/skills/tree/main/skills/.curated/cli-creator），并按其命令契约、JSON 输出、认证、安全写入和验证流程执行；如果当前环境没有该 Skill 或无法正常使用，必须先安装并调试可用后再开始开发。
4. 平台提供官方 API 时优先使用官方 API。只有当平台没有所需能力的官方 API 时，才使用浏览器 UI 自动化。
5. 所有会创建、修改、删除、回复或提交远端状态的命令都属于写操作，必须声明 `access: 'write'`，并对预期的平台错误使用显式、带类型的失败。
6. 校验失败时不要静默执行。如果某个字段、过滤条件或操作无法应用或验证，必须在远端写入前抛错。
7. 保持命令命名空间与 OpenCLI 内置命令区分开，例如使用 `social-wechat-article`、`social-xiaohongshu` 等。
8. 调用 `cli(...)` 的插件命令文件必须直接位于各插件包根目录，因为 OpenCLI 会扁平扫描插件目录。
9. 辅助模块可以放在包内子目录，例如 `lib/`。
10. 新增 Markdown 文档时，必须加入最近的 `CLAUDE.md` 索引。
11. 临时捕获内容、截图和原始 API 样本应放在 `tmp/` 或 `memory/`，不要放在包根目录。
12. 保持 `AGENTS.md` 和 `CLAUDE.md` 同步。

## 开发命令

```bash
npm test
```

## 分发

用户可以安装整个 monorepo 或指定子插件：

```bash
# 安装 monorepo 中的全部 enabled 子插件
opencli plugin install github:lofe-w/opencli-social

# 或安装单个子插件
opencli plugin install github:lofe-w/opencli-social/social-wechat-article
opencli plugin install github:lofe-w/opencli-social/social-weixin-channels

# 后续更新
opencli plugin update --all
```
