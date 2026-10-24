# WebVideo+

面向 **WebGAL Craft** 的视觉小说视频制作辅助工具。提供批量编辑、剧情导航、音乐配置、备份/检查、结构化故事导入与视频导出；生成式 AI 为实验性功能，需要自行配置 API Key。

[下载 1.2.0.0c](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/craft-v1.2.0.0c/WebVideoCraft-Setup-1.2.0.0c.exe) · [正式版适配](craft/ADAPTATION-1.0.0.md) · [Craft 安装与功能](craft/README.md) · [版本记录](CHANGELOG.md) · [构建说明](BUILDING.md) · [MPL-2.0](LICENSE) · [许可范围](LICENSES.md) · [来源与许可](NOTICE.md)

**当前分支：WebVideo+ Craft 1.2.0c（安装器 1.2.0.0c；混合导出内核 0.6.61，产品基线 1.3.3）。** Craft 功能、构建和验收边界见 [Craft 说明](craft/README.md)。

支持精确匹配的官方 Windows x64 **Craft 1.0.0 正式版**，工程引擎支持官方 WebGAL **4.6.4 / 4.6.5 / 4.6.6** 和 **MyGO 3.2.1**；自定义同版本包与未来版本需单独适配。Terre 安装请按[项目首页](https://github.com/Stakataka-3030/WebVideo-Plus#下载与版本选择)选择维护通道。

此分支适配官方 Craft 1.0.0。已 EOL 版本的下载与兼容范围见[历史版本说明](docs/LEGACY-VERSIONS.md)。

## 主要功能

- **批量编辑**：一键 ID 补全、预位表情调整、批量滤镜/修改已有滤镜、批量加 `-next`、自动离场等。
- **Video+ 预制效果**：按镜头、人物、转场、光色、天气等分类插入或追加演出语句，也可保存自用效果。
- **剧情导航**：按连续执行和目标整理主次组件，显示说话人、表情动作及命名滤镜/预制效果，点击即可定位编辑器与预览。
- **剧情选择与时间线工具**：辅助选择连续区间、整理剧情结构和导出范围。
- **音乐配置**：直接添加或拖入音频，可增加并行播放器行，按文字/放映速度匹配故事时长。
- **视频与音轨导出**：读取实际预览速度，导出完整视频、舞台、对话框/DOM 或 48 kHz WAV；支持全篇、由当前场景开始、仅当前场景及语句选区，任务与进度由本机服务管理。
- **字幕后处理（可选模块）**：导出完成后封装 SRT/ASS/SSA 软字幕或通过 FFmpeg/libass 烧录；可按视频起点、WebGAL 时间线语句、后处理音乐或手动时间定位。字幕内容和样式交给 Subtitle Edit、Aegisub 等外部编辑器处理。
- **导入 Anogo 故事**：接收粘贴文本及 JSON/YAML 文件，转换后追加故事；动作导入默认关闭，待核对项由作者检查。
- **检查与标记 / 备份与恢复**：提供制作提醒、待核对标签、历史备份与确认回滚；编辑通过 Craft 原生文档事务提交，保留未保存状态与原生撤销。
- **游戏工具收纳**：可将场景分支、鉴赏和游戏控制等入口集中到“游戏工具”。

## 视频导出

当前默认导出使用 GPU Raw 管线：Pixi 按输出尺寸渲染，DOM/UI 通过三层缓存合入最终 framebuffer，再以 WebView2 SharedBuffer 把 RGBA 帧送入 FFmpeg。0.5.4 起，编码质量与具体硬件编码器分离，默认不再把非 NVIDIA 用户自动导向 RGB 真无损。

导出质量现在放在主导出界面，与分辨率、帧率同级，不需要展开高级设置：

- **推荐 / 高质量**：默认档。自动并行探测 NVIDIA NVENC、AMD AMF、Intel Quick Sync；可用时使用硬件 H.264，不可用时回退 CPU x264。适合大多数成片，兼顾高画质、较小体积和导出速度。
- **超高质量**：使用同一套自动编码器，但进一步降低压缩损失，适合后期编辑或对压缩痕迹敏感的场景；文件会更大。
- **完全无损**：使用 `libx264rgb -crf 0` 的 RGB 视频流无损编码，**文件可能特别大**；仅建议需要像素级保真或特殊后期时使用，部分 Windows 自带播放器兼容性较差。
- **传统 / 兼容**：保留旧 JPEG CapturePreview → H.264 路径，用于 GPU Raw 出现兼容问题时回退，**导出速度明显变慢**。

硬件编码器在任务开始前会做一次实际 FFmpeg 预检；导出过程中若硬编仍因驱动或设备问题失败，会保持原画质档自动回退 CPU x264，而不是回退到无损 x264rgb。

Craft 的导出快照与工作文件位于适配目录的 `state/sessions/<sessionId>/`，长期内核配置位于 `state/kernel/`；安装器的解压缓存与导出缓存分别管理。成功任务清理重型工作缓存，失败或取消任务保留必要快照和分片供重试；清理失败会保留记录并提示处理。

本版的新配置默认给每个并行渲染进程设置 **128 MiB 的 Live2D Cubism Core 初始内存**；已有显式设置（包括 `0`）保留。`0` 表示使用引擎默认值，手动范围为 16–1024 MiB，仅在加载 Core 时生效。实际内存占用可能更高，贴图显存另计；这项设置与磁盘工作缓存分别管理。

安装器使用原 `webgal-craft.exe` 入口，保留原快捷方式。安装、更新、修复和卸载挂载均校验宿主、文件清单与归属；修复仅重建同包缺失或损坏组件。卸载挂载保留组件、配置、日志和用户数据，官方更新后的新程序也会保留。

并行数支持 1–32，但更多进程不一定更快。自动模式按剧情安全点和 DOM workload 估算分配分片，分片数不超过有效 worker 数；手动模式由切点决定分片数，并行数只限制同时执行的分片数。**1080p 是常规推荐档，1440p 适合需要更高输出分辨率的场景；4K 每帧像素量约为 1080p 的 4 倍，建议 2–4 worker。若原始背景、立绘或 Live2D 贴图本身不是 4K，通常不会获得更多真实细节。**

历史基线资料见[历史版本说明](docs/LEGACY-VERSIONS.md#历史基线文档)。

高级导出设置支持语句选择、`;CutHere` 和帧/秒/时间码切点；手动模式按指定边界切段，有效切点为空时单段导出。复杂动画、Live2D / Pixi 的接缝需按工程检查。兼容捕获可选 JPEG / PNG，默认 JPEG；PNG 避免截图压缩，最终 H.264 仍为有损编码。4.6.6 的 animation v2 按实际工程绑定启用；故事链按静态、单向 `changeScene` 展开，交互分支和循环需另行整理。仅音轨包含剧本原声，成片配乐替换用于完整视频。

## 两轮基础舞台

“小说转剧本骨架”采用两轮基础舞台流程。第一轮标注正文和实际在场角色；第二轮前实时读取当前游戏素材，每个识别角色按名字/ID 别名关联路径并提供其全部有效 Live2D 入口文件，背景目录文件名也一并提供。

第二轮只选择真实路径及有限舞台状态，由程序生成基础背景和登离场：默认最多 1 人居中，可选最多 2 人且左右分列；不自动填写 motion/expression。未显示角色的对白不附加 figureId，作为画外音。两个阶段共用 60 分钟任务时限。

## AI 功能（实验性）

“小说转剧本骨架”可分批处理长文，支持粘贴或读取 TXT。模型只返回原文片段范围、对白/旁白类型、说话人和场景变化标记；程序要求连续无重复覆盖全部原文片段，并直接截取原文写入。第二轮补基础背景和人物调度，不自动安排表情动作、滤镜或特效。

结果先预览再追加，追加前自动备份，所有新增语句标记待核对。支持取消、批次进度显示和失败重试；不完整或无效输出拒绝写入。实际角色识别、场景判断和演出效果仍需作者检查。

提示词：`ai-runtime/novel-prompt.txt`；原文范围与转换规则：`browser/novel-core.js`。

### 可选 AI 接入

Craft 增强包提供独立 AI 运行环境，可在配置栏填写 API Key；请求由明确的功能操作触发，批量编辑、备份和视频导出可直接使用。Terre 安装器的 AI 组件仍为默认不安装的可选项。

当前 AI 附件固定使用 DSH 0.1.5-rc.1 与 pi-ai 0.85.1，并由 `package-lock.json` 锁定依赖；包含固定 Node 运行时。提供商目录支持常见 Key 服务自动带入地址，也可自定义 Responses、Chat Completions 或 Anthropic Messages 协议。

Key 通过 Windows 当前用户 DPAPI 加密，存于适配目录的 `state/kernel/user-data/ai/providers.json`；Craft 使用独立配置，旧 Terre 的配置、凭据和模型列表由各自安装管理。连接测试由用户手动触发，会发送简短请求并可能产生费用；模型列表读取成功不代表实际生成请求一定兼容。

## 安装与管理

1. 保存工程并正常关闭官方 Windows x64 Craft 1.0.0。
2. 从[发行页](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/craft-v1.2.0.0c)下载安装器 `WebVideoCraft-Setup-1.2.0.0c.exe`，按发行正文的 SHA-256 校验。
3. 选择 Craft 目录、原程序或快捷方式，执行“安装增强组件”或“更新 / 重新检查”。旧独立入口安装会迁移到原 EXE 入口。
4. 完成后使用原快捷方式，或点击“启动 Craft”。“修复组件”和“卸载挂载”的范围见 [Craft 安装说明](craft/README.md#安装更新与管理)。

更新面板分别处理 WebVideo+ Craft 与官方 Craft：增强更新经明确检查、下载和校验后打开 Setup，安装前仍需正常关闭 Craft；官方更新保留原来源、公钥和签名校验，确认后交接官方安装器。真实注册安装的跨版本 NSIS 升级仍待验收，新宿主需由明确兼容的增强包重新挂载。详见[更新说明](craft/update/README.md)。

### 本版维护修复

本轮维护完善了迁移、卸载、备份恢复和失败回滚的目录归属与事务处理；制作标记可保存，音乐配置增加并发校验与恢复副本，批量编辑及 Anogo 文本/条件语句处理也已修正。队列请求、子进程收尾和捕获等待加入有界处理，AI 批次保存本地检查点；对白等待按实际舞台/DOM 输出和文本状态判断。具体范围见对应发行说明。Craft 另完善了快照重试保留、队列终态清理、守护进程超时和安装恢复；[本轮验收边界](craft/ACCEPTANCE-1.1.15c.md)保留了具体覆盖。

## 数据与基线

故事由 Craft 原生文档与 VFS 管理，批量编辑通过原生事务提交；导出通过官方 `export_web` 生成临时快照，并核对源文件、文档及工程引擎绑定。

- 项目备份与制作标记：通过 Craft 工程存储适配层管理
- 成片音乐配置：项目根目录 `video-project.json`
- 内核配置、用户库与 AI 配置：适配目录的 `state/kernel/`
- 会话日志、导出快照和工作缓存：适配目录的 `state/sessions/<sessionId>/`
- 安装解压缓存：安装器高级设置选择的目录

当前 Craft 产品、安装器和内核版本以 [`craft/version.json`](craft/version.json) 为准，根 [`version.json`](version.json) 记录共享产品基线。宿主与工程运行时均按精确构建校验；自定义同版本包需单独适配。原 Terre 基线和历史发行说明继续作为来源与维护记录保留。

## 许可证

除 [`LICENSES.md`](LICENSES.md) 另有说明的第三方或独立许可材料外，**WebVideo+ 的原创源代码、构建脚本、项目特定实现和原创数据采用 Mozilla Public License 2.0（MPL-2.0）**，完整文本见 [`LICENSE`](LICENSE)。

仓库是混合来源项目，因此根许可证不会覆盖或替换其他权利人的既有条款。主要例外包括：Terre/WebGAL 上游代码仍按 MPL-2.0；`anogo-actions.factory.json` 中来自 Anogo 的默认动作词表继续按 AGPL-3.0；`js-yaml` 继续按 MIT；来自 `webgal-skill` 或其他公开/社区资料的已归属内容保留原有许可与署名。具体到路径和材料的映射见 [`LICENSES.md`](LICENSES.md)、[`NOTICE.md`](NOTICE.md) 和 [`licenses/THIRD-PARTY.md`](licenses/THIRD-PARTY.md)。

MPL-2.0 是文件级 copyleft：修改并分发受 MPL 覆盖的文件时，需要继续提供这些文件的源代码和 MPL 权利；它不会自动要求与 WebVideo+ 组合的所有独立文件或更大作品都采用 MPL。

## 开源项目引用与致谢

WebVideo+ 建立在多个开源项目、公开技术资料和社区贡献之上。以下分类区分“当前运行/构建依赖”“可选集成”和“研究参考”，避免把参考关系误写成直接捆绑关系。

### 核心上游与当前依赖

| 项目 | 本项目中的用途 |
| --- | --- |
| [OpenWebGAL/WebGAL_Terre](https://github.com/OpenWebGAL/WebGAL_Terre) | 编辑器基座；复用图形/文本编辑、素材管理、语句组件和预览通信。当前补丁基线为 4.6.4。 |
| [OpenWebGAL/WebGAL](https://github.com/OpenWebGAL/WebGAL) | 播放引擎、语句解析和导出运行资源的上游。 |
| [OpenWebGAL/WebGAL_Doc](https://github.com/OpenWebGAL/WebGAL_Doc) | WebGAL 语法、引擎和编辑器开发资料。 |
| [MicrosoftEdge/WebView2Samples](https://github.com/MicrosoftEdge/WebView2Samples) / [WebView2Feedback](https://github.com/MicrosoftEdge/WebView2Feedback) | WebView2 嵌入和原生宿主参考；当前导出核心使用微软 WebView2 SDK。 |
| [FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg) | 视频编码、媒体探测与音频混合。 |
| [nodejs/node](https://github.com/nodejs/node) | 可选 AI 运行环境和构建工具。 |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | 可选 AI 模块的模型服务、流式协议和多提供商适配基础；当前固定 0.1.5-rc.1。 |
| [earendil-works/pi](https://github.com/earendil-works/pi) | DSH 使用的 pi-ai 提供商目录、模型列表与协议实现；当前固定 pi-ai 0.85.1。 |
| [nodeca/js-yaml](https://github.com/nodeca/js-yaml) | Anogo YAML 导入使用的解析器，随包保留 MIT 许可。 |

### 可选集成与格式来源

| 项目 | 本项目中的用途 |
| --- | --- |
| [boomwwww/webgal-mygo](https://github.com/boomwwww/webgal-mygo) | 可选 MyGO 引擎、模型/口型和播放设置适配；WebVideo+ 不捆绑引擎或角色素材。 |
| [A-kirami/anogo](https://github.com/A-kirami/anogo) | 结构化故事格式与默认动作词表来源；WebVideo+ 仅提供导入适配。 |
| [SubtitleEdit/subtitleedit](https://github.com/SubtitleEdit/subtitleedit) / [TypesettingTools/Aegisub](https://github.com/TypesettingTools/Aegisub) | 推荐的外部字幕编辑器；WebVideo+ 仅通过系统文件关联打开用户已安装的软件，不捆绑其程序或源码。 |

### 工作流与研究参考

| 项目 | 参考关系 |
| --- | --- |
| [xxSak1xx/webgal-skill](https://github.com/xxSak1xx/webgal-skill) | 最初的工作流、助手提示词和高级演出特效资料的重要来源；当前工具不是其 MCP 写入链的直接封装。 |
| [floatDreamWithSong/webgal-tools](https://github.com/floatDreamWithSong/webgal-tools) | 早期资产扫描与场景读写方案研究；当前发布包不依赖其 MCP 服务。 |
| [microsoft/playwright](https://github.com/microsoft/playwright) / [electron/electron](https://github.com/electron/electron) | 早期浏览器自动化、捕获与导出原型研究。当前导出核心使用 C# + WebView2，不捆绑 Playwright 或 Electron 运行时。 |

React、Fluent UI、IconPark、TanStack Virtual、Zustand、Monaco Editor、PixiJS、pixi-filters、Popmotion、Redux Toolkit、localForage 以及 Live2D 显示库等主要通过 Terre/WebGAL 上游继承。WebVideo+ 会调用其现有接口，但不因此把这些项目改成 WebVideo+ 自有代码或统一许可。更完整的传递依赖以 Terre/WebGAL 4.6.4 的包清单与许可文件为准。

### 特别感谢

特别感谢 **北风的猫5306**。作为最初参考的 WebGAL 助手提示词作者，其资料提供了角色与素材使用说明、脚本编写思路和高级演出特效参考。默认滤镜与预制效果中有一部分由这些公开资料整理、分类并做兼容性修正而来；原作者贡献不会因为本项目的界面封装而被改写。相关入口见 [webgal-skill 的 references](https://github.com/xxSak1xx/webgal-skill/tree/main/references) 及其[原始致谢说明](https://github.com/xxSak1xx/webgal-skill#声明)。

也感谢提供滤镜资料、表格、基础角色映射，以及持续进行标准 Terre、MyGO 分发版和 Steam 版兼容性测试并逐项反馈问题的贡献者。

Live2D 模型、角色图像、背景、音乐、配音等素材权利仍归各自权利人，本安装包不因此取得或转授这些素材的权利。更完整的第三方来源与许可说明见 [NOTICE.md](NOTICE.md)、[LICENSES.md](LICENSES.md) 和 [licenses/THIRD-PARTY.md](licenses/THIRD-PARTY.md)。

原创文档、Logo 与品牌标识保留所有权利（ARR），代码仍按 MPL-2.0 提供；既有有效授权继续适用。见[许可范围](LICENSES.md)。
