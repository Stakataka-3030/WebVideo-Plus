# 导出恢复与诊断维护验收（未发布）

本文件记录版本推进前的实现验收；正式候选已推进到 Terre 1.1.16 / 1.3.9、Craft 1.2.1c，内核 0.6.65。正式发布与真实宿主结果见对应发行正文。

本轮将前缀恢复等待修复和终态清理同步到 Terre 4.6.4、Terre 4.6.6、Craft 三个独立工作树。未修改剧本、未加入完整 Live2D 历史重放、未升级版本号、未推送或制作发布安装包。

## 修改范围

- `StateWait` 以恢复操作的 20 秒总期限管理查询，同一时间只等待一个查询；取消和总期限均有界。取消后或到期后不追加探测请求。迟于旧单次 5 秒限制、但仍在总期限内返回的成功状态可以完成恢复。
- `Renderer` 在启动恢复前保存恢复脚本、目标和物理行到原场景的映射。映射覆盖多行指令。超时保存最后成功返回的状态及是否仍有查询未完成。
- 每次导出和每个分片 attempt 分目录保存证据，重试前清理旧分片证据，进程启动失败不会误带上一次 runner/error/GPU 记录。进程中断时尽力排空 stdout/stderr，排空失败标记不完整。
- `JobRunner`、`QueueService` 接通终态归集和清理，进程退出后再收尾一次；服务恢复只处理带新策略标记的任务。失败清除临时输入后设置 `requiresNewExport`，明确要求重新入队；内部自动重试和既有取消继续约定保留。
- 路径拒绝穿越链接、拒绝正式输出位于工作缓存内；归集初始化失败不写相对路径文件；归集/清理异常不覆盖原始导出异常。

## 成功、失败与取消的文件清单

| 终态 | 保留 | 清理 |
| --- | --- | --- |
| 成功（含自动重试后成功） | 正式媒体/SRT、正式成品 JSON、最小 request/status 历史；成功时间分析的功能性 timing-plan | 本任务所有 attempt 诊断、runner/error/progress、脚本临时快照、Cubism 诊断、分片、帧图、浏览器 profile、运行工程副本、模型/素材副本、混音及导入音频等工作缓存 |
| 最终失败 | 允许清单中的文字、JSON、恢复脚本、源位置映射、原始异常和归集 manifest；原工程及既有正式输出 | 分片视频、帧图、音频、浏览器 profile、完整运行工程、模型和素材等重型缓存；Craft 已确认终态的任务快照 |
| 取消 | 沿用现有可继续任务约定 | 沿用原有取消清理及自有临时输出回收，不因日志策略新增重缓存保留 |

失败先逐文件归集，再清重缓存。材料不足或单文件无法复制标记 `partial`，仅保留允许清单中的 fallback 文字。清理被文件锁或安全边界阻止时明确记录 `heavyCacheCleaned:false`；不宣称文件系统删除必然成功。命令行工作目录与记录目录相同时，也清理完整混音 `webgal-audio-full.wav` 和 `imported-music`；`audio-export.log` 失败归集、成功删除。

失败目录形如 `diagnostics/run-UTC-随机标识/parts/003/attempt-001/`。按需归集：

- 分次 request、runner/error/retry、gpu-selection、processes、restore/restore-dialogue、progress/result；分次原始异常。
- segment-plan、timing-plan、scene-chain/originMap、native-version、扫描/视频预检、音频参数、prepared/input.txt 和 prepared/plan.json、生成的 export-prefix 与 prefix-map。
- mix/merge/audio-export/subtitle/concat 文字记录，以及归集清单和归集错误。

不递归复制工程，不按扩展名收集所有 JSON；模型 JSON、浏览器数据、配置秘密和媒体不进入诊断归集。旧策略历史任务不追溯清理。用户原始反馈 ZIP 不变。

## 日志能说明什么

这次包含证据归集和少量阶段记录，并非只有文件搬运。

| 已实现 | 边界 |
| --- | --- |
| UTC 恢复开始、状态就绪、等待超时事件 | “就绪”表示目标场景/语句及 fastPreview 条件达成，不等于其后 DOM、资源等待和有限帧预演全部结束 |
| 超时的 lastState 和 queryPending | lastState 只是最后一次成功返回的查询结果，可能为空或已经过时；不是卡死瞬间的当前位置 |
| 完整恢复脚本、目标、哈希、预演起止帧、物理行到原场景首尾行的映射 | 可以解释恢复输入及已知语句号，但没有查询返回时不能推断真正阻塞在哪条语句 |
| kernelVersion、OS、处理器数量、进程位数；GPU 选择/观察、WebView2 版本及启动参数（到达相应阶段时）；request 和准备计划中的引擎来源与参数 | 早期失败可能未产生 GPU 或准备记录；没有统一新增外层产品构建标识、完整宿主/MyGO 发行清单、驱动/CPU/显存持续采样 |

