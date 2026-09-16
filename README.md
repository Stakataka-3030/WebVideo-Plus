# WebVideo+

面向 WebGAL Terre 的视觉小说视频制作辅助工具。生成式 AI 组件为可选 Beta，需要自行配置 API Key。

[构建说明](BUILDING.md) · [版本记录](CHANGELOG.md)

**当前源码版本：产品 0.4.10；安装器修订 0.4.10.2。** 0.3.18 为已冻结的历史功能基线。

> 0.4.10.2 安装器暂未公开发布；当前正在处理兼容性问题，修复并完成验证后再发布。

WebVideo+ 面向使用 WebGAL Terre 制作视觉小说视频的作者，复用现有编辑器、素材和预览，提供批量编辑、剧情导航、音乐配置与视频导出。AI 接入是可选附件；原有制作功能无需 API Key。

## 两轮基础舞台

第一轮标注正文和实际在场角色，第二轮前实时读取该游戏素材。每个识别角色按名字/ID 别名关联路径，提供其全部有效 Live2D 入口文件；不按服装、季节、稀有度筛选。背景目录文件名全部提供。第二轮只选择真实路径及有限舞台状态，程序生成背景/登离场：默认最多 1 人居中，开关允许最多 2 人且双人左右分列。不填写 motion/expression。未显示角色的对白不附加 figureId，作为画外音。两个阶段共用 60 分钟任务时限。

## AI 功能（实验性）

“小说转剧本骨架”自动分批处理长文，粘贴或读取 TXT。模型只输出原文片段的编号范围、对白/旁白类型、说话人和场景变化标记；第一轮不返回重写正文，第二轮补基础背景和人物调度，不安排表情动作、滤镜或特效。程序要求连续无重复覆盖所有原文片段，并直接截取原文写入；布局符号和符合严格条件的已知角色纯对白引导语可省略，其他叙述保留。先预览再追加，追加前备份，所有新语句标记待核对。支持取消，生成任务总时限 60 分钟，适配器请求及流空闲时限同步放宽；显示实际批次进度，不完整或无效输出拒绝写入。实际角色识别、场景判断仍需作者检查。

提示词：`ai-runtime/novel-prompt.txt`；原文范围与转换规则：`browser/novel-core.js`。

## 可选 AI 接入

安装器主界面提供默认不勾选的“安装基于生成式 AI 的组件”，可后续补装或拆卸。启用后在配置栏打开“填写 API Key”。从 DSH 使用的固定 pi-ai 目录提供 32 个 Key 提供商条目，常见 Key 服务自动带入地址；需账号授权或专属云配置的提供商不列入此页。也可自定义地址与 Responses、Chat Completions 或 Anthropic Messages 协议。

本阶段使用 DSH 模型/多提供商层执行固定的小说标注任务，不提供聊天或开放式 agent 循环。保存 Key 与连接测试分开；测试由用户手动触发，会发送一个简短请求，可能收费。Key 通过 Windows 当前用户 DPAPI 加密，存于 `%LOCALAPPDATA%/WebVideoPlus/ai/providers.json`，不回显给页面。读取模型列表可能来自内置目录，成功不等于连接测试已通过。

AI 附件随安装包离线提供，固定 DSH 0.1.5-rc.1、pi-ai 0.85.1 及 package-lock；包含 Node 运行时。未启用时不复制 AI 运行目录。构建阶段已验证模块可加载，未调用用户模型；实际 Key/网关兼容由用户配置后检查。

## 安装与模块管理

计划发布的安装器文件名为 `WebVideo+-Setup-0.4.10.2.exe`，面向已有 Terre 4.6.4 安装目录。0.4.10.2 当前尚未公开发布；兼容性问题修复并验证后再提供下载。

高级选项按现有功能分别提供：剧情导航、导出片段选择、剧情实际时间、一键 ID 补全、预位表情调整、批量滤镜、修改已有滤镜、批量加 `-next`、自动离场、Video+ 预制效果、配置导出音乐、导入 Anogo 故事、检查与标记、备份与恢复/自动备份、导出视频、游戏工具收纳。

勾选安装，取消勾选拆卸。灰选项是已选功能需要的依赖；先取消依赖它的功能，才能拆卸。批量写入工具依赖备份与恢复，避免拆掉恢复入口却继续修改故事。角色对应表和公共库随需要它们的本机服务提供。旧版“表情与滤镜”会迁移为相应独立功能，保留已有选择。

