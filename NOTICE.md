# 来源与许可

本仓库包含 WebVideo+ 当前实现、构建脚本和预置数据。没有上传用户游戏工程、小说原文、角色/背景/音乐素材、API Key 或本机凭据配置。

- **WebGAL / Terre**：编辑器与播放引擎基座遵循其各自 MPL-2.0 许可。`baseline/terre-4.6.4.js` 来源于 OpenWebGAL/WebGAL_Terre 4.6.4，用于精确挂载定位，SHA-256 为 `3b40aa7bccf427178c6580d9ed1686d3b50cc6617fa95c34632026002a9e7133`。
- **WebView2 / FFmpeg / Node.js**：按各自许可用于原生导出、媒体处理和可选 AI 运行环境。固定第三方二进制由发布安装器/构建 bootstrap 提供，不视为 WebVideo+ 自有代码。
- **DeepSeek Harness / pi-ai**：可选 AI 组件使用 DSH 0.1.5-rc.1 与 pi-ai 0.85.1；依赖版本由 `ai-runtime/package-lock.json` 固定，相关第三方许可保留在依赖目录或上游包内。
- **Anogo**：默认动作词表与结构化故事格式来源保留 AGPL-3.0 来源说明及许可；完整 Anogo 创作工具并不随 WebVideo+ 捆绑。
- **js-yaml**：随包使用 4.1.1 压缩版本，保留 MIT 许可。
- **Playwright / Electron**：仅属于早期自动化与导出原型的历史来源。当前 0.4.10.2 导出核心使用 C# + WebView2，不捆绑这两个运行时；仓库中保留的相关 LICENSE/NOTICE 用于来源和许可溯源。
- **提示词与演出资料**：特别感谢北风的猫5306，以及 `xxSak1xx/webgal-skill` 中公开的相关资料与原始致谢说明。更详细的项目引用、参考关系和特别感谢见 README。

各项第三方来源与运行关系见 `licenses/THIRD-PARTY.md`；许可文本见 `licenses/` 和 `vendor/js-yaml-LICENSE`。

公开上传、构建与分发不改变第三方软件、SDK、服务或素材各自的权利与许可证，也没有替用户原创内容另行授予统一的对外许可证。
