# 来源与许可

本仓库包含 WebVideo+ 当前实现、构建脚本和预置数据。没有上传用户游戏工程、小说原文、角色/背景/音乐素材、API Key 或本机凭据配置。

除 [`LICENSES.md`](LICENSES.md) 另有说明的材料外，WebVideo+ 的原创源代码、构建脚本、项目特定实现和原创数据采用 **Mozilla Public License 2.0（MPL-2.0）**。完整许可证文本见根目录 [`LICENSE`](LICENSE)。根许可证不会覆盖或替换其他权利人的既有条款。

原创文档（包括 README、CHANGELOG、原创使用/构建指南等）及 `WebVideo+_icon.svg`、`WebVideo+_icon.ico` 保留所有权利（ARR）；项目名称、商标和品牌标识不随代码许可证授予使用许可。具体边界见[许可范围映射](LICENSES.md#reserved-original-documentation-logo-and-brand-identifiers)。既有有效授权继续适用，法律允许的使用不受本声明限制。

- **WebGAL / Terre**：编辑器与播放引擎基座遵循其各自 MPL-2.0 许可。`baseline/terre-4.6.4.js` 来源于 OpenWebGAL/WebGAL_Terre 4.6.4，用于精确挂载定位，SHA-256 为 `3b40aa7bccf427178c6580d9ed1686d3b50cc6617fa95c34632026002a9e7133`。
- **内置运行时字体**：`WebgalUI` 保留 WebGAL 4.6.4 所含未经修改的 OPPO Sans v1.00。OPPO 的历史公开说明允许个人和企业免费商用；本项目暂按允许软件内嵌分发理解该许可，并保留其使用限制，未宣称取得单独授权。公开来源、解释边界及其他字体许可见 `licenses/WEBGAL-RUNTIME-SOURCES.md`。
- **WebView2 / FFmpeg / Node.js**：按各自许可用于原生导出、媒体处理和可选 AI 运行环境。WebView2 与 Node 构建输入按 `build/dependencies.lock.json` 从官方归档准备；FFmpeg 内置工具按独立固定版本与校验值准备，保留 GPLv3、依赖许可和固定构建来源记录；对应源码与构建材料随发行提供独立附件，详见 `docs/FFMPEG-DISTRIBUTION.md`。保留各自原有许可，不视为 WebVideo+ 自有代码。
- **DeepSeek Harness / pi-ai**：可选 AI 组件使用 DSH 0.1.5-rc.1 与 pi-ai 0.85.1；依赖版本由 `ai-runtime/package-lock.json` 固定，相关第三方许可保留在依赖目录或上游包内。
- **Anogo**：`anogo-actions.factory.json` 中的默认动作词表来自 A-kirami/anogo，继续适用其 AGPL-3.0 来源与许可；WebVideo+ 自行实现的 Anogo 导入适配代码采用 MPL-2.0。完整 Anogo 创作工具并不随 WebVideo+ 捆绑。
- **js-yaml**：随包使用 4.1.1 压缩版本，保留 MIT 许可。
- **webgal-skill / 演出参考资料**：`xxSak1xx/webgal-skill` 仓库采用 MIT 许可证；其中演出资料同时明确感谢北风的猫5306。WebVideo+ 对这些资料的引用、整理和兼容性修正不会消除原始署名或其他权利。
- **Playwright / Electron**：仅属于早期自动化与导出原型的历史来源。当前 1.0.0 导出核心使用 C# + WebView2，不捆绑这两个运行时；仓库中保留的相关 LICENSE/NOTICE 用于来源和许可溯源。
- **社区与项目数据**：角色名称、角色 ID、商标和其他事实/标识不因收录而成为 WebVideo+ 的专有内容。对社区提供或另有归属的条目，MPL-2.0 仅覆盖 WebVideo+ 有权许可的原创选择、结构、整理和新增内容。

各项第三方来源与运行关系见 [`licenses/THIRD-PARTY.md`](licenses/THIRD-PARTY.md)；按路径和材料划分的许可范围见 [`LICENSES.md`](LICENSES.md)；许可文本见 `licenses/` 和 `vendor/js-yaml-LICENSE`。

公开上传、构建与分发不改变第三方软件、SDK、服务、商标或素材各自的权利与许可证。对 WebVideo+ 原创部分的 MPL-2.0 授权也不构成对这些第三方材料的再许可。


补充的精确第三方范围：`licenses/LICENSE-pi-0.85.1-MIT.txt` 保留 pi-ai/pi-telemetry 作者许可；`LICENSE-pixi-live2d-display-MIT.txt` 与 `LICENSE-CubismWebFramework.md` / `LICENSE-Live2D-Open-Software.txt` 分别保留显示插件和 Framework 的原许可。没有捆绑专有 Cubism Core 或游戏模型，不代表显示插件中不存在 Framework 实现；原许可范围不由 MPL/MIT 覆盖。OPPO 旧字体公开条款及未变更字节的使用范围见 `licenses/OPPO-Sans-1.00-NOTICE.txt`。


- **安装器解压支持**：7-Zip 25.00 Windows x64 命令行和 DLL，保留完整上游许可与版权声明 `licenses/7ZIP-LICENSE.txt`。官方归档地址及原始字节 SHA256 记录在 `build/dependencies.lock.json`，不安装图形界面或系统文件关联。固定版本的源码和构建文件通过独立第三方源码发行提供，入口见 `docs/FFMPEG-DISTRIBUTION.md`。