尚无独立的每次查询发出/耗时/截止后迟到完成日志，也没有逐指令执行轨迹、逐帧日志、默认 profiling、截图/内存转储。迟于旧单次限制的成功由等待修复接纳，但不会额外标记为“迟到成功”。底层页面持续无响应时，这些日志仍不能单独证明 CPU 忙碌、资源阻塞或并行竞争中的哪一种根因。

## Craft 回运闭环

基线：Craft `3699310f690d9d23d8959a31a75a29e23dbf60e2`；对照 Terre 4.6.6 `4136e00dcf665d708742cfcd8c10848ea7b324b2` 和 Terre 4.6.4 `e6e3aefefe484ad16697205f34f8d0da02cb4af9`。保持 Craft 精确宿主/引擎绑定和原生交互。

| 对比项 | 处理 |
| --- | --- |
| 有限 DOM 动画结束后反复重抓 | 回运缓存观察与实际上传后提交逻辑及回归 |
| 低帧率/停滞时剩余时间估算 | 仅同步 RenderEtaEstimator，保留 Craft 清理总预算等独有代码 |
| 纯对白 SRT | 回运时序捕获、schema、原生写入、队列和参数；Craft 自有导出卡片/表单补入口，保留范围和 hash 校验。SRT 不覆盖视频偏好；临时 SRT 接入 Craft 现有自有输出回收 |
| 长路径读写 | 同步 Files 和 J.Read；保留 Craft 的进程、事务、VFS/registry 和 profile 清理边界 |
| GPU 明确选择/观察、默认关闭精准循环、变音量、4.6.6、动画 v2、资源 URL 与参数扫描、有限预演 | 基线已经具备，未重复引入 |
| Terre 发现/启动器、Steam、安装器分组、共享素材、空项目与 React 宿主 UI | 不适用，不搬入 Craft；未宣称 Craft 已通过真实 Updater/NSIS 升级 |

Craft 当前会在定时清扫、恢复以及关闭前一次有 1 秒超时的只读队列查询中释放已确认成功/新策略失败快照。关闭时任务仍运行、服务无法响应或释放失败，会保守留待恢复处理；不改变取消/旧失败约定。

## 本地验证证据

- 三线 `build.ps1` 最终成功，日志各自 `.build/build-final.log`。Craft 当前源码构建回执 schema 2 校验通过。
- 最终原生诊断回归：Terre 4.6.6 32 项、Terre 4.6.4 32 项、Craft 33 项全通过。各自 `.build/diagnostics-final.log` 和 `.build/export-diagnostics-final/*/checks.log`。覆盖迟到成功、持续不响应、错误场景/未到目标、取消、期限、分次证据、CLI/队列清理、归集失败、链接/输出保护和非追溯策略。
- Craft 全量 Node：1035 项，1020 通过、15 跳过、0 失败（`.build/craft-full-final.log`）。15 项是需要精确官方 4.6.6 运行壳/真实官方 Nest 的外部集成测试，不能算通过。此后仅补齐原生 CLI 混音清理及相应原生回归，并恢复三个文件原有换行格式；未修改 Node 业务逻辑。
- Craft SRT 原生 33 项通过；ETA、WorkCache 释放 5 断言、进程输出 21 项通过。实际 QueueService 隔离测试覆盖取消/进程退出/自有输出清理和 legacy 失败继续，见 `.build/queue-final/*/result.log`。构建回执测试 2 项通过。
- 独立 headless Edge 检查使用隔离 mock 表单和真实 Craft UI 代码：第五张 SRT 卡片、说话人开关、`.srt` 入队参数、隐藏视频控件、返回和关闭均通过；截图在相邻工作区 `output/playwright/`。没有打开用户在用工程或真实 Craft 窗口。
- 独立只读复核未发现阻断。三线 `git diff --check` 按已有 CRLF 格式检查通过。

仍未验证：用户原反馈工程的实际导出、真实 GPU/Live2D 画面与性能、真实 Craft 宿主接入及注册安装升级、上述 15 项精确引擎/服务集成；旧模型动作缩短/超时等此前暂停问题不在本轮修复结论内。没有发布阻塞被静默绕过。
