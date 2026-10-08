# WebVideo+ 使用指南

面向 WebGAL Terre 的视觉小说视频制作辅助工具。提供批量编辑、剧情导航、音乐配置、备份/检查、结构化故事导入与视频导出；生成式 AI 组件为可选 Beta，需要自行配置 API Key。

[下载安装器](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/v1.3.0) · [1.3.0 发行说明](releases/RELEASE_NOTES_1.3.0.md) · [版本记录](../CHANGELOG.md) · [构建说明](BUILDING.md) · [MPL-2.0](../LICENSE) · [许可范围](../LICENSES.md) · [来源与许可](../NOTICE.md)

**当前发行分支源码：1.3.0（内部开发标识 0.9.2；安装器 Win32 版本 1.3.0.0，导出内核 0.6.55）。** 最新正式安装器、校验值和发布说明以 [GitHub Releases](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/v1.3.0) 为准。

当前适配基线为 **Terre / WebGAL 4.6.6**。4.6.5 最终稳定版使用 1.2.1，4.6.4 使用 1.1.7；按各版本发行说明选择安装包。

## 主要功能

- **批量编辑**：一键 ID 补全、预位表情调整、批量滤镜/修改已有滤镜、批量加 `-next`、自动离场等。
- **Video+ 预制效果**：按镜头、人物、转场、光色、天气等分类插入或追加演出语句，也可保存自用效果。
- **剧情导航**：按连续执行和目标整理主次组件，显示说话人、表情动作及命名滤镜/预制效果，点击即可定位编辑器与预览。
- **剧情选择与时间线工具**：辅助选择连续区间、整理剧情结构和导出范围。
- **音乐配置**：直接添加或拖入音频，可增加并行播放器行，按文字/放映速度匹配故事时长。
- **导出视频**：读取预览速度，导出全文或连续区间；任务、进度和输出位置由本机服务管理。
- **字幕后处理（可选模块）**：导出完成后封装 SRT/ASS/SSA 软字幕或通过 FFmpeg/libass 烧录；可按视频起点、WebGAL 时间线语句、后处理音乐或手动时间定位。字幕内容和样式交给 Subtitle Edit、Aegisub 等外部编辑器处理。
- **导入 Anogo 故事**：接收粘贴文本及 JSON/YAML 文件，转换后追加故事；动作导入默认关闭，待核对项由作者检查。
- **检查与标记 / 备份与恢复**：提供制作提醒、待核对标签、历史备份与确认回滚；打开游戏和整十分钟自动备份分别保留最新一份。
- **游戏工具收纳**：可将场景分支、鉴赏和游戏控制等入口集中到“游戏工具”。

## 视频导出

完整视频选择“传统 / 兼容”后，可在“兼容截图格式”中选择 JPEG（默认）或 PNG（无损截图）。PNG 避免截图阶段的 JPEG 压缩，传输和处理数据量更大；最终 H.264 视频仍有损。切换到其他画质档会禁用此选项并保留选择，舞台、对话框和音轨导出沿用各自管线。命令行使用 `--gpu-raw-export traditional --compatibility-capture-format png`。

当前默认导出使用 GPU Raw 管线：Pixi 按输出尺寸渲染，DOM/UI 通过三层缓存合入最终 framebuffer，再以 WebView2 SharedBuffer 把 RGBA 帧送入 FFmpeg。0.5.4 起，编码质量与具体硬件编码器分离，默认不再把非 NVIDIA 用户自动导向 RGB 真无损。

导出质量现在放在主导出界面，与分辨率、帧率同级，不需要展开高级设置：

- **推荐 / 高质量**：默认档。自动并行探测 NVIDIA NVENC、AMD AMF、Intel Quick Sync；可用时使用硬件 H.264，不可用时回退 CPU x264。适合大多数成片，兼顾高画质、较小体积和导出速度。
- **超高质量**：使用同一套自动编码器，但进一步降低压缩损失，适合后期编辑或对压缩痕迹敏感的场景；文件会更大。
- **完全无损**：使用 `libx264rgb -crf 0` 的 RGB 真无损视频，**文件可能特别大**；仅建议需要像素级保真或特殊后期时使用，部分 Windows 自带播放器兼容性较差。
- **传统 / 兼容**：保留旧 JPEG CapturePreview → H.264 路径，用于 GPU Raw 出现兼容问题时回退，**导出速度明显变慢**。