模块拆卸保留游戏、成片、历史备份和手动保存的库。关闭全部功能或使用“拆卸全部模块”可恢复原版入口。MyGO 3.2.1 是可选的本机引擎，优先使用已安装版本，不随本包捆绑。

## 功能与入口

WebVideo+ 分为批量操作、导入与导出、其他三个分组，按钮每列最多三行。场景分支、鉴赏和游戏控制可收纳到“游戏工具”。

- **一键 ID 补全**：全文补充立绘和对话 ID，并转换相关效果目标；默认覆盖已有 ID，遵循角色在场状态。
- **预位表情调整**：为所选对话准备切换立绘语句，沿用当前角色设置，由作者逐句调整；默认跳过已有语句，支持强制追加与待核对标记。
- **批量滤镜/修改已有滤镜**：追加滤镜，或更换、删除已识别滤镜覆盖的参数。默认保留其他效果，整句删除需明确勾选。默认库按分类折叠，手动保存单列“手动添加”。
- **批量加 `-next`/自动离场**：按类型和范围补充连续执行参数；同位置换入不同角色时，可在登场前补充旧角色离场。
- **Video+ 预制效果**：分类选取镜头、人物、转场、光色、天气等效果；常规演出入口追加至尾部，“本句前插入句子”入口插入指定位置。配置中可用必填的名称与语句追加自用效果。
- **剧情导航**：按连续执行和目标整理主次组件，显示说话人、表情动作及命名滤镜/预制效果；点击定位编辑器与预览。
- **配置导出音乐**：直接添加或拖入音频，可增加并行播放器行；保持音频长度，按所选文字/放映速度匹配故事时长。
- **导出视频**：读取预览速度，导出全文或一个连续区间；进度、任务和输出位置由本机服务管理。
- **导入 Anogo 故事**：接收粘贴文本及 JSON/YAML 文件，转换后追加故事；动作导入默认关闭，待核对项由作者检查。
- **检查与标记/备份与恢复**：制作提醒、待核对标签、带时间的历史备份与确认回滚。打开游戏和整十分钟自动备份分别保留最新一份。

## 数据与基线

故事仍保存在原有 TXT，批量操作前静默备份；不使用旧的 `.webvideo-plus/project.json`。

- 项目备份：项目内 `.webvideo-plus/backups/`。
- 音乐配置：项目内 `video-project.json`。
- 所有游戏共用的角色表：`%LOCALAPPDATA%/WebVideoPlus/character-map/characters.json`。
- 手动滤镜：`%LOCALAPPDATA%/WebVideoPlus/filters/filters.json`。
- 手动预制效果：`%LOCALAPPDATA%/WebVideoPlus/preset-effects/effects.json`。
- Anogo 动作对应表：`%LOCALAPPDATA%/WebVideoPlus/anogo-actions/actions.json`。

为保证对 Terre 4.6.4 的精确补丁锚点可复现，仓库包含 `baseline/terre-4.6.4.js` 和 `baseline/local-baseline.json`。前者是固定的 Terre 4.6.4 发布 bundle；后者保留建立基线时的校验元数据，其中 `baseHash` 会被当前构建脚本读取并写入 `supportedOriginalBundleSha256`。`local-baseline.json` 中的 `kernel` 和旧文件哈希属于建立基线时的历史验证信息，不代表当前 WebVideo+ 内核版本；当前构建使用 `0.3.14-internal`。

本阶段按作者约定完成语法、编译和安装检查，具体播放、演出观感和作品导出由作者验收。编译成功不等于所有预设均经过实机播放测试。构建入口为 `build-product.ps1`。

## 开源项目引用与致谢

感谢以下项目的作者和维护者。下表区分当前使用、继承的基础设施，以及早期调研工具，避免把参考关系误写成捆绑关系。

