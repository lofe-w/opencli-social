# OpenCLI Social - Agent 指南

本文件是 Agent 在本仓库工作的主要入口。它与 `AGENTS.md` 互为镜像；请保持两个文件同步。

## 项目概览

OpenCLI Social 是一组用于操作社交和内容平台的 OpenCLI 插件 monorepo。每个平台位于独立的子插件中，并使用 `social-<platform>` 命令命名空间，以避免与 OpenCLI 内置适配器冲突。

第 1 阶段实现 `social-weixin`，这是一个基于微信官方 API 端点的微信公众号运营插件。当前覆盖发布链路，并为后续的评论、已发布内容和数据查询能力预留领域边界。

## 技术栈

| 领域 | 技术 |
|---|---|
| 运行时 | Node.js 20+ |
| 插件宿主 | OpenCLI 插件系统 |
| 包布局 | npm workspaces |
| 命令 | 通过 `@jackwener/opencli/registry` 注册的 ESM JavaScript 文件 |
| 认证 | 环境变量和微信公众号 access token |

## 文档地图

| 路径 | 用途 | 阅读时机 |
|---|---|---|
| `design/CLAUDE.md` | 设计文档索引 | 开始功能开发前 |
| `design/domain.md` | 领域语言和跨平台社交平台运营模型 | 实现命令前 |
| `design/02_platforms/weixin_official_account.md` | 微信公众号 API 模型和命令地图 | 修改 `social-weixin` 前 |
| `design/03_implementation_guide/opencli_plugin_guide.md` | OpenCLI 插件实现约定 | 添加命令或包前 |
| `packages/social-weixin/CLAUDE.md` | 微信插件本地指南 | 编辑该包前 |
| `issues/` | 本地 issue 和实现说明 | 规划工作时 |
| `memory/` | 持久化项目记忆 | 恢复上下文时 |

## 全局规则

1. 功能开发前先阅读 `design/domain.md`。
2. 本项目是 CLI monorepo。开发任何 CLI 命令、命令契约、认证配置、输出格式或插件能力前，必须先使用 OpenAI curated `cli-creator` Skill（https://github.com/openai/skills/tree/main/skills/.curated/cli-creator），并按其命令契约、JSON 输出、认证、安全写入和验证流程执行；如果当前环境没有该 Skill 或无法正常使用，必须先安装并调试可用后再开始开发。
3. 平台提供官方 API 时优先使用官方 API。只有当平台没有所需能力的官方 API 时，才使用浏览器 UI 自动化。
4. 所有会创建、修改、删除、回复或提交远端状态的命令都属于写操作，必须声明 `access: 'write'`，并对预期的平台错误使用显式、带类型的失败。
5. 校验失败时不要静默执行。如果某个字段、过滤条件或操作无法应用或验证，必须在远端写入前抛错。
6. 保持命令命名空间与 OpenCLI 内置命令区分开，例如使用 `social-weixin`、`social-xiaohongshu` 等。
7. 调用 `cli(...)` 的插件命令文件必须直接位于各插件包根目录，因为 OpenCLI 会扁平扫描插件目录。
8. 辅助模块可以放在包内子目录，例如 `lib/`。
9. 新增 Markdown 文档时，必须加入最近的 `CLAUDE.md` 索引。
10. 临时捕获内容、截图和原始 API 样本应放在 `tmp/` 或 `memory/`，不要放在包根目录。
11. 保持 `AGENTS.md` 和 `CLAUDE.md` 同步。

## 开发命令

```bash
npm test
opencli plugin install file:///Users/fushuai/GitRepository/opencli-social/packages/social-weixin
opencli social-weixin auth
```

## 分发

本地开发期间，使用 `file://` 安装子插件目录。仓库发布到 GitHub 后，用户可以安装整个 monorepo 或指定子插件：

```bash
opencli plugin install github:<owner>/opencli-social
opencli plugin install github:<owner>/opencli-social/social-weixin
opencli plugin update social-weixin
```
