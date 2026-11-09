<!-- webvideo-compat: {"product":"terre","webgal":["4.6.6"]} -->
# WebVideo+ 1.3.10

适用：Terre / WebGAL 4.6.6（含受支持的 Steam 入口）。安装器 1.3.10.0，导出内核 0.6.66。本页记录源码改动和验证边界，最终发行包结果单独记录。

## 本次改动

- 修复导出副本中已请求 Live2D 表情跨 await / destroy 的生命周期问题，只等待当前请求，不等待全量预取完成、不固定 sleep；真实 20 秒超时明确报错，失败缓存再次请求时不漏报，保留原生重试。详见[表情安全说明](../LIVE2D-EXPRESSION-SAFETY.md)。
- 导出任务副本跳过游戏自动快速存档，减少复制回溯记录和排队写入存储的开销。原工程、正常游戏自动存档与手动存档保留。详见[自动存档修复](../AUTOSAVE-PLANNING.md)。
- 视频、舞台、对话框、音轨和 SRT 五类弹窗打开时仅被动查看现有预览状态，不自动重开预览，也不把默认速度标为实时读取。明确重读或真正提交时仍读取实际设置；需要打开预览前在顶部显示告知。关闭弹窗或切换项目后丢弃旧异步状态，POST 前失效不入队；已经发出的 POST 不承诺取消。
- “仅本场景”（sceneOnly）在满足条件时保留全部前文与目标场景，用合成注释标记在目标边界结束 planning，不执行 end 清场；在资源扫描、快照复制和媒体准备前裁去后文，第二次导航的实际预演与 GPU lookahead 不再接收被省略的后文。前文恢复、预热和锚点架构保持不变。详见[sceneOnly 尾部边界](../scene-only-tail.md)。

感谢 [NijiharaTsubasa](https://github.com/NijiharaTsubasa) 提供 planning 阶段自动存档性能热点的反馈及禁用后加速的验证线索。

## sceneOnly 的适用边界

仅自动 / 手动计时、没有行范围选择且具备可裁尾边界时应用。analysisOnly、range、BGM-fit、非空自定义 musicTimeline、手动语句切点引用省略后文，以及非 sceneOnly 等情况沿用旧路径；末场景保持原样。首次全文静态解析仍可能产生 HTML prefetch，不能据此承诺后文网络请求为零或实测显存降低。保持旧整数毫秒与帧取整，旧完整计划在不足一帧的尾部可能引入的后文声音不保证完全相同。

这不是通用剧情解释器或前文状态恢复重构，不改动源工程，也不扩大产品、宿主或引擎允许范围。提速取决于工程和运行环境，不承诺固定倍数。

## 验证范围

| 项目 | 记录与边界 |
| --- | --- |
| 表情安全 | 开发阶段完成已知插件的生命周期 / 缓存 / 错误合约及 9 项时钟回归；4.6.5 的逐文件 SHA 校验壳仅用于合约，不等同完整运行 |
| sceneOnly 逻辑 | sceneOnly 独立实现阶段通过 C# 97 项及三线源码 overlay 检查、Node 99 项、官方 4.6.6 纯函数 oracle 和 1600 项 Bounds 对照，并经过独立审核；这些是源码与逻辑验证，不能代替移植后最终提交的原生验证。 |
| sceneOnly 原生画面与声音 | 真实像素、PCM 和并发 renderer gate 按引擎分别记录在对应发行页的最终提交验收中，不以源码或旧候选结果替代；自动 anchor 策略、专有 Live2D SDK 像素及实测显存降低未验证 |
| 配置弹窗 | 五类弹窗的读取、告知和异步失效范围如上；最终包实际入口验收单独记录 |
| 旧候选实测 | 旧候选 [5f0de0de](https://github.com/Stakataka-3030/WebVideo-Plus/commit/5f0de0de20b0c89fd964eb43bbe1b4488e61705e)（[run 42624766204](https://github.com/Stakataka-3030/WebVideo-Plus/actions/runs/42624766204)）曾完成 550 行完整预演（1460.7 秒、runtimeParity=true）及 15 秒 / 450 帧静音渲染，未改动语句、未回退引擎。这些是合入本轮新增功能前的历史候选结果，不是最新最终包验收，也不代表完整长片音视频或其他宿主通过。 |
| 旧候选 CLI | 两条 Terre 共 184 项、Craft 73 项 CLI 断言属于此前候选；不计作本轮最终包的安装、升级或恢复通过 |
| 最终提交与发行包 | 精确提交、最终 CI、正式 EXE、UI / 安装 / 导出、公开下载与更新通道以[发行验收记录](https://github.com/Stakataka-3030/WebVideo-Plus/releases)为准；各项独立记录 |

完整约 24 分钟含音视频导出、Craft 官方 NSIS 跨版本注册升级不列为通过。Terre 4.6.4 的旧候选合成配对样本仅完成 plan，render 被保护检查中止，MyGO 未运行；不能写为视觉验收通过。不得把 CLI、纯函数或合约结果替代真实宿主与最终安装器验收。

## 构建与发行记录

仅 CI 的依赖缓存补齐可回退至官方来源并按 SRI 校验，锁文件版本和内容不变，不执行 lifecycle 脚本，不改用户 npm 或网络设置。这属于构建可靠性，不是用户功能。

两条 Terre 维护线沿用固定的 BtbN FFmpeg 与 7-Zip，对应源码和许可获取说明见[第三方源码发行](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/third-party-sources-ffmpeg-20260930-7zip-25.00)。

安装器文件名：`WebVideo+-Setup-1.3.10.exe`。最终源码提交、CI URL、文件版本、字节数、SHA-256、UI 验收和公开重下载结果见[发布页](https://github.com/Stakataka-3030/WebVideo-Plus/releases)，旧候选记录不作为这些字段的默认值。真实 Steam 副本的安装与启动需单独验收，标准 ZIP 版检查不替代。