硬件编码器在任务开始前会做一次实际 FFmpeg 预检；导出过程中若硬编仍因驱动或设备问题失败，会保持原画质档自动回退 CPU x264，而不是回退到无损 x264rgb。

导出工作缓存与任务历史已经分离。安装器高级设置允许分别选择 **WebVideo+ 数据目录、导出工作缓存目录、安装缓存目录**；默认位置仍可直接使用。数据目录保存设置、任务历史、日志和 WebVideo+ 用户库，切换目录时会先停止服务、复制并校验内容，成功后再切换；工作缓存和安装缓存则对后续任务/下载生效。

分片视频、素材快照、混音 WAV 和 WebView2 profile 写入工作缓存目录；默认使用成片目录下的 `.webvideo-cache`。成功导出或时间分析完成后会自动删除重型工作缓存，失败或取消任务保留必要分片以便重试；WebView2 profile 在规划/渲染进程结束后立即清理。临时导入音乐在建任务时复制到任务缓存，服务会回收不再使用的上传副本。

安装/更新仍保留严格校验；若 Terre 文件、启动程序或历史安装记录与预期不一致，安装器不会直接锁死，而会提供显式的 **强制修复**。强制操作先建立事务性临时回滚副本，成功后立即删除。用户可选择是否长期保留另一份 Terre 原始文件恢复备份；该长期备份默认开启并放在所选 WebVideo+ 数据目录内，也可关闭。

点击“卸载 WebVideo+”会弹出清理选项：默认勾选“删除 WebVideo+ 缓存和临时文件”，默认不勾“删除 WebVideo+ 配置和用户数据”。后者包括设置、任务历史、日志、自动备份、项目内 WebVideo+ 成片音乐配置、滤镜/角色映射/预制效果/AI 配置和长期恢复备份。两项都勾选可完整清理 WebVideo+ 产生的数据；**已导出的 MP4 与 WebGAL 游戏工程本身不会删除**。安装状态不一致时同样可以显式选择强制拆卸。

并行数支持 1–32，但更多进程不一定更快。自动切点模式下，Planner 会按剧情安全点和 DOM workload 估算分配分片，且分片数不会超过有效 worker 数，避免额外 WebView2 冷启动。手动切点模式下，切点决定分片数，并行数只决定同时执行多少片。**1080p 是常规推荐档，1440p 适合需要更高输出分辨率的场景；4K 每帧像素量约为 1080p 的 4 倍，建议 2–4 worker。若原始背景、立绘或 Live2D 贴图本身不是 4K，通常不会获得更多真实细节。**

### 舞台图层导出

“导出舞台”包含两个独立选项，默认都勾选：

- **包含背景**：保留背景并输出 MP4；取消后输出带 Alpha 的 MOV / WebM
- **包含立绘**：位于“包含背景”下方；取消后仅排除 `changeFigure` 创建的画面，包括图片、GIF、Live2D、Spine 及它们的入场/退场过渡

四种组合都可使用。两个选项都取消时，立绘与背景以外的舞台效果仍保留，其余区域透明。隐藏立绘只影响最终像素：剧本命令、素材加载、模型更新、动作与等待全部照常执行，因此同一任务配置下勾选/取消“包含立绘”的时间线与成片帧数一致。此选项不会删除或改写原工程的 `changeFigure` 命令，也不会把立绘透明度设为 0。

### 按语句指定导出切点

展开导出面板的 **高级设置 → 分段切点**，选择 **按指定语句强制切段**。完整视频、舞台和对话框导出均支持；仅音轨没有视频分段。默认仍是自动模式，剧本里的切点标记不会偷偷切换模式。

#### 临时选择：只影响本次导出

点击 **从时间线选择切点语句…**，在现有时间线选择窗口里拖拽、Ctrl 多选或 Shift 选择多条语句。切点视图会显示完整可执行语句，包括平时导航里隐藏的等待、变量等技术指令；注释不作为临时语句选项。

确认选择会启用手动模式，并在**每条所选语句开始之前**切段。导出面板列出原始行号和内容，可以重新选择或清除；取消选择窗口保留先前的临时选择。它不会修改剧本，也不会作为其他项目的全局偏好保存。清除临时选择仍保持手动模式，剧本标记继续有效。

临时选择记录场景路径、完整语句边界和剧本校验值。选择后修改剧本、切换到另一份文稿或改变多行语句边界，会要求重新选择，不会把旧行号静默移到别的语句。排队任务保存当时的语句锚点和场景快照，重试使用对应快照。

