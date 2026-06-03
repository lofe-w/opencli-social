# 产品概览

OpenCLI Social 为 OpenCLI 用户提供可共享的社交和内容平台运营插件，用于补足内置适配器当前尚未覆盖的、更完整的平台工作流。

## 第 1 阶段

通过微信官方 API 端点实现微信公众号文章发布链路：

- 获取或校验 access token
- 上传永久封面图片素材
- 上传正文内联图片
- 创建文章草稿
- 提交草稿发布
- 查询发布状态
- 提供组合命令 `publish-article`

## 后续阶段

- `social-weixin`：扩展已发布内容列表、评论管理、阅读和互动数据查询
- `social-xiaohongshu`：通过创作者中心 UI 自动化发布图文笔记和视频笔记，并在可行时支持评论和数据读取
- `social-wechat-channels`：通过视频号助手 UI 自动化发布视频，并逐步支持作品和互动数据
- `social-douyin`：在可行时使用官方开放平台流程
- `social-kuaishou`：使用官方开放平台视频创建流程，并逐步扩展运营能力
