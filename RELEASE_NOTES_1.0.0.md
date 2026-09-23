# WebVideo+ 1.0.0 发行说明

WebVideo+ 1.0.0 是面向 WebGAL Terre 4.6.4 的首个 1.x 正式版本。它把此前分散在 0.4.x–0.7.x 内部迭代中的编辑、导航、导出、安装管理与可选 AI 能力整理为统一产品，并完成正式发布所需的版本、图标、许可与构建元数据收尾。

## 主要变化

- **完整的视频导出工作流**：默认使用 GPU Raw 路线，将 Pixi 舞台与 DOM/UI 合成后通过 WebView2 SharedBuffer 送入 FFmpeg；支持硬件 H.264 自动探测、CPU x264 回退、RGB 真无损与传统兼容路径。
- **多线程与分片恢复**：按剧情安全点、DOM workload 与 Live2D 生命周期规划分片，持续修复 Cubism2 motion、physics、blink 与切段恢复的接缝问题。
- **分层导出**：除完整视频外，支持单独导出舞台、透明舞台、对话框以及 WebGAL 原始音轨；透明视频使用 ProRes 4444。
- **字幕后处理**：支持 SRT / ASS / SSA 软字幕封装及 FFmpeg/libass 烧录，并提供多种时间定位方式。
- **Terre 集成工具**：包含剧情导航、剧情选择、批量编辑、滤镜与预制效果、音乐配置、备份恢复、检查标记、结构化故事导入等功能。
- **模块化安装器**：可单独增删功能模块，支持数据目录、工作缓存和安装缓存自定义；安装、更新和卸载均保留回滚与强制修复路径。
- **兼容性**：当前适配 Terre 4.6.4，同时兼容标准版、Steam 版以及前端重新打包但挂载语义保持一致的部分发行变体。
- **可选生成式 AI**：AI 组件仍为 Beta，默认不安装；用户自行配置 API Key，Key 使用 Windows 当前用户 DPAPI 加密保存。
- **发布收尾**：安装器与 Manager 统一使用 WebVideo+ 图标；正式构建不再携带内部版本字段或 experimental 状态。

## 安装与升级

从 GitHub Releases 下载 `WebVideo+-Setup-1.0.0.exe`，选择已有 Terre 4.6.4 安装目录即可。安装器会识别已有 WebVideo+ / 旧导出器状态，并根据当前安装记录提供安装、更新、应用模块变更或强制修复。

升级不会主动删除用户的导出视频、WebGAL 工程或配置。卸载时可分别选择是否清理缓存/临时文件，以及是否删除 WebVideo+ 配置和用户数据。

## 发布构建

- 产品版本：`1.0.0`
- 安装器 Win32 版本：`1.0.0.0`
- 发布前内部开发标识：`0.7.50`
- 导出内核：`0.6.40`
- Terre 基线：`4.6.4`

正式构建使用不带 `-InternalBuild` / `-InternalVersion` 的 `build-product.ps1`。正式包不会写入 `productInternalVersion`；内部测试包则继续保留内部版本和 internal channel 元数据。

## 许可与第三方来源

WebVideo+ 原创部分采用 MPL-2.0。Terre/WebGAL、Anogo 默认动作词表、js-yaml、WebView2、FFmpeg、Node.js、DeepSeek Harness / DSH、pi-ai 及其他第三方组件继续适用各自许可证和署名要求。详见 `LICENSES.md`、`NOTICE.md` 与 `licenses/THIRD-PARTY.md`。

更细的逐版本变更请查看 [CHANGELOG.md](CHANGELOG.md)。