#### 永久标记：保存在剧本里

在需要切段的位置**独立写一行** `;CutHere`：

```text
A:上一段的对白;
;CutHere
B:下一段从这条语句开始;
```

它是 WebGAL 的普通注释，不影响引擎正常播放。导出器在**其后下一条实际执行的语句之前**切段；中间的空行、其他注释或在已批准资源清理中跳过的语句不生成独立切点。标记区分大小写，允许行首/行尾空白；`; CutHere`、`;CutHere 说明`、行内同名文字、多行对白内部的同名文字都不是标记。

**标记只在手动模式生效。** 自动模式会显示当前场景识别到的标记数量作提示，但不使用它们。手动导出时会读取本次静态故事链各场景中的标记，而不只读取当前编辑器打开的场景。

#### 两种来源如何合并

临时选择与剧本标记兼容，统一按实际语句执行时间转换成帧、排序并去重。两种方式指向同一帧时只切一次；连续 `-next` 语句如果落在同一输出帧，也不会制造零帧片段。帧转换为 `ceil(全局执行毫秒 × fps / 1000 − 1e−7)`，其中 `1e−7` 是浮点误差容差。实际切点帧在时长分析后写入任务诊断和成片 JSON，不再要求手算时间或帧号。

全篇、由本场景开始、仅本场景和精确选区使用同一批语句边界，然后取本次输出范围内的切点。范围外的切点、已有起点/终点、`end` 边界及末尾没有后续可执行语句的标记是有诊断的空操作，不生成空分段。**没有任何有效切点时就是一整段，不会退回自动。**

启用后只采用明确指定的边界，**不会增加自动切点，也不会因为 Live2D / Pixi、随机状态、交互、动画、最短分片长度或预热成本而移动、拒绝或删减有效切点**。保留现有尽力恢复/重放，但不保证接缝连续性；严格切片和装饰性 Pixi 自动策略不影响手动边界。缺失素材、引擎执行错误、内存不足、编码失败等正常错误仍会报告。手动切点不会新增非线性脚本支持；原本无法自动执行的交互指令仍按现有扫描规则报告。

有 N 个不同切点就有 N+1 个任务。并行数为 1 时依次执行全部分片；并行数大于分片数时不再增加切点。任务 `segment-plan.json` 和成片旁的 JSON 记录临时锚点、标记来源、原始场景/行号、实际相对/全局帧和忽略原因。缓存签名包含请求的临时锚点和已解析计划，避免误用另一组切点的旧分片。

当前故事链是静态、单向 `changeScene` 展开，不因此支持重复 `callScene` 或循环。来源映射若包含重复场景，临时锚点按明确的出现序号定位（当前编辑器选择记为第 1 次），脚本标记则随每次出现分别解析，不把一次临时选择扩张成所有出现。

旧数字切点仅保留 **CLI / API / 已排队任务兼容**：例如 `--segment-cut-mode manual --manual-cut-points "300,12.5s,00:20"`。兼容输入可与标记合并，仍使用旧的输出相对帧规则及范围校验。新导出面板不再提供数字编辑框，也不会隐式带入已保存的旧数字切点；有旧值时会明确提示。只用剧本标记的 CLI 可传 `--segment-cut-mode manual`，不需要 `--manual-cut-points`。原有 `--mode manual` 是对白等待模式，与切点模式无关。

1.3.0 的改动见[发行说明](releases/RELEASE_NOTES_1.3.0.md)与[版本记录](../CHANGELOG.md)；此前版本见[发行说明索引](releases/README.md)。

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

Key 通过 Windows 当前用户 DPAPI 加密，存于所选 **WebVideo+ 数据目录**下的 `user-data/ai/providers.json`；旧版 `%LOCALAPPDATA%/WebVideoPlus` 数据在首次使用新结构时会尽量导入，不会回显给页面。连接测试由用户手动触发，会发送简短请求并可能产生费用；模型列表读取成功不代表实际生成请求一定兼容。

## 安装与模块管理

1. 从 [GitHub Releases](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/v1.3.0) 下载最新的 `WebVideo+-Setup-*.exe`。
2. 运行安装器并选择已有 **Terre 4.6.4** 安装目录。
3. 默认安装常用模块；在高级选项中可单独增删功能，并可选择 WebVideo+ 数据目录、导出工作缓存、安装缓存以及是否保留长期 Terre 恢复备份。灰选项目表示其他已选模块所需依赖。
4. 完成后照常启动 Terre。

