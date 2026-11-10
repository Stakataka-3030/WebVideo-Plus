# Craft 1.2.3c 发布候选

状态：未发布，等待最终提交 CI 与正式包身份记录。产品 1.2.3c，安装器 1.2.3.0c，Win32 1.2.3.0，内核 0.6.67；共享产品基线 1.3.10 与内部开发标识 0.9.8 不变。本次合并此前未发布的 1.2.2c 改动与本轮通用移植。2026-11-10 已完成下文所列精确本地候选的真实宿主验收；该结果不代表另一份 CI 构建或正式发布包同字节通过。

## 合并此前未发布的 1.2.2c 改动

- Live2D 表情请求跨 await / destroy 的生命周期保护，只等待当前请求，保留失败缓存重选与原生重试，真实 20 秒超时明确报错。详见[表情安全说明](../docs/LIVE2D-EXPRESSION-SAFETY.md)。
- 导出副本跳过游戏自动快速存档，减少回溯记录复制和排队存储开销；原工程、正常游戏自动存档与手动存档保留。详见[自动存档修复](../docs/AUTOSAVE-PLANNING.md)。
- sceneOnly 在适用条件下保留前文和目标场景，以合成注释边界结束 planning，在资源扫描、复制和媒体准备前裁去后文；恢复、预热、锚点及取整架构不变。analysisOnly、范围选择、BGM-fit、自定义音乐时间线等保守回退和尾部音频限制见[sceneOnly 说明](../docs/scene-only-tail.md)。不承诺固定提速倍数、零预取或实测显存下降。
- Craft 五类导出配置入口保持原有被动读取，增加 16 项入口回归，不将 Terre 特有的自动打开预览问题写成 Craft 修复。
- Windows 监听兼容检查改用原生 listener-only 表，仍校验 loopback、唯一拥有进程及宿主祖先，不放宽权限。详见[监听校验说明](LISTENER-VERIFICATION.md)。

[1.2.2c 开发记录](RELEASE-1.2.2c.md)保留旧候选和阶段性证据，不作为单独已发布版本或本轮最终包验收。

## 本轮通用移植范围

- Ogg Vorbis / Opus BGM 支持 LOOPSTART、LOOPEND / LOOPLENGTH、LOOPSAMPLERATE 标签，先播放前奏，再循环指定段。对采样点/标签范围做检查；不合法标签回退整段循环。
- FFmpeg aloop 后重建样本时间戳，偏移和裁切按实际 PCM 时钟执行，避免帧时间戳间隙导致末尾静音。
- 后台计时、规划与导出 WebView 静音，不改变混音输出。保留原运行语言、启动选项与舞台准备行为。
- ID 补全默认不覆盖已有身份。多套在场角色或共享说话人别名保持原样并提示，不静默猜选。明确位置能唯一定位时仍可补全。
- 保留 Craft VFS、原生编辑/撤销、默认槽位替换、未知立绘身份保留及图片差分分支。没有复制 LoveLive 引擎、GLTF、特定角色前缀或便携安装。
- 计时读取保存的 sourceHash，旧请求缺失该字段时读取规范化快照计算；保留 Craft 的运行语言及工程上下文。

## 初期后台验证边界（历史记录）

下述限制及结果对应最初后台阶段，后续获授权的本机宿主验收单列在本文件末尾，不改写阶段性结果。

当时仅运行后台 Node 回归、C# 非 GUI 检查与合成 FFmpeg 数值测试。不打开浏览器或 Craft，不移动焦点，不进行前台验收；后续补测允许离线生成候选安装器，但不运行安装器入口或真实宿主，也不发布。历史 1.2.2c 验收不计作此候选验证。

具体后台结果在本文件结尾记录。

## 2026-11-10 后台验证记录

