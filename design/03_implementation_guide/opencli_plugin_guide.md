# OpenCLI 插件指南

## 布局

OpenCLI 会扁平扫描插件包目录。任何使用 `cli(...)` 注册命令的文件都必须直接放在包根目录：

```text
packages/social-weixin/
  auth.js
  draft-add.js
  publish.js
  lib/
    weixin.js
```

辅助模块可以放在 `lib/` 下。

当同一平台扩展多个能力域时，不要把命令注册文件移入 `publish/`、`comments/`、`analytics/` 等功能子目录。平台命名空间由插件包负责，命令注册文件继续平铺在包根目录；能力域边界应体现在命令命名和 `lib/` 内部模块上。

推荐形态：

```text
packages/social-weixin/
  comments-list.js
  comments-reply.js
  posts-list.js
  publish.js
  lib/
    publishing/
      publish.js
      validation.js
    engagement/
      comments.js
    content/
      posts.js
```

这种布局保留 OpenCLI 的扁平发现能力，同时让领域代码按 Publishing、Engagement、Content Library、Analytics 等能力域演进。

## 命令规则

- 只从 OpenCLI 公共导出导入，例如 `@jackwener/opencli/registry` 和 `@jackwener/opencli/errors`。
- 始终声明 `access`。
- 对不需要浏览器的官方 API 命令使用 `Strategy.LOCAL`。
- 输出行保持紧凑，并包含远端 ID。
- 对无效本地输入抛出 `ArgumentError`。
- 对平台 API 错误抛出 `CommandExecutionError`。

## 分发

本地开发：

```bash
opencli plugin install file:///absolute/path/opencli-social/packages/social-weixin
```

GitHub monorepo 分发：

```bash
opencli plugin install github:<owner>/opencli-social
opencli plugin install github:<owner>/opencli-social/social-weixin
opencli plugin update social-weixin
```
