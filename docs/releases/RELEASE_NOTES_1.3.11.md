<!-- webvideo-compat: {"product":"terre","webgal":["4.6.6"]} -->
# WebVideo+ Terre 1.3.11

状态：已于 2026-11-10 发布：[v1.3.11](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/v1.3.11)。适用 Terre / WebGAL 4.6.6（含受支持的 Steam 入口）。产品 1.3.11，安装器 1.3.11.0，导出内核 0.6.67，内部开发标识 0.8.17。

本页汇总相对已公开 1.3.9 的改动：此前 1.3.10 尚未发布，其功能一并纳入 1.3.11，不要求先安装 1.3.10。

## 正式包验证

[正式包 QA CI](https://github.com/Stakataka-3030/WebVideo-Plus/actions/runs/42792138714) 通过。正式安装器已通过官方 4.6.6 文件级 CLI、普通/便携安装及正式载荷三引擎原生回归。下方候选验收保留为发布前历史记录。

## 导出与编辑

- 修复导出副本中已请求 Live2D 表情跨 await / destroy 的生命周期问题，只等待当前请求，不等待全量预取完成、不固定 sleep；真实 20 秒超时明确报错，失败缓存再次请求时不漏报，保留原生重试。详见[表情安全说明](../LIVE2D-EXPRESSION-SAFETY.md)。
- 导出任务副本跳过游戏自动快速存档，减少复制回溯记录和排队写入存储的开销。原工程、正常游戏自动存档与手动存档保留。详见[自动存档修复](../AUTOSAVE-PLANNING.md)。
- 视频、舞台、对话框、音轨和 SRT 五类弹窗打开时仅被动查看现有预览状态，不自动重开预览，也不把默认速度标为实时读取。明确重读或真正提交时仍读取实际设置；需要打开预览前在顶部显示告知。关闭弹窗或切换项目后丢弃旧异步状态，POST 前失效不入队；已经发出的 POST 不承诺取消。
- “仅本场景”（sceneOnly）在满足条件时保留全部前文与目标场景，用合成注释标记在目标边界结束 planning，不执行 end 清场；在资源扫描、快照复制和媒体准备前裁去后文，实际预演与 GPU lookahead 不再接收被省略的后文。详见[sceneOnly 尾部边界](../scene-only-tail.md)。
- ID 补全默认不覆盖已有 ID；多套在场立绘时不猜测对白关联，同名说话人仅在候选唯一时补全。保留图片差分、槽位效果前瞻和共享别名，角色出厂映射表及别名数据未改。
- 导出识别 Opus / Vorbis 循环标签，重复片段在偏移与时长裁剪前重建采样时间戳，避免以补静音掩盖短缺；离线预演与渲染保持静音。
- 计时结果优先读取排队及重试时保存的 sourceHash，源快照清理后仍可核验；共享素材显示库名，允许来源的资源错误响应保留 CORS 头，非允许来源仍拒绝。

## 安装与保存

- Terre 便携安装移至默认收起的高级设置，默认关闭；已安装模式保持锁定。移动目录后重新解析便携路径、实例与任务，保留常规安装和 Steam 宿主识别。
- FFmpeg 更新加入有界重试与旧工具恢复。
- 修复官方 Terre 在新工程缺少制作配置目录时返回 500 导致的首次保存失败；通过父目录的 `dirInfo/isDir` 严格确认缺失后再创建。空备份历史不再误报服务错误，权限错误、畸形响应、文件占位和并发冲突仍拒绝操作。

普通编辑与导出布局不变。通用修复来自 4.6.4 LoveLive 开发分支的选择性移植，**本线不引入 LoveLive 引擎、3D 模型、动作或资源协议**；Craft 不增加便携安装。保留 4.6.5 / 4.6.6 兼容保护、animation v2、JPEG / PNG 兼容捕获和预览语言启动配置，不扩大宿主允许范围。

## 发布前验证记录

完整记录见[1.3.11 发布前验收记录](../verification/common-port-466-20261110.md)。以下证据分开记录，不将本地包与 CI 包当作同一文件。

| 项目 | 结果与范围 |
| --- | --- |
| 精确源码 CI | `b322164aa37731aed532847fcb59501579e050a7` 的 [run 42771529086](https://github.com/Stakataka-3030/WebVideo-Plus/actions/runs/42771529086) 成功 |
| 原生图形与 sceneOnly | CI 中三个 WebGAL 引擎夹具的 JPEG / PNG 六组 readiness、captureFault、autosave 和 scene-tail 门槛通过；用于回归，不扩大发行通道兼容范围 |
| 本地 Node / Nest | 469 通过、0 失败、1 个默认 opt-in Nest 跳过；真实 Nest 合同另行通过；整个 npm-cache 测试文件因既有网络限制未在本机运行 |
| 音频数值回归 | PCM / Opus / Vorbis、48 kHz / 44.1 kHz、起点及偏移共 8 组，均输出恰好 96,000 样本；不是完整剧情音视频同步验收 |
| 本地安装候选 | 正常分组压缩、实际解包/篡改拒绝/取消/重试、长路径、便携及常规安装/移动/升级/模式锁/保留数据卸载通过；无 ExportSmoke 的安装夹具不能代替真实宿主 GUI |

本地验收包为 `dist/WebVideo+-Setup-1.3.11.exe`，97,352,704 字节，SHA-256 `54d26b4c43603f0f8e52a58b68b0633fc5df96766cc2881d5596c5a8a04cd0ab`。CI scene-tail 使用该次 CI 保留的正式安装器载荷，SHA-256 `90ae28d9d6034795a452ef66e4ac2fa7d89ce380ca251dcd68a6694ba030284f`；该门槛验证解包载荷，未运行安装器入口。公开安装器与本段历史候选为不同文件，下载见页首发行链接。

## 保留的边界

sceneOnly 仅在自动 / 手动计时、没有行范围选择且具备可裁尾边界时应用。analysisOnly、range、BGM-fit、非空自定义 musicTimeline、手动切点引用省略后文，以及非 sceneOnly 等情况沿用旧路径；末场景保持原样。前文恢复、预热、锚点及旧取整方式不变。首次全文解析仍可能产生 HTML prefetch，不能承诺后文请求为零；不足一帧的尾部声音不保证与旧完整计划完全相同。

未完成完整约 24 分钟含音视频成片、当前最终包的全部真实宿主 / Steam 入口 GUI、自动 anchor 策略、专有 Live2D SDK 像素和实测显存降低验收，不承诺固定提速倍数。本机导出诊断夹具创建 junction 曾被权限拒绝，未绕过；CI 的对应检查另行通过。历史失败与旧候选结果保留在验收记录中。

## 致谢与构建材料

感谢 [NijiharaTsubasa](https://github.com/NijiharaTsubasa) 的 LoveLive 适配工作，以及 planning 自动存档性能热点反馈与排障线索。本线仅选择性吸收通用优化，不含 LoveLive 引擎接入。

仅 CI 的依赖缓存补齐可回退至官方来源并按 SRI 校验，锁文件不变，不执行 lifecycle 脚本，不改用户 npm 或网络设置。固定 BtbN FFmpeg 与 7-Zip 的源码及许可获取说明见[第三方源码发行](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/third-party-sources-ffmpeg-20260930-7zip-25.00)。