- 根 build.ps1：成功编译当前 Craft 源码的原生内核、process guard 与 launcher，并记录源码/SDK/输出哈希。仅复用已核验的历史正式包 WebView2 SDK DLL，没有沿用旧内核或安装器。编译器现有 CS4014/CS0414 警告保留。
- 合成 FFmpeg 音频：8 组 PCM / Opus / Vorbis（48 kHz、44.1 kHz，含 700 ms 偏移）全部得到精确 96000 样本，无静音填充。
- 生产 C# 循环标签解析：16 项通过；实际编译内核的计时哈希：4 项通过，含清理快照后仍返回排队时哈希。
- 生产资源扫描/路径解析：114 项通过；设置恢复/合法长路径检查通过；运行状态持久化 28 项通过；导出诊断 33 项通过；实际子进程管道/关闭/期限检查 21 项通过。
- Craft 组合功能预检：177 项通过。此预检不包含真实宿主/界面验收，也不替代最终安装器验证。
- 导出诊断初次在深层工作树路径运行触及 Windows 长路径边界；改用独立短临时证据目录后 33 项全部通过，没有更改产品代码绕过该测试。
- 整体 Node 回归不运行 tests/ci-npm-cache.test.mjs：其真实 npm fixture 可能触发外网访问，本轮按后台/离线边界整文件排除。其余可执行套件和正常 fixture 缺失跳过数另列下方；不得将其称为无跳过的全量通过。
- 最后一次共享/Craft Node 运行：1125 项，1110 通过，0 失败，15 跳过（14 项需单独配置官方 4.6.6 运行时 fixture；1 项需官方 Nest 集成 fixture）。此外整个 ci-npm-cache.test.mjs 未运行，如上说明。命令：`node --test --test-concurrency=2`，文件列表为 tests 与 craft/tests 的 *.test.mjs，排除该 npm 文件。
- 实际结果文件位于本地忽略目录 `.build/common-port-evidence/`，不提交测试数据。这些后台测试未证明 GPU、真实 Craft 宿主或正式安装器行为；后续本机宿主结果见下文，正式安装器图形流程仍未验收。

## 后续无图形后台补测

- 已找到并校验本地官方 4.6.6 完整模板，补跑两个官方行为测试文件共 16 项全部通过，原先 14 项缺 fixture 跳过已补齐。
- 完整旧 Craft 1.2.2c 缓存 12307 文件按 manifest 验证，110 个 AI 依赖与当前锁逐项一致，6 个外部原始输入按当前依赖锁验证；当前 AI 源码、提示词及原生组件重新构建。标准压缩候选构建和全嵌入文件静态校验通过，没有执行安装器或宿主。
- 只读 DXGI 枚举与选择逻辑 52 项通过，不代表实际 GPU 渲染验证。Craft 独立存储 8 项通过。
- 初轮候选隔离 CLI 七步、38 断言通过：旧版安装、升级、重复安装、缺失内核修复、卸载、当前版重装、最终卸载；原宿主字节恢复，合成用户状态保留。后续通用桥修复重新打包后的关键事务结果单独保存在本地证据目录。
- 真实官方 4.6.6 Nest + 当前 Craft 内核验证通用共享桥：无 .webvideo-plus 的初始工程完成首次制作标记、重载、精确长文本、备份及并发冲突拒绝。共享桥针对 Nest 缺失目录返回 500 改为从父目录证明缺失，不吞掉未知 500、畸形列表或普通文件冲突。
- Craft 实际界面不加载该 Terre 共享桥，仍用自身本地存储/VFS 和原生事务；Nest 合同通过不是 Craft 真实宿主验收。
- 本轮新增 21 个首次保存/空备份/错误/工程切换回归，Focused 共 58 项通过；tracked Nest 测试补全 AbortController。产品引擎、GLTF、便携安装范围不变。
- 最新构建哈希、静态闭包、CLI 结果及测试日志保存在 `.build/craft-background-20261110/`，不提交缓存或测试数据。当时尚未进行实际 Craft 窗口、GPU 导出及官方更新图形流程验收；后续本机窗口和短导出结果见下文，官方更新图形流程仍未验收。
- 更新后整套共享/Craft Node（官方 4.6.6 fixture 已启用，整文件排除 npm 网络 fixture）：1146 项，1145 通过、0 失败、1 项 opt-in Nest 默认跳过；该 Nest 合同已另在隔离真实服务中通过。

