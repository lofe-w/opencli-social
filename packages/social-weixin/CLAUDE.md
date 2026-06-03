# social-weixin 指南

本包在 `opencli social-weixin` 下暴露微信公众号运营命令。当前实现 Publishing 能力域，后续评论、内容库和数据查询命令也应继续放在同一命名空间下。

## 文件

| 路径 | 用途 |
|---|---|
| `doctor.js` | 诊断认证、缓存和 API base 配置 |
| `auth.js` | 校验 token 获取 |
| `upload-image.js` | 上传永久封面图片素材 |
| `upload-content-image.js` | 上传文章内联图片 |
| `draft-add.js` | 创建单篇文章草稿 |
| `publish.js` | 提交草稿 media ID |
| `publish-status.js` | 查询发布状态 |
| `publish-article.js` | 草稿创建加可选提交的组合流程 |
| `request.js` | raw 官方 API escape hatch |
| `lib/weixin.js` | 官方 API 辅助函数 |

新增能力域时，命令注册文件仍然放在当前目录根部，并用稳定的短横线命名表达资源和动作，例如 `comments-list.js`、`comments-reply.js`、`posts-list.js`。不要创建 `publish/`、`comments/`、`analytics/` 等命令入口子目录；这些子目录可以用于 `lib/` 内部实现。

当 `lib/weixin.js` 继续增长或新增评论、内容库、数据能力时，优先把内部实现拆到能力域模块，例如 `lib/publishing/`、`lib/engagement/`、`lib/content/`、`lib/analytics/`。根目录命令文件应保持薄封装，只负责 `cli(...)` 声明、参数、输出列和调用领域函数。

## 规则

- 命令注册文件必须保留在当前目录根部。
- 不要把命令文件移到 `src/` 下；OpenCLI 插件发现机制不会加载它们。
- 远程写入，包括发布、回复、删除、修改和提交类操作，必须传入 `--execute`。
- raw 非 GET/HEAD 请求必须传入 `--execute`。
- API 错误应通过 OpenCLI 错误类保持类型化。