安装器会记录实际 Terre 主程序文件名，因此兼容 `WebGAL_Terre.exe`、Steam 版的 `WebGAL Terre.exe`，以及只存在空格/下划线/连字符差异的唯一匹配名称。

卸载默认只清理缓存，是否同时删除 WebVideo+ 配置和用户数据由卸载弹窗单独选择；关闭全部功能或卸载可尽量恢复原版入口，安装记录不一致时可显式选择强制拆卸。MyGO 为可选本机引擎，优先使用用户现有安装，不随本包捆绑角色素材或模型资源。

## 无 Live2D 工程

纯文字、静态图片与音频工程不需要 Live2D SDK。实际引用 Live2D 模型，或模型来源无法静态确认时，当前 WebGAL 4.6.4 的组合插件仍要求 `live2d.min.js` 和 `live2dcubismcore.min.js` 两份库；缺库继续阻止导出。SDK 需由使用者按其许可自行提供，WebVideo+ 不为测试伪造或附带这些库。

## 内置字体

内置导出运行时的 `WebgalUI` 保留 WebGAL 4.6.4 原始 OPPO Sans v1.00 字体及 CSS，不替换为另一套字体；资源圆体和思源宋体仍按原样提供。字体来源及公开授权解释见 [运行资源说明](../licenses/WEBGAL-RUNTIME-SOURCES.md)。注入 Terre 的普通界面文字和表单控件继承宿主字体；脚本差异预览保留宿主等宽字体。自定义工程 CSS、模板字体和预览选择仍由各自设置决定，不据此宣称所有工程的预览与导出已像素一致。

## 数据与基线

故事继续保存在 WebGAL 原有 TXT 中；批量操作前静默备份，不使用旧的 `.webvideo-plus/project.json`。

- 项目备份：项目内 `.webvideo-plus/backups/`（完整卸载并选择删除用户数据时可一并清理）
- 成片音乐配置：项目根目录 `video-project.json`（由 WebVideo+ 生成；只有完整卸载时明确勾选“删除配置和用户数据”才删除）
- 角色表、手动滤镜、预制效果、Anogo 动作表与 AI 配置：所选 WebVideo+ 数据目录下的 `user-data/`
- 任务历史、设置与日志：所选 WebVideo+ 数据目录
- 导出重型临时文件：所选导出工作缓存目录
- 安装下载、解包和运行依赖缓存：所选安装缓存目录

为保证 Terre 4.6.4 的补丁锚点可复现，仓库包含 `baseline/terre-4.6.4.js` 和 `baseline/local-baseline.json`。前者是固定 Terre 4.6.4 发布 bundle；后者保留建立基线时的校验元数据，其中 `baseHash` 会被当前构建脚本写入 `supportedOriginalBundleSha256`。`local-baseline.json` 中的旧 `kernel` 字段和旧文件哈希属于历史验证信息，不代表当前 WebVideo+ 内核版本；当前构建以根目录 `version.json` 的 `kernelVersion` 为准。

## 许可证

除 [`LICENSES.md`](../LICENSES.md) 另有说明的第三方或独立许可材料外，**WebVideo+ 的原创源代码、构建脚本、项目特定实现和原创数据采用 Mozilla Public License 2.0（MPL-2.0）**，完整文本见 [`LICENSE`](../LICENSE)。

仓库是混合来源项目，因此根许可证不会覆盖或替换其他权利人的既有条款。主要例外包括：Terre/WebGAL 上游代码仍按 MPL-2.0；`anogo-actions.factory.json` 中来自 Anogo 的默认动作词表继续按 AGPL-3.0；`js-yaml` 继续按 MIT；来自 `webgal-skill` 或其他公开/社区资料的已归属内容保留原有许可与署名。具体到路径和材料的映射见 [`LICENSES.md`](../LICENSES.md)、[`NOTICE.md`](../NOTICE.md) 和 [`licenses/THIRD-PARTY.md`](../licenses/THIRD-PARTY.md)。

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

Live2D 模型、角色图像、背景、音乐、配音等素材权利仍归各自权利人，本安装包不因此取得或转授这些素材的权利。更完整的第三方来源与许可说明见 [NOTICE.md](../NOTICE.md)、[LICENSES.md](../LICENSES.md) 和 [licenses/THIRD-PARTY.md](../licenses/THIRD-PARTY.md)。
