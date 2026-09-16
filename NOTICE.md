# 来源与许可

本仓库包含 WebVideo+ 当前实现、构建脚本和预置数据。没有上传用户游戏工程、小说原文、角色/背景/音乐素材、API Key 或本机凭据配置。

除 [`LICENSES.md`](LICENSES.md) 明确列出的第三方或独立许可材料外，WebVideo+ 的原创源代码、构建脚本、项目特定实现和原创数据采用 **Mozilla Public License 2.0（MPL-2.0）**。完整许可证文本见根目录 [`LICENSE`](LICENSE)。根许可证不会覆盖或替换其他权利人的既有条款。

- **WebGAL / Terre**：编辑器与播放引擎基座遵循其各自 MPL-2.0 许可。`baseline/terre-4.6.4.js` 来源于 OpenWebGAL/WebGAL_Terre 4.6.4，用于精确挂载定位，SHA-256 为 `3b40aa7bccf427178c6580d9ed1686d3b50cc6617fa95c34632026002a9e7133`。
- **WebView2 / FFmpeg / Node.js**：按各自许可用于原生导出、媒体处理和可选 AI 运行环境。固定第三方二进制由发布安装器/构建 bootstrap 提供，不视为 WebVideo+ 自有代码。
- **DeepSeek Harness / pi-ai**：可选 AI 组件使用 DSH 0.1.5-rc.1 与 pi-ai 0.85.1；依赖版本由 `ai-runtime/package-lock.json` 固定，相关第三方许可保留在依赖目录或上游包内。
- **Anogo**：`anogo-actions.factory.json` 中的默认动作词表来自 A-kirami/anogo，继续适用其 AGPL-3.0 来源与许可；WebVideo+ 自行实现的 Anogo 导入适配代码采用 MPL-2.0。完整 Anogo 创作工具并不随 WebVideo+ 捆绑。
- **js-yaml**：随包使用 4.1.1 压缩版本，保留 MIT 许可。
- **webgal-skill / 演出参考资料**：`xxSak1xx/webgal-skill` 仓库采用 MIT 许可证；其中演出资料同时明确感谢北风的猫5306。WebVideo+ 对这些资料的引用、整理和兼容性修正不会消除原始署名或其他权利。
- **Playwright / Electron**：仅属于早期自动化与导出原型的历史来源。当前 0.4.10.2 导出核心使用 C# + WebView2，不捆绑这两个运行时；仓库中保留的相关 LICENSE/NOTICE 用于来源和许可溯源。
- **社区与项目数据**：角色名称、角色 ID、商标和其他事实/标识不因收录而成为 WebVideo+ 的专有内容。对社区提供或另有归属的条目，MPL-2.0 仅覆盖 WebVideo+ 有权许可的原创选择、结构、整理和新增内容。

各项第三方来源与运行关系见 [`licenses/THIRD-PARTY.md`](licenses/THIRD-PARTY.md)；按路径和材料划分的许可范围见 [`LICENSES.md`](LICENSES.md)；许可文本见 `licenses/` 和 `vendor/js-yaml-LICENSE`。

公开上传、构建与分发不改变第三方软件、SDK、服务、商标或素材各自的权利与许可证。对 WebVideo+ 原创部分的 MPL-2.0 授权也不构成对这些第三方材料的再许可。
