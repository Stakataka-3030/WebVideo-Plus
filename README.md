# WebVideo+

面向 WebGAL Terre 的视觉小说视频制作辅助工具。提供批量编辑、剧情导航、音乐配置、备份/检查、结构化故事导入与视频导出；生成式 AI 组件为可选 Beta，需要自行配置 API Key。

[下载安装器](https://github.com/Stakataka-3030/WebVideo-Plus/releases/latest) · [0.5.3 发行说明](RELEASE_NOTES_0.5.3.md) · [版本记录](CHANGELOG.md) · [构建说明](BUILDING.md) · [MPL-2.0](LICENSE) · [许可范围](LICENSES.md) · [来源与许可](NOTICE.md)

**当前源码版本：1.0.1（开发中；安装器内部版本 1.0.1.0，导出内核 0.5.3）。** 最新正式安装器、校验值和发布说明以 [GitHub Releases](https://github.com/Stakataka-3030/WebVideo-Plus/releases/latest) 为准。

当前适配基线为 **Terre 4.6.4**；对前端被重新打包但挂载语义未变化的 4.6.4 变体，会使用结构锚点检查而不是要求整份前端 bundle 哈希完全一致。

## 主要功能

- **批量编辑**：一键 ID 补全、预位表情调整、批量滤镜/修改已有滤镜、批量加 `-next`、自动离场等。
- **Video+ 预制效果**：按镜头、人物、转场、光色、天气等分类插入或追加演出语句，也可保存自用效果。
- **剧情导航**：按连续执行和目标整理主次组件，显示说话人、表情动作及命名滤镜/预制效果，点击即可定位编辑器与预览。
- **剧情选择与时间线工具**：辅助选择连续区间、整理剧情结构和导出范围。
- **音乐配置**：直接添加或拖入音频，可增加并行播放器行，按文字/放映速度匹配故事时长。
- **导出视频**：读取预览速度，导出全文或连续区间；任务、进度和输出位置由本机服务管理。
- **导入 Anogo 故事**：接收粘贴文本及 JSON/YAML 文件，转换后追加故事；动作导入默认关闭，待核对项由作者检查。
- **检查与标记 / 备份与恢复**：提供制作提醒、待核对标签、历史备份与确认回滚；打开游戏和整十分钟自动备份分别保留最新一份。
- **游戏工具收纳**：可将场景分支、鉴赏和游戏控制等入口集中到“游戏工具”。

## 视频导出（0.5.x）

0.5.x 的默认导出已经从逐帧 JPEG CapturePreview 切换到 GPU Raw 管线：Pixi 按输出尺寸渲染，DOM/UI 通过三层缓存合入最终 framebuffer，再以 WebView2 SharedBuffer 把 RGBA 帧送入 FFmpeg。

导出面板提供三种模式：

- **NVENC**：支持 NVIDIA NVENC 的机器优先自动选择；速度最快、画质较高，但当前 H.264 CQ19 配置不是无损。
- **x264rgb**：RGB 视频无损，普遍可用于浏览器、Bilibili 上传和 Premiere 等工作流；文件较大，部分 Windows 自带播放器可能兼容性较差。
- **传统/兼容模式**：保留旧 JPEG → H.264 路径，用于 GPU Raw 出现兼容问题时回退。

并行数支持 1–32，但更多进程不一定更快。Planner 会按剧情安全点和 DOM workload 估算分配分片，且分片数不会超过有效 worker 数，避免额外 WebView2 冷启动。**1080p 是常规推荐档，1440p 适合需要更高输出分辨率的场景；4K 每帧像素量约为 1080p 的 4 倍，建议 2–4 worker。若原始背景、立绘或 Live2D 贴图本身不是 4K，通常不会获得更多真实细节。**

更完整的 0.4.10.2 → 0.5.3 变化见 [0.5.3 发行说明](RELEASE_NOTES_0.5.3.md)。

## 两轮基础舞台

“小说转剧本骨架”采用两轮基础舞台流程。第一轮标注正文和实际在场角色；第二轮前实时读取当前游戏素材，每个识别角色按名字/ID 别名关联路径并提供其全部有效 Live2D 入口文件，背景目录文件名也一并提供。

第二轮只选择真实路径及有限舞台状态，由程序生成基础背景和登离场：默认最多 1 人居中，可选最多 2 人且左右分列；不自动填写 motion/expression。未显示角色的对白不附加 figureId，作为画外音。两个阶段共用 60 分钟任务时限。

## AI 功能（实验性）

“小说转剧本骨架”可分批处理长文，支持粘贴或读取 TXT。模型只返回原文片段范围、对白/旁白类型、说话人和场景变化标记；程序要求连续无重复覆盖全部原文片段，并直接截取原文写入。第二轮补基础背景和人物调度，不自动安排表情动作、滤镜或特效。

结果先预览再追加，追加前自动备份，所有新增语句标记待核对。支持取消、批次进度显示和失败重试；不完整或无效输出拒绝写入。实际角色识别、场景判断和演出效果仍需作者检查。

提示词：`ai-runtime/novel-prompt.txt`；原文范围与转换规则：`browser/novel-core.js`。

### 可选 AI 接入

安装器主界面提供默认不勾选的“安装基于生成式 AI 的组件”。启用后可在配置栏填写 API Key；未启用时不会复制 AI 运行目录，原有制作功能无需 API Key。

当前 AI 附件固定使用 DSH 0.1.5-rc.1 与 pi-ai 0.85.1，并由 `package-lock.json` 锁定依赖；包含固定 Node 运行时。提供商目录支持常见 Key 服务自动带入地址，也可自定义 Responses、Chat Completions 或 Anthropic Messages 协议。

Key 通过 Windows 当前用户 DPAPI 加密，存于 `%LOCALAPPDATA%/WebVideoPlus/ai/providers.json`，不会回显给页面。连接测试由用户手动触发，会发送简短请求并可能产生费用；模型列表读取成功不代表实际生成请求一定兼容。

## 安装与模块管理

1. 从 [GitHub Releases](https://github.com/Stakataka-3030/WebVideo-Plus/releases/latest) 下载最新的 `WebVideo+-Setup-*.exe`。
2. 运行安装器并选择已有 **Terre 4.6.4** 安装目录。
3. 默认安装常用模块；在高级选项中可单独增删功能。灰选项目表示其他已选模块所需依赖。
4. 完成后照常启动 Terre。

安装器会记录实际 Terre 主程序文件名，因此兼容 `WebGAL_Terre.exe`、Steam 版的 `WebGAL Terre.exe`，以及只存在空格/下划线/连字符差异的唯一匹配名称。

模块拆卸会保留游戏、成片、历史备份和手动保存的库。关闭全部功能或使用“拆卸全部模块”可恢复原版入口。MyGO 为可选本机引擎，优先使用用户现有安装，不随本包捆绑角色素材或模型资源。

## 数据与基线

故事继续保存在 WebGAL 原有 TXT 中；批量操作前静默备份，不使用旧的 `.webvideo-plus/project.json`。

- 项目备份：项目内 `.webvideo-plus/backups/`
- 音乐配置：项目内 `video-project.json`
- 所有游戏共用的角色表：`%LOCALAPPDATA%/WebVideoPlus/character-map/characters.json`
- 手动滤镜：`%LOCALAPPDATA%/WebVideoPlus/filters/filters.json`
- 手动预制效果：`%LOCALAPPDATA%/WebVideoPlus/preset-effects/effects.json`
- Anogo 动作对应表：`%LOCALAPPDATA%/WebVideoPlus/anogo-actions/actions.json`

为保证 Terre 4.6.4 的补丁锚点可复现，仓库包含 `baseline/terre-4.6.4.js` 和 `baseline/local-baseline.json`。前者是固定 Terre 4.6.4 发布 bundle；后者保留建立基线时的校验元数据，其中 `baseHash` 会被当前构建脚本写入 `supportedOriginalBundleSha256`。`local-baseline.json` 中的旧 `kernel` 字段和旧文件哈希属于历史验证信息，不代表当前 WebVideo+ 内核版本；当前构建使用 `0.5.3`。

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