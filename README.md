# WebVideo+

面向 **WebGAL Terre 与 WebGAL Craft** 的视觉小说视频制作辅助工具：批量编辑、剧情导航、音乐配置、备份与检查、Anogo 故事导入，以及本机视频导出。Terre 与 Craft 使用各自的安装器，请先按宿主和引擎版本选择下载。

[选择安装器](#下载与版本选择) · [安装与开始使用](#安装与开始使用) · [功能与使用文档](#能做什么) · [构建说明](#文档与开发)

## 下载与版本选择

以下为 **2026-10-04 已发布的正式版本**：

| 使用环境 | 推荐版本 | Windows 安装器 | 发行说明与校验 |
| --- | --- | --- | --- |
| Terre / WebGAL **4.6.4**，或 **MyGO 3.2.1** | **1.1.7**（4.6.4 最终稳定通道） | [WebVideo+-Setup-1.1.7.exe](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/v1.1.7/WebVideo%2B-Setup-1.1.7.exe) | [v1.1.7](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/v1.1.7) |
| Terre / WebGAL **4.6.5** | **1.2.0** | [WebVideo+-Setup-1.2.0.exe](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/v1.2.0/WebVideo%2B-Setup-1.2.0.exe) | [v1.2.0](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/v1.2.0) |
| 官方 Windows x64 **Craft 1.0.0-beta.2** | **Craft 1.1.12c**（安装器 1.1.12.0c） | [WebVideoCraft-Setup-1.1.12.0c.exe](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/craft-v1.1.12.0c/WebVideoCraft-Setup-1.1.12.0c.exe) | [craft-v1.1.12.0c](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/craft-v1.1.12.0c) |

GitHub 全局 **Latest 当前指向 1.2.0**，不适合所有用户：WebGAL 4.6.4 / MyGO 3.2.1 仍推荐 1.1.7；Craft 使用独立的 stable 通道。下载后可用对应发行页的 `.sha256` 文件核对安装器；发布状态、兼容范围与验证记录均以该版本发行页为准。

这些发布版的产品源码尚未合入 `main`；复现发布版时请检出对应标签，不要用 `main` 的开发基线代替。

## 安装与开始使用

### Terre / MyGO

1. 保存工程并关闭 Terre，确认已有安装使用 WebGAL 4.6.4 / MyGO 3.2.1，还是 WebGAL 4.6.5。
2. 按上表下载对应的 `WebVideo+-Setup-*.exe`，运行并选择 Terre 安装目录。
3. 默认安装常用模块；高级选项可单独增删功能、设置数据与缓存目录。灰选模块是其他已选功能的依赖。
4. 安装完成后照常启动 Terre，在编辑器中使用 WebVideo+ 工具。

支持标准版及 Steam 版常见的 Terre 主程序命名。可选 MyGO 集成优先使用已有本机引擎，不捆绑角色素材或模型。安装器若发现 Craft 或混合产品目录，会停止写入并提示选择对应产品。

Terre 卸载默认清理缓存，删除配置和用户数据需要单独勾选；已导出的 MP4 和 WebGAL 游戏工程本身不会删除。重要工程仍建议保留自己的备份。

### Craft

1. 准备官方 Windows x64 **Craft 1.0.0-beta.2**，保存工程并正常关闭 Craft。
2. 运行上表中的 `WebVideoCraft-Setup-1.1.12.0c.exe`，选择 Craft 安装目录、原程序或快捷方式，执行“安装增强组件”或“更新 / 重新检查”。
3. 安装器安全保存并校验原程序，统一覆盖 **原 `webgal-craft.exe` 入口**；完成后继续使用原快捷方式。旧独立增强安装可迁移，已取消单独的增强启动模式。
4. 需要维护时重新运行安装器，可更新、修复或“卸载挂载”；卸载挂载保留组件、配置、日志和用户数据，不删除工程或视频。

Craft 会核验宿主与工程引擎的精确构建，同版本的自定义包不自动视为兼容。

**原公开 1.1.3c 测试版需要手动下载并安装新版本完成首次升级**，它没有新增的 WebVideo+ Craft 自身更新模块。

新版本的更新面板分别处理两类更新：

- **WebVideo+ Craft 增强组件**：明确点击检查、下载、校验后打开普通 Setup；打开不代表安装完成。Craft 运行中会阻止覆盖安装，请先保存并正常关闭，再继续安装。
- **官方 Craft**：保留官方检查、下载源与签名校验，官方安装交接功能已开放；下载完成后需明确确认，再正常关闭 Craft 并交接官方安装器。来源、签名、反降级、安装归属与恢复保护仍保留。

当前实际验证宿主为 **1.0.0-beta.2**，尚无更新的真实签名目标完成跨版本升级验收。官方升级后需使用明确支持新宿主的增强安装器重新挂载；不承诺未来 Craft 版本自动兼容，也不会用旧备份覆盖新宿主。

## 能做什么

- **编辑与演出**：批量 ID、表情、滤镜、`-next`、自动离场，以及分类预制效果
- **剧情与音乐**：剧情导航、区间选择、实际故事计时、多轨并行音乐与时长匹配
- **检查与恢复**：待核对标记、自动备份和确认回滚；Craft 的编辑操作复用原生文档事务与撤销
- **视频导出**：完整视频、舞台、对话框/DOM 或仅音轨导出；支持全篇、由本场景开始、仅本场景及语句选区。多场景按静态单向 `changeScene` 展开，不代表支持任意交互分支或循环
- **音频导出**：48 kHz WAV，包含剧本 BGM、语音、音效和视频原声，不包含 WebVideo+ 成片配乐替换
- **字幕后处理**：完整视频可附加 SRT / ASS / SSA，封装为 MP4 软字幕或通过 FFmpeg/libass 烧录；软字幕不保证保留复杂样式，内容和样式由外部编辑器制作
- **故事导入**：Anogo 格式的 JSON / YAML，可粘贴文本或从文件读取；实验性 AI 可将小说转换为可预览、待核对的剧本骨架。AI 需要自行配置 API Key，Terre 安装器默认不安装该可选组件

### 导出质量与舞台图层

导出默认使用 GPU Raw 管线。建议从 **1080p、推荐 / 高质量** 开始；完整视频的硬件编码器会探测 NVIDIA NVENC、AMD AMF、Intel Quick Sync，必要时回退 CPU x264。NVENC 的高质量 H.264 属于有损编码；“完全无损”指 RGB 视频流，文件可能很大，传统兼容管线则更慢。

舞台的 **“包含背景”与“包含立绘”可以独立勾选**，支持四种组合。有背景输出 MP4，无背景输出带 Alpha 的 MOV / WebM；两者都取消时，其他舞台效果仍保留，其余区域透明。“包含立绘”只控制 `changeFigure` 创建的对象画面，剧本命令、动作、等待与时长继续保留，不改写原工程。

### Terre 1.1.7 / 1.2.0 的手动切点

在 **高级设置 → 分段切点** 启用“按指定语句强制切段”，可从时间线临时选择语句，或在剧本中独立写一行区分大小写的 `;CutHere`。临时选择在所选语句开始前切段；注释标记在其后下一条实际执行语句开始前切段。

手动模式合并两种来源，只在有效的指定位置切段，**不会自动补点**；没有有效切点就单段导出，并行数只限制同时执行的分片数。默认自动模式不使用这些标记。此处为 Terre 版功能，当前 Craft 导出界面未提供语句手动切点入口。手动切点不按自动安全策略移动，复杂动画、Live2D / Pixi 的接缝连续性仍需按工程检查。

## 文档与开发

- Terre 使用指南：[1.1.7](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.1.7/docs/USER_GUIDE.md) / [1.2.0](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.2.0/docs/USER_GUIDE.md)，含详细功能、数据目录、AI 配置及[手动切点说明](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.2.0/docs/USER_GUIDE.md#按语句指定导出切点)
- Craft：[安装与管理](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.12.0c/craft/README.md)、[功能范围](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.12.0c/craft/FEATURE-COVERAGE.md)和[导出说明](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.12.0c/craft/EXPORT-PARITY.md)
- 构建与发布：Terre [1.1.7](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.1.7/docs/BUILDING.md) / [1.2.0](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.2.0/docs/BUILDING.md)；Craft 见其安装与管理文档中的构建章节
- 当前分支的 [1.1.4 发行说明](docs/releases/RELEASE_NOTES_1.1.4.md)、[历史发行说明索引](docs/releases/README.md)、[变更记录](CHANGELOG.md)与[仓库结构](docs/REPOSITORY.md)

当前 `main` 的开发基线仍是 **1.1.4**（内部标识 **0.8.8**、安装器 Win32 版本 **1.1.4.0**、导出内核 **0.6.48**），以 [`version.json`](version.json) 为准。版本标签中的文档保留部分开发、候选和历史测试记录；是否正式发布、当前更新策略及验证边界请以上表的发行页为准。

从源码构建不需要先下载旧版安装器；第三方输入按官方来源及 SHA-256 锁定，支持缓存和离线重新准备。Terre 的常用构建入口是 `prepare-build.ps1`、`build.ps1`、`build-product.ps1`，Craft 另用 `craft/build-craft-package.ps1`。请先检出对应发布标签，再按该标签的构建说明操作；根 `version.json` 与 Craft 的 `craft/version.json` 分别记录相应版本。

## 许可证与致谢

WebVideo+ 原创源代码、构建脚本和原创数据采用 **[MPL-2.0](LICENSE)**。仓库包含混合来源材料，根许可证不会覆盖第三方原有条款；Anogo 默认动作词表继续采用 AGPL-3.0，js-yaml 采用 MIT，其他材料以[许可范围映射](LICENSES.md)、[来源说明](NOTICE.md)和[第三方许可](licenses/THIRD-PARTY.md)为准。

感谢 WebGAL / Terre / Craft、FFmpeg、WebView2、DeepSeek Harness、pi-ai、Anogo、webgal-skill 及社区贡献者，特别感谢北风的猫5306 提供的工作流与演出资料。[完整引用与致谢](docs/USER_GUIDE.md#开源项目引用与致谢)保留了来源和用途说明。角色、Live2D、音乐等素材的权利仍归各自权利人。