| 项目 | 本项目中的用途 |
| --- | --- |
| [OpenWebGAL/WebGAL_Terre](https://github.com/OpenWebGAL/WebGAL_Terre) | 编辑器基座，复用图形/文本编辑、语句组件、素材管理和预览通信。 |
| [OpenWebGAL/WebGAL](https://github.com/OpenWebGAL/WebGAL) | 播放引擎、语句解析与演出模型；导出复用其渲染。 |
| [OpenWebGAL/WebGAL_Doc](https://github.com/OpenWebGAL/WebGAL_Doc) | 语法、引擎与编辑器开发资料。 |
| [boomwwww/webgal-mygo](https://github.com/boomwwww/webgal-mygo) | 可选 MyGO 引擎、相关模型/口型和播放设置适配；不捆绑引擎或角色素材。 |
| [xxSak1xx/webgal-skill](https://github.com/xxSak1xx/webgal-skill) | 最初的工作流参考、助手词和特效库资料来源。当前工具不是对其 MCP 写入链的直接封装。 |
| [floatDreamWithSong/webgal-tools](https://github.com/floatDreamWithSong/webgal-tools) | 早期资产扫描与场景读写方案研究；当前安装包不依赖其 MCP 服务。 |
| [A-kirami/anogo](https://github.com/A-kirami/anogo) | 结构化故事格式和默认动作词表的来源。仅提供导入适配，完整创作功能请使用 Anogo。 |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | AI 接入层的模型服务、流式协议及多提供商适配器，固定 0.1.5-rc.1。 |
| [earendil-works/pi](https://github.com/earendil-works/pi) | DSH 使用的 pi-ai 提供商目录、地址、模型列表与协议实现，固定 0.85.1。 |
| [nodeca/js-yaml](https://github.com/nodeca/js-yaml) | 随包使用的 YAML 解析器，保留 MIT 许可。 |
| [FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg) | 本机视频编码、音频探测与混音；具体构建遵循其自身许可。 |
| [microsoft/WebView2Samples](https://github.com/microsoft/WebView2Samples)、[MicrosoftEdge/WebView2Feedback](https://github.com/MicrosoftEdge/WebView2Feedback) | WebView2 嵌入技术的官方示例/支持资料；本包使用微软 WebView2 SDK，示例仓库不等于运行时本身。 |
| [facebook/react](https://github.com/facebook/react)、[microsoft/fluentui](https://github.com/microsoft/fluentui)、[bytedance/IconPark](https://github.com/bytedance/IconPark) | 复用 Terre 的组件、界面控件与图标。 |
| [TanStack/virtual](https://github.com/TanStack/virtual)、[pmndrs/zustand](https://github.com/pmndrs/zustand)、[microsoft/monaco-editor](https://github.com/microsoft/monaco-editor) | 复用编辑器的列表、状态与文本编辑基础。 |
| [pixijs/pixijs](https://github.com/pixijs/pixijs)、[pixijs/filters](https://github.com/pixijs/filters)、[Popmotion/popmotion](https://github.com/Popmotion/popmotion) | 随原引擎使用的画面渲染、滤镜与动画基础。 |
| [OpenWebGAL/pixi-live2d-display-webgal](https://github.com/OpenWebGAL/pixi-live2d-display-webgal)、[guansss/pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | 原引擎 Live2D 显示集成及其上游。 |
| [reduxjs/redux-toolkit](https://github.com/reduxjs/redux-toolkit)、[localForage/localForage](https://github.com/localForage/localForage) | 复用游戏预览设置状态和持久化机制。 |
| [nodejs/node](https://github.com/nodejs/node)、[microsoft/TypeScript](https://github.com/microsoft/TypeScript)、[vitejs/vite](https://github.com/vitejs/vite) | 构建脚本及上游项目开发工具链。 |
| [microsoft/playwright](https://github.com/microsoft/playwright)、[electron/electron](https://github.com/electron/electron) | 早期浏览器自动化、捕获与导出原型研究；当前导出核心使用 C#/WebView2，不捆绑旧 Electron 原型。 |

更完整的上游传递依赖以 [Terre 的包清单](https://github.com/OpenWebGAL/WebGAL_Terre/blob/4.6.4/packages/origine2/package.json) 和 [WebGAL 的包清单](https://github.com/OpenWebGAL/WebGAL/blob/4.6.4/packages/webgal/package.json) 及其许可文件为准。致谢不改变第三方代码、SDK、素材和工具各自的许可；Anogo、js-yaml 及引用资料的现有许可/来源说明随包保留。

### 特别感谢

特别感谢 **北风的猫5306**，作为最初参考的 WebGAL 助手提示词作者，提供了角色与素材使用说明、脚本编写思路和高级演出特效资料。默认滤镜与预制效果中有一部分由这些资料整理、分类并做兼容性修正而来，原作者贡献不因本项目的界面封装而改变。相关资料入口见 [webgal-skill 的 references](https://github.com/xxSak1xx/webgal-skill/tree/main/references) 及其[原始致谢说明](https://github.com/xxSak1xx/webgal-skill#声明)。

也感谢提供滤镜文档、表格和基础角色映射，以及持续试用并逐项提出修正意见的贡献者。Live2D 模型、角色图像、背景、音乐等素材权利仍归各自权利人，本安装包不因此取得或转授素材权利。