## 致谢与来源

感谢 [NijiharaTsubasa](https://github.com/NijiharaTsubasa) 的 LoveLive 适配及性能排障贡献，尤其是 planning 阶段自动存档热点的反馈和禁用后加速的验证线索。本轮从 PR #34 相关工作中筛选适用于当前产品的通用音频、后台静音和编辑安全改进，按 Craft 原生事务与 VFS 结构移植；未移植 LoveLive 引擎、GLTF 或便携安装功能。既有上游与第三方署名保持不变。

## 2026-11-10 本机精确候选宿主验收

本次在普通权限下使用官方 Craft 1.0.0，记录只对应以下本地候选，不对应后续重新构建的 CI 或正式安装器：

- 源码提交：`f4527338fb8b885cbb873d23db32df2ea330b0a6`。
- 本地 EXE：`WebVideoCraft-Setup-1.2.3.0c.exe`，112891392 字节，SHA-256 `8e6504f95087883ee255a25c411a5307f04bdb15f81ba25c56db4d3d250cb776`。
- MANIFEST SHA-256：`222999cc72d5184bab8d4d60a7467b167253b127edf6477125d8c163761c4ffd`。
- 官方宿主 SHA-256：`0de472c44f642c8f140e16bcc040a171519af59d245ae88b1b4a47987cf2756c`。
- 启动与注入、创建/编辑/保存、原生 undo/redo 五个精确断言、VFS 实际预览通过；短导出完成 H.264 NVENC 1280×720、30 fps、165 帧、5.5 秒，完整解码退出码 0。
- 初次 Ctrl+R/F5 没有实际重载，原始记录仍保留 NOT VERIFIED。后续通过真实 `Page.reload` 验证执行上下文 2→3、`reinjected` 事件、增强 UI/bridge 和唯一样式节点恢复，单独补验通过。
- 正常关闭、卸载与官方宿主原字节恢复通过；补验清理结果为自有进程 0、监听 0，窗口状态恢复，无新增引擎。未操作用户下载终端。
- 本机导出 WebView2 为 `157.0.4341.42`；旧 CI 环境为 `156.0.4314.58`，两者不等同。本机成功不改变 CI run 42771540376 因无 native CDP listener 失败的事实。

原始证据仅在验收工作树的忽略目录保留，不作为公开下载链接：
`.build/craft-background-20261110/artifact-identity.json`、`.build/craft-local-20261110/FINAL-LOCAL-RESULTS.json`、`.build/craft-local-20261110/export-result.json`、`.build/craft-reload-20261110/reload-result.json`、`.build/craft-reload-20261110/session-final.log`、`.build/craft-reload-20261110/cleanup-result.json`。本段为这些精确证据的可追溯摘要；不覆盖官方 NSIS 跨版本注册升级、安装器 GUI 或完整长片音视频。

## 当前 CI 与正式发布边界

远端启动官方 Craft/编辑器宿主、CDP 注入及正常关闭 gate 已移除，独立 host-port diagnostic 的自动与手动 workflow 入口也已删除；诊断源码和历史失败记录保留，不继续进行该环境实验。其余构建、完整包校验、逻辑/运行状态、原生 WebView 导出/readiness/capture、scene-tail、像素和音频 gate 保留，失败及 NA 不改写为通过。

标准候选 artifact `webvideo-craft-windows-test-installer` 只在剩余 gate 成功后产生，并附精确身份及 coverage 元数据；其中 `CI_BUILD_NATIVE_VERIFIED` 仅指 CI 构建和原生回归，真实编辑器宿主覆盖明确为 `NOT_RUN_IN_CI`，`releaseAccepted` 为 false。详细契约见 [CI 覆盖与退役宿主检查](tests/CI-HOST-SMOKE.md)。最终提交 CI、正式 EXE 哈希、公开下载与更新通道结果将独立记录，目前不声明已发布。官方 NSIS 跨版本注册升级继续保持未验收。
