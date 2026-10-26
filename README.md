# WebVideo+

面向 **WebGAL Terre 与 WebGAL Craft** 的视觉小说视频制作辅助工具：批量编辑、剧情导航、音乐配置、备份与检查、Anogo 故事导入，以及本机视频导出。Terre 与 Craft 使用各自的安装器，请先按宿主和引擎版本选择下载。

[选择安装器](#下载与版本选择) · [安装与开始使用](#安装与开始使用) · [功能与使用文档](#能做什么) · [构建说明](#文档与开发)

## 下载与版本选择

当前维护的正式版本：

| 使用环境 | 推荐版本（导出内核） | Windows 安装器 | 发行说明与校验 |
| --- | --- | --- | --- |
| Terre / WebGAL **4.6.4**，或 **MyGO 3.2.1** | **1.1.13**（0.6.62，4.6.4 稳定维护通道） | [WebVideo+-Setup-1.1.13.exe](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/v1.1.13/WebVideo%2B-Setup-1.1.13.exe) | [v1.1.13](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/v1.1.13) |
| Terre / WebGAL **4.6.6** | **1.3.6**（0.6.62） | [WebVideo+-Setup-1.3.6.exe](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/v1.3.6/WebVideo%2B-Setup-1.3.6.exe) | [v1.3.6](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/v1.3.6) |
| 官方 Windows x64 **Craft 1.0.0** | **Craft 1.2.0c**（安装器 1.2.0.0c，内核 0.6.61） | [WebVideoCraft-Setup-1.2.0.0c.exe](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/craft-v1.2.0.0c/WebVideoCraft-Setup-1.2.0.0c.exe) | [craft-v1.2.0.0c](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/craft-v1.2.0.0c) |

GitHub 全局 **Latest 当前指向 1.3.6**，请按上表的宿主和引擎选择；Craft 使用独立的 stable 通道。1.1.13、1.3.6 和 Craft 1.2.0.0c 的 SHA-256 写在各自发行正文中。下载后可用 PowerShell 的 `Get-FileHash -Algorithm SHA256 -LiteralPath <安装器路径>` 核对；发布状态、兼容范围与验证记录以对应发行页为准。

已 EOL 的 Terre 4.6.5、Craft RC1 / beta.2 的下载与兼容范围收纳于[历史版本说明](docs/LEGACY-VERSIONS.md)。

这些发布版的产品源码尚未合入 `main`；复现发布版时请检出对应标签，不要用 `main` 的开发基线代替。

## 安装与开始使用

### Terre / MyGO

本次修复较长安装缓存路径下的组件读取失败，以及导出窗口初始化被打断后可能持续等待设置的问题。MyGO 3.2.1 的 JSONL / WMDL 模型读取继续保留。安装器内置固定 BtbN FFmpeg 与 ffprobe，并使用分组 7z 压缩。

1. 保存工程并关闭 Terre，确认已有安装使用 WebGAL 4.6.4 / MyGO 3.2.1，还是 WebGAL 4.6.6。
2. 按上表下载对应的 `WebVideo+-Setup-*.exe`，运行并选择 Terre 安装目录。
3. 默认安装常用模块；高级选项可单独增删功能、设置数据与缓存目录。灰选模块是其他已选功能的依赖。
4. 安装完成后照常启动 Terre，在编辑器中使用 WebVideo+ 工具。

支持标准版及 Steam 版常见的 Terre 主程序命名。可选 MyGO 集成优先使用已有本机引擎，不捆绑角色素材或模型。安装器若发现 Craft 或混合产品目录，会停止写入并提示选择对应产品。

更新时重新运行对应通道的安装器；编辑器内的更新提示按可确认的引擎版本推荐兼容发行页。

Terre 卸载默认清理缓存，删除配置和用户数据需要单独勾选；已导出的 MP4 和 WebGAL 游戏工程本身不会删除。重要工程仍建议保留自己的备份。

FFmpeg 的对应源码与构建材料提供[独立下载](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/third-party-sources-ffmpeg-20260930-7zip-25.00/BtbN-FFmpeg-win64-gpl-9.0-20260930-source-materials.zip)，两条 Terre 维护线使用同一份材料；许可与来源说明见[固定版本文档](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.3.6/docs/FFMPEG-DISTRIBUTION.md)。WebView2 仍优先使用系统运行时，缺失时由微软引导程序安装。

### Craft

1. 准备官方 Windows x64 **Craft 1.0.0**，保存工程并正常关闭 Craft。
2. 运行上表中的 `WebVideoCraft-Setup-1.2.0.0c.exe`，选择 Craft 安装目录、原程序或快捷方式，执行“安装增强组件”或“更新 / 重新检查”。
3. 安装器安全保存并校验原程序，统一覆盖 **原 `webgal-craft.exe` 入口**；完成后继续使用原快捷方式。旧独立增强安装可迁移，已取消单独的增强启动模式。
4. 需要维护时重新运行安装器，可更新、修复或“卸载挂载”；卸载挂载保留组件、配置、日志和用户数据，不删除工程或视频。

Craft 会核验宿主与工程引擎的精确构建，同版本的自定义包不自动视为兼容。


新版本的更新面板分别处理两类更新：

- **WebVideo+ Craft 增强组件**：明确点击检查、下载、校验后打开普通 Setup；打开不代表安装完成。Craft 运行中会阻止覆盖安装，请先保存并正常关闭，再继续安装。
- **官方 Craft**：保留官方检查、下载源与签名校验，官方安装交接功能已开放；下载完成后需明确确认，再正常关闭 Craft 并交接官方安装器。来源、签名、反降级、安装归属与恢复保护仍保留。

当前允许列表包含精确的官方 Windows x64 **1.0.0** 构建，工程引擎支持 WebGAL 4.6.4 / 4.6.5 / 4.6.6 和 MyGO 3.2.1。官方安装交接已开放，真实注册安装的跨版本 NSIS 升级仍待验收。官方升级后需使用明确支持新宿主的增强安装器重新挂载；兼容范围继续由精确构建校验决定。

## 能做什么

- **编辑与演出**：批量 ID、表情、滤镜、`-next`、自动离场，以及分类预制效果
- **剧情与音乐**：剧情导航、区间选择、实际故事计时、多轨并行音乐与时长匹配
- **检查与恢复**：待核对标记、自动备份和确认回滚；Craft 的编辑操作复用原生文档事务与撤销
- **视频导出**：完整视频、舞台、对话框/DOM 或仅音轨导出；支持全篇、由本场景开始、仅本场景及语句选区。多场景按静态单向 `changeScene` 展开，不代表支持任意交互分支或循环
- **音频导出**：48 kHz WAV，包含剧本 BGM、语音、音效和视频原声，不包含 WebVideo+ 成片配乐替换
- **字幕后处理**：完整视频可附加 SRT / ASS / SSA，封装为 MP4 软字幕或通过 FFmpeg/libass 烧录；软字幕不保证保留复杂样式，内容和样式由外部编辑器制作
- **故事导入**：Anogo 文本 / JSON / YAML，可粘贴或从文件读取；实验性 AI 可将小说转换为可预览、待核对的剧本骨架。AI 需要自行配置 API Key，Terre 安装器默认不安装该可选组件

### 导出质量与舞台图层

导出默认使用 GPU Raw 管线。建议从 **1080p、推荐 / 高质量** 开始；完整视频的硬件编码器会探测 NVIDIA NVENC、AMD AMF、Intel Quick Sync，必要时回退 CPU x264。硬件 H.264 属于有损编码；“完全无损”指 RGB 视频流，文件可能很大，传统兼容管线则更慢。

舞台的 **“包含背景”与“包含立绘”可以独立勾选**，支持四种组合。有背景输出 MP4，无背景输出带 Alpha 的 MOV / WebM；两者都取消时，其他舞台效果仍保留，其余区域透明。“包含立绘”只控制 `changeFigure` 创建的对象画面，剧本命令、动作、等待与时长继续保留，不改写原工程。

兼容捕获格式按引擎区分：Terre 1.1.13 保留 JPEG；Terre 1.3.6 和 Craft 1.2.0c 提供 JPEG / PNG 选择，默认 JPEG。PNG 避免截图阶段的压缩，最终 H.264 仍为有损编码。4.6.6 的 animation v2 支持仅用于精确匹配的 4.6.6 运行时。

### 手动切点

Terre 在 **高级设置 → 分段切点** 启用“按指定语句强制切段”，可从时间线临时选择语句，或在剧本中独立写一行区分大小写的 `;CutHere`。临时选择在所选语句开始前切段；注释标记在其后下一条实际执行语句开始前切段。

手动模式合并两种来源，只在有效的指定位置切段，**不会自动补点**；有效切点为空时单段导出，并行数只限制同时执行的分片数。默认自动模式不使用这些标记。Craft 1.2.0c 的“高级导出设置”也支持语句选择、`;CutHere`，以及帧、秒或时间码切点。仅音轨导出不执行视频分段。手动切点不按自动安全策略移动，复杂动画、Live2D / Pixi 的接缝连续性仍需按工程检查。

### 缓存与 Live2D 内存

Terre 的工作缓存默认位于成片目录下的 `.webvideo-cache`；Craft 的快照和工作文件位于适配目录的 `state/sessions/<sessionId>/`，长期内核配置位于 `state/kernel/`。成功任务清理重型工作缓存，失败或取消任务保留必要的重试材料；清理失败会保留记录并提示处理。Craft 安装器的解压缓存与导出缓存分别管理。

1.1.13、1.3.6 和 Craft 1.2.0c 的新配置默认给每个并行渲染进程设置 **128 MiB 的 Live2D Cubism Core 初始内存**；已有显式设置（包括 `0`）保留。`0` 表示使用引擎默认值，手动范围为 16–1024 MiB，仅在加载 Core 时生效。实际内存占用可能更高，贴图显存另计；这项设置与磁盘工作缓存分别管理。

### Terre 共享素材与导出设置

1.1.10 / 1.3.4 新增可选的共享素材模块：项目与共享素材在同一页浏览；共享文件夹尚未登记时区域默认折叠，登记后展开。共享原件只读，复制到项目后编辑。旧正式版升级会补选模块，明确取消的选择保留。

创建游戏可选空白项目，并共享所选引擎 `game` 文件夹内的素材；勾选空白项目时默认同时共享引擎素材，可手动取消；素材来源跟随创建流程，手动目录仅覆盖素材来源。视频导出收集依赖到快照，游戏打包只在临时副本中复制素材和转换引用，打包结果可独立运行。

导出高级设置按用途整理，“精确文本框循环动画”默认关闭，需要精确呈现循环装饰时可开启。另新增渲染设备选择与诊断，改善模型选项、预览和可展开的错误提示，并可打开日志文件夹。Craft 1.2.0c 的正式版适配见对应发行说明。

## 文档与开发

- Terre 使用指南：[1.1.13](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.1.13/docs/USER_GUIDE.md) / [1.3.6](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.3.6/docs/USER_GUIDE.md)，含详细功能、数据目录、AI 配置及[手动切点说明](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.3.6/docs/USER_GUIDE.md#按语句指定导出切点)
- Craft：[安装与管理](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.2.0.0c/craft/README.md)、[功能范围](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.2.0.0c/craft/FEATURE-COVERAGE.md)、[导出说明](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.2.0.0c/craft/EXPORT-PARITY.md)和[本版验收](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.2.0.0c/craft/ACCEPTANCE-1.2.0c.md)
- 构建与发布：Terre [1.1.13](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.1.13/docs/BUILDING.md) / [1.3.6](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.3.6/docs/BUILDING.md)；Craft 见其安装与管理文档中的构建章节
- 当前分支的 [1.1.4 发行说明](docs/releases/RELEASE_NOTES_1.1.4.md)、[历史发行说明索引](docs/releases/README.md)、[变更记录](CHANGELOG.md)与[仓库结构](docs/REPOSITORY.md)

当前 `main` 的开发基线仍是 **1.1.4**（内部标识 **0.8.8**、安装器 Win32 版本 **1.1.4.0**、导出内核 **0.6.48**），以 [`version.json`](version.json) 为准。版本标签中的文档保留部分开发、候选和历史测试记录；是否正式发布、当前更新策略及验证边界请以上表的发行页为准。

从源码构建不需要先下载旧版安装器；第三方输入按官方来源及 SHA-256 锁定，支持缓存和离线重新准备。Terre 的常用构建入口是 `prepare-build.ps1`、`build.ps1`、`build-product.ps1`，Craft 另用 `craft/build-craft-package.ps1`。请先检出对应发布标签，再按该标签的构建说明操作；根 `version.json` 与 Craft 的 `craft/version.json` 分别记录相应版本。

## 许可证与致谢

WebVideo+ 原创源代码、构建脚本和原创数据采用 **[MPL-2.0](LICENSE)**。

原创文档（包括 README、CHANGELOG、原创使用/构建指南等）及 `WebVideo+_icon.svg`、`WebVideo+_icon.ico` 保留所有权利（ARR）；项目名称、商标和品牌标识不随代码许可证授予使用许可。具体边界见[许可范围映射](LICENSES.md#reserved-original-documentation-logo-and-brand-identifiers)。既有有效授权继续适用，法律允许的使用不受本声明限制。

仓库包含混合来源材料，根许可证不会覆盖第三方原有条款；Anogo 默认动作词表继续采用 AGPL-3.0，js-yaml 采用 MIT，其他材料以[许可范围映射](LICENSES.md)、[来源说明](NOTICE.md)和[第三方许可](licenses/THIRD-PARTY.md)为准。

感谢 WebGAL / Terre / Craft、FFmpeg、WebView2、DeepSeek Harness、pi-ai、Anogo、webgal-skill 及社区贡献者，特别感谢北风的猫5306 提供的工作流与演出资料。[完整引用与致谢](docs/USER_GUIDE.md#开源项目引用与致谢)保留了来源和用途说明。角色、Live2D、音乐等素材的权利仍归各自权利人。
