# 上游与第三方来源

本文件记录 WebVideo+ 0.4.10 / 安装器 0.4.10.2 当前实际使用或随包保留的主要第三方来源。更细的传递依赖仍以各上游项目自己的包清单和许可为准。

## 当前运行与构建依赖

- **OpenWebGAL / WebGAL Terre 4.6.4**：WebVideo+ 的编辑器基座。仓库中的 `baseline/terre-4.6.4.js` 用于精确挂载定位；相关 MPL-2.0 文本保存在本目录。
- **OpenWebGAL / WebGAL 4.6.4**：播放引擎和导出运行资源的上游。构建时从固定安装器中抽取对应运行快照，而不是在本仓库内重新构建完整 WebGAL。
- **Microsoft WebView2**：C# 原生导出与嵌入浏览器运行环境。构建所需 SDK/loader 二进制从固定安装器中抽取，许可文件随包保留。
- **FFmpeg / ffprobe**：视频编码、媒体探测和音频混合。安装器在缺少可用版本时按固定版本获取；FFmpeg 适用其自身许可。
- **Node.js**：仅用于可选 AI 运行环境及构建工具。启用 AI 模块时随其运行目录提供固定 Node 可执行文件。
- **DeepSeek Harness / DSH 0.1.5-rc.1** 与 **@earendil-works/pi-ai 0.85.1**：可选 AI 模块的多提供商、流式协议和模型目录基础。版本由 `ai-runtime/package-lock.json` 固定。
- **js-yaml 4.1.1**：Anogo YAML 导入使用的解析器；仓库包含压缩版本及 MIT 许可。
- **Anogo**：结构化故事格式和默认动作词表的来源；对应来源说明与 AGPL-3.0 文本随包保留。

## 继承自 Terre / WebGAL 的前端依赖

React、Fluent UI、IconPark、TanStack Virtual、Zustand、Monaco Editor、PixiJS、pixi-filters、Popmotion、Redux Toolkit、localForage、Live2D 显示库等主要通过 Terre/WebGAL 上游运行环境继承。WebVideo+ 会调用这些已有接口，但不因此把它们改成 WebVideo+ 自有代码或统一许可。

更完整的传递依赖请参考：

- https://github.com/OpenWebGAL/WebGAL_Terre/tree/4.6.4
- https://github.com/OpenWebGAL/WebGAL/tree/4.6.4

## 研究与历史原型来源

- `xxSak1xx/webgal-skill`：早期工作流、助手提示词和演出特效资料的重要参考来源。
- `floatDreamWithSong/webgal-tools`：早期资产扫描与场景读写方案研究参考；当前发布包不依赖其 MCP 服务。
- Playwright / Electron：曾用于早期浏览器自动化、捕获与导出原型。**当前 0.4.10.2 导出核心使用 C# + WebView2，不捆绑 Playwright 或 Electron 运行时。** 仓库中保留的相关 LICENSE/NOTICE 文件用于历史来源和许可溯源，不表示它们仍是当前运行依赖。

## 不随包提供的内容

WebVideo+ 不包含用户游戏工程、小说原文、角色模型、角色图像、配音、BGM、背景素材、API Key、本机凭据或用户的 Terre 安装目录。MyGO 引擎及其角色资源也不由本安装包转授；如用户选择 MyGO，由用户现有安装提供。

第三方代码、二进制、素材和服务继续适用各自的许可证与权利声明；本项目的整理、封装和致谢不改变这些条款。
