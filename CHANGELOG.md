# 版本记录

## 1.0.0 / 安装器内部版本 1.0.0.0

### 内部版本 0.7.28 / 导出内核 0.6.26

- 修复 0.7.27 新增的生命周期回归测试夹具。`verify-export-lifecycle.mjs` 通过 `vm.createContext` 加载浏览器渲染脚本，但测试上下文此前只注入 `console`；新增的 bounded dialogue wait 用例首次真正执行 `queueMicrotask(check)`，因此在 Node VM 中会触发 `ReferenceError: queueMicrotask is not defined`，导致构建阶段误报 `Export lifecycle regression checks failed`。
- 测试 VM 现在显式注入 Node 的 `queueMicrotask`、`setTimeout` 与 `clearTimeout`。这只修复测试环境与浏览器环境的 API 差异，不改变 0.6.26 导出内核逻辑。

### 内部版本 0.7.27 / 导出内核 0.6.26

- 给普通 `say` 的 DOM 同步增加 2.5 秒真实墙钟上限，但不改变正常情况下的严格判定。绝大多数对白仍要求 target stage、TextBox mutation 与字符 DOM 数量全部满足后立即继续。
- 只有严格等待超时且 **stage 的 `currentDialogKey/showText` 已确认仍是当前目标对白，同时本轮确实观察到 TextBox mutation** 时，才允许把 `span[id]` / 逻辑字符计数不一致视为 DOM 形态差异并降级继续。这覆盖零宽空格、富文本、emoji/组合字符和自定义主题可能造成的节点计数差异，而不会掩盖真正的对白状态错位。
- 如果等待超时后 stage key/text 仍不匹配，则继续抛出硬错误；不会为了兼容特殊字符而放松真正的状态一致性检查。
- 超时/降级诊断现在记录 target/stage/DOM 文本摘要、字符数、`span[id]` / `.Textelement_start` 数量、mutation serial，以及前三者的 Unicode code point 序列。U+200B 等不可见字符可以直接从诊断中识别。
- bounded wait 使用 Playwright clock embedder 的真实 wall-clock timer，不受导出虚拟时间冻结影响；GPU DOM 结果的 `dialogueWaitDiagnostics` 会保留降级记录。
- pipeline revision 更新为 `dialogue-wait-bounded-0.7.27`，旧分片缓存自动失效。

### 内部版本 0.7.26 / 导出内核 0.6.25

- 根据 0.6.24 用户实测继续修复多 Worker prefix restore。新日志已经明确证明失败不再是 Promise 卡死，而是部分接缝在 `sync-scene` 已完成后，连续 5 秒仍无法满足 `__exportDialogueDomReady(true)`；失败稳定发生在第 3、4、6、7 段，说明 `span[id]` 数量 / TextBox DOM 形态不能作为 worker 恢复正确性的硬前置条件。
- prefix restore 现在只对稳定 TextBox DOM 做 750ms 的短暂机会性等待；超时仅记录诊断，不再终止 worker。随后仍通过强制 `textSettle` 同步 WebGAL TextBox 与 GPU DOM 状态，再继续 warmup。普通播放中的 `say` 仍保留严格的 DOM mutation 等待，不降低逐帧对白同步要求。
- 新增 `__exportDialogueDomSnapshot()`，记录 stage/target 是否匹配、TextBox 是否存在、`span[id]` 与 `.Textelement_start` 数量、目标字符数、mutation serial 及 strict/stable ready 状态；每个非首段写入 `restore-dialogue.json`，以后可以直接解释不同主题/富文本/隐藏文本框为何未满足旧判定。
- 保留 0.6.24 的终止失败 fail-fast：分段重试后仍失败会立即取消兄弟 worker，不再浪费整轮渲染时间。
- pipeline revision 更新为 `prefix-dialogue-softwait-0.7.26`，旧分片缓存自动失效。

### 内部版本 0.7.25 / 导出内核 0.6.24

- 安装器在安装、更新与卸载流程结束后主动清理当前 payload ZIP 和解包目录，并带短暂重试；修复安装器临时 payload 未正确删除的问题。该版本未修改导出内核。

### 内部版本 0.7.24 / 导出内核 0.6.24

- 修复多 Worker 接缝恢复中的确定性页面脚本超时。prefix `sync-scene` 完成后，如果 WebGAL 的 stage `currentDialogKey/showText` 与 TextBox 字符节点已经完整匹配，恢复流程现在允许直接接受这个稳定 DOM，不再强制要求 `__exportBeginDialogueTransition()` 之后必须额外观察到一次新的 MutationObserver 事件。
- 普通播放中的 `say` 同步仍保持严格模式：`__exportWaitDialogueDom()` 仍要求新的 TextBox mutation，避免旧对白 DOM 被误认为新对白；只有 worker prefix restore 使用 stable-state 兜底。
- prefix restore 不再在一个可能永久 pending 的 `__exportWaitDialogueDom()` Promise 上等待 5 秒，而改为宿主轮询 `__exportDialogueDomReady(true)`。即使后续仍遇到异常，也能明确区分“DOM 状态未就绪”和“页面脚本本身卡死”。
- `BrowserHost.Eval` 的超时信息新增超时时间与被执行脚本的截断预览；`Wait` 的单次 CDP evaluate 最多等待 5 秒，避免一个状态检查反过来突破外层 wait 的总超时。
- 原生进程 stdout/stderr 显式使用无 BOM UTF-8，修复 `页面脚本超时` 等中文异常在 runner.log 中被错误解码成乱码。
- 任一分段在自动重试一次后仍失败时，现在立即取消同批其余 worker，并保留首个终止异常；不再让已经注定失败的任务继续把健康分段全部渲染完。
- pipeline revision 更新为 `prefix-dialogue-stable-0.7.24`，旧分片缓存自动失效。

### 内部版本 0.7.23 / 导出内核 0.6.23

- 修复 `VideoWorkflow.Segments()` 遗留的 `warmup > selected * 0.60` 原始 replay 上限。0.7.17 已将正式 Planner 的 replay 成本改为 `warmupFrames × 0.35` 并允许最多 150% 的加权成本，但外层故事范围/选区裁剪仍按原始 warmup 的 60% 再次降 Worker，导致同一份计划在 `SegmentPlan` 已成功选择 8 段后又被错误压到 3 段。
- 故事范围层现在复用 `SegmentPlan.ReplayPenaltyWeight` 与 `SegmentPlan.MaxWeightedReplayOverheadRatio`，因此完整故事与选区使用同一套 replay 成本模型。完整故事不会再被旧 raw 60% 阈值覆盖；很短选区如果为了恢复前置状态产生的加权 warmup 仍超过 150%，仍会以 `range-replay-overhead` 安全降并行。
- `segmentDiagnostics` 与 scope attempt 新增/补齐 `rawReplayRatio`、`weightedReplayFrames`、`weightedReplayRatio`、`replayCostWeight`、`maxWeightedReplayOverheadRatio`、`maxWeightedReplayFrames`，以后可以直接区分“原始回放很多但便宜”和“加权回放成本确实过高”。
- `segment-smoke` 新增外层 `VideoWorkflow.Segments()` 回归：15 分钟持续 Live2D phase 的 8 Worker 用例原始 replay 明确超过 60%，但加权 replay 仍低于 150%，必须保持 8 Worker，防止旧阈值再次回归。
- pipeline revision 更新为 `weighted-range-replay-cap-0.7.23`。

### 内部版本 0.7.22 / 导出内核 0.6.22

- 修复硬件编码器探测与运行时回退造成的整轮重跑。实测 0.6.21 在 RTX 4060 + Intel 核显机器上自动选择了 QSV；8 个 Worker 中部分 QSV 会话初始化失败，但 JobRunner 使用 `Task.WhenAll` 等待其余 Worker 全部结束后才看到异常，约 450 秒后才切到 CPU x264，从而把已经完成的一整轮渲染全部作废。
- 推荐编码器的轻量能力探测从 64×64 @ 30fps 改为 640×360 @ 30fps。极小尺寸本身可能不被某些硬件 H.264 编码路径接受，不能代表目标 720p/1080p/4K 是否可用；NVENC → AMF → QSV 的优先级保持不变，因此 NVIDIA 机器不会再因为异常小的探测尺寸轻易误落到 QSV。
- 单路任务预检现在使用与正式 GPU Raw 更接近的 `RGBA → vflip/scale → NV12` 过滤链，并连续编码 3 帧，而不是只验证一个已是 NV12 的 lavfi 黑帧。
- 分段完成、已知 `effectiveWorkers` 后新增并发硬件编码预检：按目标分辨率、帧率、画质档同时启动与实际 Worker 数相同的短编码会话。若 QSV/NVENC/AMF 在该并发度下无法全部初始化，会在正式渲染前直接回退 CPU x264，并复用已经完成的 planning，而不是几分钟后才重跑。
- 运行时仍保留硬件编码回退作为第二道保险，但改为 fail-fast：任一 Worker 报 `[ENCODER_UNAVAILABLE]` 或硬件兼容错误时，立即取消同批其余 Worker 的子进程；不再等待成功的长分段全部跑完才触发回退。
- 导出状态新增 `encoder-preflight` 阶段与 `encoderPreflightWorkers`，可直接看到实际检查了多少路并发硬件编码。pipeline revision 更新为 `encoder-preflight-failfast-0.7.22`。


### 内部版本 0.7.21 / 导出内核 0.6.21

- 根据 0.6.20 实测继续处理长故事末段性能与全屏文字（`intro`）层级错误。0.6.20 已将最后一段的 DOM 截图从 5358 张降到 1494 张，其中 1288 次走 base-only；但该段仍有约 101 秒 `Page.captureScreenshot`、39 秒 PNG 解码/纹理上传，持续 intro 淡入区间仍会掉到约 8 fps。
- 新诊断明确最后的持续动画全部来自全屏文字的 CSS opacity 淡入：`lastAnimation.className=_fadeIn_...`、`properties=["opacity"]`，共 6257 个 animation sample。WebGAL/MyGO 的 `introContainer` 本身位于 z-index 11，而普通文本框位于 z-index 6；Video+ 旧 DOM 合成却固定把 generic base texture 放在文本框下面，因此全屏文字出现时缓存的对话框仍被画在最上层。
- 对只含 opacity 动画的 `intro` 行启用现有文字 atlas 快路径：将每一行静态字形只捕获一次，逐帧直接读取浏览器计算后的 opacity 并在 Pixi sprite 上更新 alpha。这样 fadeIn 不再每一帧触发 `Page.captureScreenshot`；slide/typing/pixelate/reveal 等含 transform/filter/clip/尺寸变化的 intro 动画仍保留原捕获路径。
- 新增独立 `introTextContainer`。intro 活动时 generic base（包含 intro 背景）按真实 DOM 层级放到普通 textbox 上方，intro 文字 atlas 再放在 base 上方；intro 结束后恢复正常的 base → textbox 顺序。默认黑色全屏文字因此会真正遮住旧对话框，半透明背景也按捕获到的 alpha 正常覆盖。
- base DOM 截图会排除已经进入 intro atlas 的文字，避免同一行同时烘焙在 base texture 和 atlas 中。intro atlas 的 opacity 不受普通对白 `textSettled` 强制 1 的逻辑影响。
- 诊断新增 `handledIntroOpacitySamples`、`introActiveFrames`、`introAtlasEntries`。预期同一 15 分钟样例的最后 Worker 中 `baseOnlyRefreshes` 将从约 1288 显著下降，而这些 intro opacity sample 转入 atlas 逐帧 alpha 更新。
- pipeline revision 更新为 `intro-overlay-atlas-0.7.21`。


### 内部版本 0.7.20 / 导出内核 0.6.20

- 针对长故事末段持续 DOM animation 将导出拖到约 2–4 fps 的情况，拆分 GPU DOM 刷新范围。此前任意有限 DOM 动画只要发生一帧变化，就会固定串行截取 base、textbox、final text 和 text atlas（通常 4 张完整 PNG），再全部解码上传到 Pixi；实测样例最后一段 1337 次刷新产生 5358 张 DOM 截图，单次刷新约四张。
- 新增 `__gpuDomCapturePlan`。持续动画如果目标与 TextBox 无祖先/后代关系，且元素为 absolute/fixed 或动画属性仅属于 opacity/transform/filter/background/color/shadow 等局部绘制属性，则判定为 `base` 刷新；TextBox 内部、TextBox 祖先、可能影响布局的动画仍保持 `full`，不牺牲画面一致性。
- 新增 `__gpuDomOverlayUpdateBase`：base-only 动画帧只截取一张透明 base PNG，并只替换 Pixi 的 base texture；已有 textbox、final text、atlas、逐字 opacity mask 全部复用。普通对白 mutation、结构变化和无法证明局部安全的动画继续走原四层完整刷新。
- 视频元素同样按与 TextBox 的关系决定 base/full；初始帧仍强制 full，因此 base-only 路径不会在 overlay 尚未建立时工作。若运行时发现 base overlay 未初始化，会回退完整刷新。
- 结果与进度诊断新增 `domFullRefreshCount`、`domBaseOnlyRefreshCount`、最后一次 `domCapturePlan`；JS stats 新增 base/full animation/video sample 与 refresh 计数及最后触发元素/属性，方便继续定位剩余的持续动画热点。
- 这项优化不会让 CDP `Page.captureScreenshot` 本身变成 60 fps：OBS/WGC 是直接抓 Windows/DXGI 合成表面，不经过“PNG 编码 → base64 IPC → Image.decode → 再上传 GPU”的往返。本版先把常见持续动画从每帧约 4 次截图降到 1 次；要接近 OBS 级吞吐仍需要后续改为 compositor/surface capture 或把可识别动画完全搬到 Pixi/GPU 侧。
- pipeline revision 更新为 `layered-dom-refresh-0.7.20`。


### 内部版本 0.7.19 / 导出内核 0.6.19

- 修复导出刚进入渲染阶段时“预计剩余几万分钟，随后快速下降”的假 ETA。旧公式直接用 `renderStart.Elapsed × (remaining / completed)`，把浏览器启动、页面导航、状态恢复以及 Live2D phase warmup 的前置耗时全部摊到最开始的极少数输出帧上；第一批帧越少，外推结果越夸张。
- 新增独立的 `RenderEtaEstimator`。ETA 不再从渲染阶段开始时刻做全程平均，而是从“第一次真正产生输出帧”后才开始采样，并使用最近约 12 秒的实际输出吞吐估算剩余时间；启动/预热期间保持未知，不再显示荒谬的超大数值。
- 为避免一两帧或瞬时抖动就产生 ETA，至少需要约 4 秒采样窗口，并要求窗口内累计输出达到 `max(2 秒额定帧数, 总帧数的 0.25%)`。满足条件前界面显示“正在估算剩余时间”。
- 吞吐率使用指数平滑（65% 历史 + 35% 当前窗口），多 Worker 陆续结束 warmup、开始输出时 ETA 会逐步收敛，而不是每秒大幅跳动。进入混音/合并阶段会清空渲染 ETA，避免旧剩余时间残留。
- 状态诊断新增 `etaFps` 和 `etaSampleSeconds`；回归 smoke 覆盖“启动 120 秒后才出现第一帧也不得立即外推出巨大 ETA”“获得稳定吞吐样本后应给出合理 ETA”“无输出进度时不得估算”。
- pipeline revision 更新为 `stable-render-eta-0.7.19`。


### 内部版本 0.7.18 / 导出内核 0.6.18

- 修复 0.7.17 之后长故事仍可能提示“安全切点不足”并停在 4 Worker 的另一层限制。旧 Planner 虽然只允许语义安全切点，但候选集合几乎只来自 source-event 时间；如果大量 `-next` / `-notend` / 连续对白使 source event 落在上一条 say 的 hard no-cut 窗口内，就会把这些事件全部判为 unsafe，即使几百毫秒后已经存在完全安全的 perform 结束边界。
- 安全候选现在增加真实运行时控制边界（`__settleNonHold`、`__nativeNext`、`__singleLineEnd`、`__finishVideo` 等）以及 hard no-cut / 单行提示窗口的结束帧。仍然绝不在保护窗口内部切片；新增的是“保护结束后的第一处确定安全边界”，不是重新允许任意中点帧。
- 分段选择从逐段贪心改为全局动态规划。旧算法可能前几段各自选了局部最优切点，却把后续剩余区间逼到没有候选，然后直接把整个目标 Worker 数判为失败；新算法会一次联合选择全部 `N-1` 个切点，保证最小段长和最后一段可行，再在可行方案中综合 workload 平衡、Live2D replay 成本和切点类型评分。
- 普通模式仍优先避开 Live2D soft window；只有完全找不到无 soft-cut 的全局方案时才允许使用 soft boundary。对白 source boundary 仍具有最高偏好，其次是其它 source event、运行时 control boundary，最后才是保护窗口结束边界。
- diagnostics 新增 `plannerMode=global-safe-dp`、`controlCutCount`、`protectedBoundaryCutCount`、`candidatePoolCount`，每次尝试记录 `safeCandidateCount`、`softCandidateCount`、`usedSoftCuts` 和最终 `cuts`。因此以后“安全切点不足”只应表示在 hard no-cut 规则下确实无法凑出请求段数，而不再是候选采样或贪心路径造成的假不足。
- 新增 15 分钟密集保护窗口回归：7 个理想 source event 全部故意落在 say hard no-cut 内，旧算法没有可用 source cut；新算法必须使用这些窗口结束后的安全边界保持 8 Worker。0.7.16 的 Live2D phase-origin replay、0.7.14 的真实 Pixi warmup render 和 0.7.17 的加权 replay cap 均保持不变。
- pipeline revision 更新为 `global-safe-cut-dp-0.7.18`。


### 内部版本 0.7.17 / 导出内核 0.6.17

- 修正 0.7.16 完整 Live2D phase replay 带来的长故事并行度回退。此前 replay 安全阈值直接按“预热帧总数”限制为成片帧数的 150%；若一个 Live2D phase 从故事开头持续到结尾，均匀切成 N 段时累计 warmup 约为 `(N-1)/2` 个完整故事长度，因此该硬阈值在数学上会把这类工程固定压到最多约 4 段。
- replay/warmup 帧与正式输出帧成本并不等价：0.7.14 起 warmup 只推进逻辑并真实 render Pixi stage，不做 DOM capture、GPU readback、宿主拷贝、编码和写盘。Planner 原本在候选打分里已经使用 `ReplayPenaltyWeight = 0.35` 表示这种成本差异，但最终 hard cap 却仍按原始帧数计算；现在 hard cap 也统一使用同一 0.35 权重。
- 150% 阈值现在解释为“加权 replay 成本上限”。持续单一 Live2D phase、8 个均匀 Worker 的原始 warmup 约为成片 350%，加权后约 122.5%，因此在语义安全切点足够时可以保留 8 段；更极端的 Worker 数仍会因加权 replay 成本过高而自动降低。
- 只调整性能启发式，不改变 0.7.16 的正确性链路：切点仍回到当前 Live2D phase 起点，GPU Raw + DOM 模式仍逐帧真实 render warmup，严格模式 hard no-cut、对白 hard no-cut 和语义切点规则均保持。
- segment diagnostics 的每次尝试新增 `rawReplayRatio`、`weightedReplayFrames`、`weightedReplayRatio`、`maxWeightedReplayFrames`，顶层记录 `replayCostWeight` 与 `maxWeightedReplayOverheadRatio`，方便判断实际降并行究竟是安全切点不足还是加权 replay 成本过高。
- 新增 15 分钟持续 Live2D phase 的 8 Worker 原生 smoke；该用例的原始 warmup 明确超过旧 150% 帧数阈值，但新加权模型必须保留 8 段。pipeline revision 更新为 `weighted-replay-overhead-0.7.17`。


### 内部版本 0.7.16 / 导出内核 0.6.16

- 在 0.7.14 已修复“warmup 逻辑推进但 Live2D/Pixi 未实际 render”的基础上，恢复 0.7.5 的 Live2D / WMDL phase-origin replay，但不恢复 0.7.12 的额外 1 秒前置回放。
- 普通模式会持续跟踪每个 Live2D/WMDL 目标当前 phase：模型建立、模型替换、显式 `motion` 或 `animationFlag` 变化会开启新的 phase。若 Worker 切点位于该 phase 内，`replayFrame` 回退到这个 phase 的真实起点，再由 0.7.14 的 `__webviewWarmupStep` 对每个预热帧真实 render Pixi stage。这样无论动作在切点前已经运行 68 帧还是更久，都按完整相位重放到切点，而不是只从固定 1 秒 warmup 后开始。
- 相邻 motion phase 不会无条件串回更早历史：phase 1 的结束点等于 phase 2 的起点，现有 ReplayAnchor 的严格重叠判断会在 phase 2 起点停止。因此切点位于第二个 motion 时只从第二个 motion 起点重放。
- 严格切片模式继续保留：同样的 phase window 在严格模式下标记为 hard no-cut；安全切点不足时降低 Worker，不进行跨阶段切片。
- 保留 0.7.14 的 `warmupStageRenders` 诊断。正常跨 Live2D phase 的第二 Worker 应同时看到 `replayKinds` 含 `changeFigure-phase`，且 `warmupStageRenders == warmupFrames`（GPU Raw + DOM 合成开启时）。
- 新增原生 segment smoke 与 JS 回归：覆盖持续 Live2D phase replay、多个 motion phase 只回到当前 phase 起点、短片并行不被无关 hard no-cut 过度压缩，以及严格模式退回安全单段。
- pipeline revision 更新为 `live2d-phase-render-replay-0.7.16`，旧规划与分片缓存自动失效。


### 内部版本 0.7.15 / 导出内核 0.6.15

- 修复 Terre 在系统浏览器原本未运行时拉起 Chrome 等默认浏览器后，关闭 Terre 会把整个浏览器一并结束的问题。根因是 Terre 生命周期此前复用了导出 Worker 的 `process-guard`，从而让 Terre 后端及它新启动的浏览器继承了 `KILL_ON_JOB_CLOSE` Job Object；生命周期结束时浏览器也会被 Windows 一起回收。
- Terre 生命周期现在直接启动原生 lifecycle，不再进入导出 Worker 的 kill-on-close Job Object；导出 Worker 自身仍继续使用 `process-guard`，其 Chromium/WebView2 子进程隔离与异常清理行为不变。
- 为保留异常退出清理，lifecycle 继续监视 `wrapperPid`；若 Terre 启动器异常消失，会主动结束生命周期。同时停止 Terre 后端时不再使用 `taskkill /T` 递归杀整个子进程树，只终止 Terre 后端根进程，避免误伤已经被用户用于其他页面的外部浏览器。
- 新增静态回归检查，确保 Terre launcher 不再接入 `process-guard`、wrapper 失联仍能触发收尾，并禁止生命周期恢复 `/T /F` 的递归进程树终止。


### 内部版本 0.7.14 / 导出内核 0.6.14

- 根据 0.6.13 实测重新定位多 Worker 接缝处的 Live2D/WMDL 动作重置。该样例第二段从 frame 342 输出、从 frame 274 预热，replayKinds 只有 say，已确认 0.7.13 不再发生 `changeFigure-phase` 回放；但成片 frame 342 仍直接回到模型初始动作并重新播放，因此上一轮 phase replay 不是根因。
- 根因在 GPU Raw + DOM 合成的 warmup：`__stepExportFrame` 在 `__gpuDomState` 存在时会跳过 `app.render()`，而分片预热此前只调用 `__webviewStep`。于是逻辑时钟虽然从 replayFrame 推进到了 startFrame，Live2D/WMDL 的 Pixi 模型却没有经历对应的逐帧 render/update；新 Worker 第一张真正输出的帧才开始渲染模型，视觉上就表现为“切点回原始姿态，然后动作重新播放”。
- 新增 `__webviewWarmupStep`：在正常逻辑步进后强制执行一次 Pixi stage render。GPU Raw 在 DOM 合成开启时，所有 replay/warmup 帧改用该路径；这些帧仍不截图、不编码、不上传 DOM，只用于让 Live2D/WMDL、physics 与 Pixi 运行时真正推进到切点状态。
- `gpuRawDom=false` 时保持原路径，避免重复 render。结果侧车新增 `warmupStageRenders`，可直接确认本次 Worker 预热实际执行了多少次舞台渲染。
- 新增静态回归，禁止再次出现“warmup 只推进逻辑时钟但不 render Pixi stage”的状态。pipeline revision 更新为 `render-live2d-warmup-0.7.14`，旧分片缓存自动失效。


### 内部版本 0.7.13 / 导出内核 0.6.13

- 回退 0.7.5 引入、0.7.12 又继续强化的 Live2D / WMDL `phase replay`。实测表明接缝处的动作重置不是 fading 窗口不足，而是“从最近一次 motion phase 起点重新真实重放”本身会让部分模型在新 Worker 中回到原始姿态再开始动作。
- 普通模式恢复到 0.7.1 / 0.7.2 的策略：Worker 使用 WebGAL fast-preview / stage state 恢复当前立绘与 motion 配置，只保留局部 replay warmup 和状态变化后的 soft-cut 避让；不再为持续 Live2D 生成 `changeFigure-phase` replay window，也不会把 `replayFrame` 拉回 motion 起点。
- 保留 0.7.5 之后与本问题无关的改进：语义 source-event 切点、对白动画 hard no-cut、DOM/文字接缝修复、worker 诊断等均不回退。
- “严格切片模式”继续保留，但只在用户显式开启时跟踪 Live2D phase，并将其作为 hard no-cut；普通模式完全不使用 phase replay。
- 新增回归检查，明确默认模式不得生成 `changeFigure-phase` replay window，语义分段 smoke 也要求非严格模式不得回退到故事起点。
- pipeline revision 更新为 `revert-live2d-phase-replay-0.7.13`，旧规划与分片缓存自动失效。


### 内部版本 0.7.12 / 导出内核 0.6.12

- 修复多 Worker 接缝处 Live2D / WMDL motion 切换可能出现的动作重置：每个 Live2D phase 现在记录独立的 `replayStartMs`，默认在 phase 起点前额外真实预热 1 秒，再执行 motion / animationFlag 状态切换。这样不会把相邻 phase 无限制串成整段历史重放，同时给 motion fading 与 physics 留出前态稳定时间。
- 分段器将 Live2D phase 从普通重放窗口的传递闭包中单独处理：当前 phase 仍会从自己的 replay anchor 重放，但不会因为 anchor 落入上一个 phase 而递归回退到更早的 motion 起点。旧规划没有 `replayStartMs` 时继续按 phase 起点处理。
- 导出高级设置新增“严格切片模式（优先保证复杂演出连续性）”，默认关闭。开启后持续 Live2D / WMDL phase 作为 hard no-cut，状态变化后的 soft window 也按硬保护处理；安全切点不足时自动降低实际 Worker 数，不用错误接缝换并行度。
- sidecar / segment diagnostics 新增 `strictSegmentCuts` 与 `livePhasePrerollMs`，Worker 降级原因可显示“严格模式下持续 Live2D / WMDL”。CLI 同步支持 `--strict-segment-cuts true|false`。
- 新增回归检查，覆盖 phase pre-roll、motion 切换后的 1 秒前态重放、严格模式 hard no-cut、前后端默认值与高级设置入口。
- pipeline revision 更新为 `live2d-phase-preroll-strict-cuts-0.7.12`，旧规划与分片缓存自动失效。



### 内部版本 0.7.11 / 导出内核 0.6.11

- 将 0.7.8 引入的 `-notend -next → … → wait` 视觉收尾改为用户可选兼容行为，而不是强制改写自定义引擎时序。导出高级设置新增“平滑自定义引擎 -notend 连续对白过渡（推荐）”，**默认勾选**。
- 开启时保持现有 Video+ 兼容策略：对明确的 `say -notend -next` 链补足最低文字淡入收尾，并同步抬高链尾普通 wait 的规划时长；关闭时不应用该 visual floor，严格采用当前引擎提供的原始 `-notend` / wait 时序。
- 该选项后端默认同样为开启，因此旧配置文件没有此字段时会自动沿用推荐行为；用户显式取消后则保存并尊重关闭状态。CLI 同步增加 `--notend-visual-tail=true|false`。
- 导出 sidecar 顶层新增 `notendVisualTail`，可直接确认本次任务是否启用了这一兼容策略；原有 `timelineDiagnostics.visualNotendWaitFloors` 继续记录实际应用到的链路。关闭时不会生成新的 visual-floor 记录。
- 新增回归检查，覆盖后端默认开启、前端默认勾选、高级设置入口以及 planner 仅在选项未关闭时才应用视觉下限。
- 同步当前源码版本标识到 0.7.11 / 0.6.11；此前并行修复已将主分支版本推进至 0.7.10 / 0.6.10，本次不回退版本号。pipeline revision 更新为 `notend-visual-option-0.7.11`。



### 内部版本 0.7.10 / 导出内核 0.6.10

- 进一步收紧重启接管时的并发边界：`lifecycle.lock` 现在由当前 lifecycle 在整个存活期持续持有文件句柄，并禁止其他进程删除该锁；不再是“写完 PID 就立即关闭句柄”的松散标记。
- 新启动实例通过 `FileMode.CreateNew` 原子取得所有权；如果两个启动请求同时等待同一个旧实例退出，只有一个能够获得锁，另一个会重新读取新的 owner 并进入健康复用/等待流程，避免 TOCTOU 下误删刚创建的新锁并启动两个 lifecycle。
- 锁持有覆盖 backend/service 的完整生命周期；退出时先完成服务与 backend 清理，再释放并删除仅属于当前 PID 的锁文件。增加相应静态回归检查。



### 内部版本 0.7.9 / 导出内核 0.6.9

- 修复关闭 Terre 后立即重新打开时偶发的导出服务失联。新的启动器不再只凭 `lifecycle.lock` 中的旧 PID 判断“已有实例可复用”，而会同时验证 Terre 实例标识与本地导出服务 `/health`，并进行短暂稳定性确认；旧实例已经进入退出阶段时会等待其完成清理，再由新实例接管。
- 对仍存活但长时间不健康的旧 lifecycle 增加受控接管：先写入 stop 控制并等待旧 owner 退出，确认旧锁已释放后才启动新 backend/service，避免两个 lifecycle 同时争用同一 Terre 与 discovery 文件。
- `video-export-service.json` 与 `service-state.json` 现在携带 service PID 和唯一 `serviceId`。服务正常退出以及 lifecycle 强制终止服务时，只清理由该服务自己拥有的 discovery/state，避免残留旧随机端口/token，也避免误删已经启动的新服务。
- 新 lifecycle 获得锁后会清理确认已失效的旧 service discovery；导出前端把底层网络异常从裸 `Failed to fetch` 转换为明确的“无法连接本地导出服务”诊断，并指向 lifecycle/service 错误日志。
- 增加生命周期静态回归检查，防止重新引入“PID 存活即直接 return”的旧路径，以及无所有权信息的 service discovery。




### 内部版本 0.7.8 / 导出内核 0.6.8

- 修正 `-notend -next` 后接普通 `wait` 时的视觉收尾。0.6.7 已经消除了错误的 stale continuation，但实测仍可见前一句最后几个字尚在淡入时，下一句就立即替换。侧车显示该类短句的 say 自身在约 568ms 结束，而下一句恰好同一时刻开始，因此这是剩余的视觉时序问题，不再是异常 settle。
- 仅对“`say -notend -next`，中间可穿过若干 `-next` 非对白指令，最终落到一个普通 wait”这一明确链路增加 Video+ 视觉下限。下限使用该 say 原 nominal duration 加上 WebGAL 当前 `textAnimationDuration / 2`；对应 wait 的实际规划 duration 同步提升到至少同一值。这样最后字符能完成主要淡入，又不会给所有 `-notend` 统一增加额外停顿。
- 如果原 wait 本身已经更长，则完全保留原值；如果 `-next` 链中间出现另一条 say，则不会把上一句的视觉下限错误传递过去。
- 最终 sidecar 的 `timelineDiagnostics` 新增 `visualNotendWaitFloors`，记录原 say 时长、视觉下限和对应 wait 行号，便于继续核对特殊脚本。
- 新增回归测试，覆盖与本次实测一致的“say -notend -next → changeFigure -next → wait”链，以及“中间出现新 say 时不得继承旧 visual floor”的反例。
- pipeline revision 更新为 `notend-visual-floor-0.7.8`，旧规划与分片缓存全部失效。



### 内部版本 0.7.7 / 导出内核 0.6.7

- 根据 0.6.6 实测侧车再次定位首个短句跳变：`blockedPrematureAutoNext=0` 证明 0.7.6 的 autoplay guard 没有命中；真正把该句提前结束的是 `5234ms` 的 `settle-nonhold`。对应 say 的 nominal duration 约 1221ms，但实际只运行约 68ms。这个时间差与 WebGAL `PerformController.goNextWhenOver` 在遇到 `blockingNext` 时每 100ms 重试完全吻合。
- 根因是 Video+ Planner 为了防止自动播放跳过普通 `wait`，曾把普通 wait 同时强制改成 `blockingAuto=true` 和 `blockingNext=true`。在“前一句 `-notend -next` 与普通 wait 同一 forward”时，前一句结束后会因为这个人工 `blockingNext` 留下一个 100ms 的内部 continue 重试；wait 自己先结束并进入下一句后，这个旧重试才触发，于是 `continueSentence()` 把已经开始的新 say 结算掉。现在普通 wait **只额外阻塞 autoplay，不再人工阻塞 next**；`-nobreak` 仍完全使用 WebGAL 原生 blockingNext 语义。
- 保留 0.7.6 的 autoplay 防御检查，但它不再被当成本问题主修复。
- 多 Worker 策略进一步放宽：最小分段时长从 5s 降到 2.5s，累计 replay 预热阈值从成片时长的 60% 放宽到 150%。正确性相关 hard no-cut、语义 source-event 切点和 Live2D phase replay 不变；本次只减少性能启发式导致的过度降级。
- 新增与实测短片相近的分段 smoke：约 11.4 秒、持续 Live2D、请求 8 Worker 时应能保留至少 3 个实际 Worker（若语义切点允许），而不是被固定 5 秒阈值压到 2。
- 新增静态回归，明确禁止 Planner 再把普通 wait 改成 blockingNext。pipeline revision 更新为 `wait-stale-continue-0.7.7`，旧规划与分片缓存全部失效。



### 内部版本 0.7.6 / 导出内核 0.6.6

- 根据 0.6.5 实测侧车重新定位“是歌词吗？！”仍然瞬间完成的问题：GPU 文字合成本身已经记录到逐帧 opacity，但该句在约 4 个输出帧后就被引擎 settle，说明剩余问题不在 DOM 捕获，而在自动推进时序。Planner 现在在 WebGAL autoplay 调用 next 时再次检查当前 perform 的 `blockingAuto`；只要当前对白仍阻塞自动播放，就拒绝这次过早 next，不记录控制事件，也不允许它提前结算当前 say。最终 renderer 对回放的 `__nativeNext` 同样执行该保护，避免旧规划中的过早 auto-next 再次打断当前对白。
- 时间线侧车新增 `blockedPrematureAutoNext`、原始 control events 和每条 say 的 nominal duration / start / stop 摘要。若仍存在异常，可以直接区分“自然结束”“被 next 提前结束”与“后续 source event 提前执行”，不再靠成片反推。
- 修复 0.6.5 多 Worker 安全切点判定的 1 帧取整偏差。source event 切点使用首个可执行帧（ceil），但 replay/no-cut 窗口起点此前使用 floor，导致本应恰好位于 say 开始边界的合法切点被误判成已经进入 say 区间。replay window 起点现在与实际首个渲染帧统一使用 ceil。
- 新增与该实测形状一致的原生分段回归：带小数毫秒起点的 say no-cut 窗口不再吞掉同一语句的合法 source-event 边界。14.58 秒一类短片仍受 5 秒最小分段长度限制，因此最多会选择 2 Worker；本次修复针对的是错误回退到 1 Worker，而不是强行把极短片切成 8 段。
- pipeline revision 更新为 `auto-next-cut-rounding-0.7.6`，旧规划和分片缓存全部失效。



### 内部版本 0.7.5 / 导出内核 0.6.5

- 根据同一实测样例重新定位 0.7.3 / 0.7.4 未命中的两处问题，不再继续围绕 `textSettle` 猜测。逐字显示异常的直接风险点在最终 GPU DOM 合成：say 状态提交后 React TextBox 可能尚未把新的逐字节点挂到 DOM，而宿主已经开始本帧捕获；等到下一次 DOM 刷新时，文字动画可能已接近或到达终态。最终渲染现在在每次 say 周围显式跟踪 `#textBoxMain` 真实 DOM mutation，并在新的文字节点数量与当前 stage `showText/currentDialogKey` 对齐后，才继续建立文字 atlas / opacity 动画基线。
- Worker 接缝不再允许落在任意按时长均分得到的帧。分段候选只来自真实 WebGAL source-event 时间点，并优先选择对白边界；活动中的 say perform 作为 hard no-cut 区间，避免在逐字显示过程中切段。原来的工作量均衡仍参与这些合法候选之间的选择。
- Live2D / WMDL 不重新回到“整个在场生命周期禁止切段”的 0.7.0 策略，而改为 **phase replay**：允许切段，但如果切点处仍有持续模型，Worker 的 replay anchor 会回退到该模型最近一次建立 / 重新 motion 的时刻，再真实重放到输出切点。这样保留多 Worker 的可能性，同时避免仅靠 prefix stage-state 重建导致 motion / physics 从相位 0 重新开始、在接缝处出现明显姿势跳变。
- prefix fast-preview 恢复同样改为等待实际 TextBox DOM mutation，而不是只等待 scene pointer 或一个已有的 `span[id]`；恢复出的旧对白在 DOM 确认完成后才强制 settle。
- 诊断侧车新增每个分段的起止帧、replayFrame、segmentRanges，以及 GPU 文字合成的简化 opacity transition 记录。若仍有项目差异，可以直接判断是切点、重放还是文字合成阶段，而不再只凭成片猜测。
- 新增无需 WebView2 的原生分段 smoke：验证两 Worker 不会选择任意中点帧，并验证持续 Live2D 的 replayFrame 会回到 phase origin。GitHub 托管 Windows 环境无法稳定启动 WebView2 页面，因此 CI 不再把该环境当作视觉 E2E 结论。
- pipeline revision 更新为 `dialogue-dom-seams-0.7.5`，旧规划和分片缓存全部失效。



### 内部版本 0.7.4 / 导出内核 0.6.4

- 修正 0.7.3 的 `textSettle` 修复层级：不再只让 WebVideo+ 自己的 GPU DOM listener 忽略过期事件，而是在 `WebGAL.events.textSettle.emit` 源头做 owner 校验。旧 say perform 的 settle 若已经不是当前活动对白，会直接被拦截，因此 WebGAL 原生 TextBox listener 也不会再把新对白瞬间切成 settled 状态。
- Worker prefix 恢复不再只等待 scene pointer / fast-preview 状态结束；若当前舞台存在对白，会继续等待实际 `#textBoxMain` 文字 DOM 挂载完成，再执行一次强制 settle。这样 prefix 恢复出的旧对白不会在新 Worker 接缝处重新播放文字动画。
- GPU DOM 仍在 prefix 恢复前安装；强制 prefix settle 会同时到达 WebGAL TextBox 与 GPU DOM 状态。warmup 中真正新开始的对白不使用 force，仍按正常动画播放。
- 导出任务卡新增“内核 x.y.z”显示，方便实测时直接确认当前任务实际运行的导出内核，避免源码已拉取但安装/挂载仍指向旧内核时难以判断。
- 新增回归：使用伪 WebGAL event 验证 stale settle 不会送达任何 listener、当前 owner 正常送达、prefix force 可绕过 owner；同时检查 prefix settle 必须晚于实际文字 DOM ready。旧缓存通过 `text-settle-source-0.7.4` 自动失效。



### 内部版本 0.7.3 / 导出内核 0.6.3

- 修复 `-notend -next` / `wait` 链后旧对白的 `textSettle` 仍可能在新对白已经开始后触发的问题。导出器现在给每个 say perform 分配独立 ownership token；旧对白结束时只有 token 仍属于当前活动对白才允许把文字标记为 settled，避免上一句把下一句瞬间全部显示。
- 修复多 Worker 接缝处当前对白重新播放文字动画的问题。GPU DOM 文字状态现在在 prefix fast-preview 恢复之前就建立监听；prefix 恢复完成后只对恢复出的当前对白执行一次显式 settle。若新的对白是在 warmup 期间真正开始，仍会按正常文字动画继续，不会被前缀恢复强制完成。
- 新增回归检查，覆盖“旧 dialogue key 不能 settle 新 dialogue key”、显式 prefix settle 仍可生效，以及 GPU DOM 初始化必须早于 prefix restore。旧 0.7.2 规划/分片缓存通过新的 pipeline revision 自动失效。



### 内部版本 0.7.2 / 导出内核 0.6.2

- 高级设置新增“允许装饰性 Pixi 跨段”，默认关闭。开启后仅对白名单内的 WebGAL 内置 `rain`、`snow`、`heavySnow`、`cherryBlossoms` 允许跨 Worker 切段；恢复时会重新建立粒子演出，因此切点附近粒子相位可能变化。未知或自定义 Pixi 继续保持严格 no-cut。
- 多 Worker 分段新增可解释诊断：记录请求/实际 Worker 数、硬保护窗口、软避让窗口、候选切点拒绝数、重放预热开销和降级原因。界面会区分持续 Pixi、重放成本过高、时长不足、安全切点不足等原因，不再只显示笼统的并行回退。
- Live2D / WMDL 的 motion、expression、blink、focus 等状态变化后增加约 1 秒软避让窗口：优先不在模型刚发生状态变化时切 Worker，但没有其它安全切点时允许使用，不会再次把角色整个在场生命周期封成 no-cut。
- 完整扫描新增非阻塞兼容性提示：识别未知/自定义指令、运行时变量插值以及项目、模型、模板、CSS 中的外链资源。深度定制引擎仍按实际运行时尝试执行，但不会承诺其隐藏状态可跨 Worker 恢复；外链内容不会被 WebVideo+ 自动下载或固化。
- `unlockCg`、`unlockBgm`、`callSteam` 等与成片无关的副作用指令在导出副本中跳过，并保留扫描提示，不修改原项目。
- 视频素材在正式时序规划前增加 WebView2 解码与 seek 预检，提前区分“FFmpeg 能读取”与“实际浏览器渲染环境可逐帧定位”。失败时会在规划阶段给出明确错误。
- 导出内核与规划缓存标识更新，旧任务不会复用 0.7.1 的分段判断结果。



### 内部版本 0.7.1 / 导出内核 0.6.1

- 修复 0.7.0 的多 Worker 安全判定过度保守：此前把 Live2D / WMDL / JSON 模型以及带眨眼、motion、focus 等参数的立绘整个在场生命周期都标记为不可切分，常见项目中角色会长期在场，因此几乎所有候选切点都会被拒绝，最终自动退回 1 Worker。
- 持续立绘本身不再形成整段 no-cut 窗口。WebGAL 的 fast-preview 舞台恢复会从 stage state 重新创建立绘，并通过 `syncLive2d` 重新应用当前 motion、expression、blink、focus 等状态；Worker 仍保留至少 1 秒真实 warmup，用于让恢复后的运行时稳定。
- 立绘/背景真正的入场、退场、`setTransform` / `setAnimation` / `setTempAnimation`、视频、intro 与有限 DOM 动画仍按其动态时间窗回退 replay anchor；任意 Pixi perform 仍保持 no-cut，因为其内部状态没有通用可恢复表示。
- 立绘退场窗口现在只要求从“触发退场的那条语句”开始真实重放，不再错误地退回到该角色最初登场时刻，避免长时间在场角色造成巨量 warmup 和 Worker 数下降。
- 新增回归测试，明确保证一个 Live2D/WMDL 角色贯穿整段剧情时不会仅因“角色仍在场”而阻止多 Worker 分段。旧 0.7.0 规划缓存通过新的 pipeline revision 自动失效。



### 内部版本 0.7.0 / 导出内核 0.6.0

- 修复跨语句演出在导出时的生命周期偏差：`-notend` / `-continue` / `wait` 触发的内部继续现在会显式重放非 hold 演出的结算，不再只推进下一条语句；旧对白的 `textSettle` 也不会再串到后续对白并把新文字瞬间显示完。
- 修复多行 WebGAL 语句在最终渲染与缺失资源继续导出时只处理首物理行的问题，续行中的 `-next`、`-keep`、`-parallel`、`-duration`、`-target`、`-notend` 等参数会按完整逻辑语句保留。
- `-next` 连续语句的最终渲染改为按同一次 forward 收集 perform 后统一提交，减少规划阶段与成片重放阶段的事务语义差异；对白 perform 使用规划阶段的实际持续时间，避免离线配音后文本计时漂移。
- 多 Worker 分段改为生命周期感知的重放锚点：切点若穿过动画、视频或 intro，会自动向前回退到对应演出的安全重放起点；持续 Live2D/WMDL/图片眨眼状态与任意 Pixi 演出属于不可证明可确定恢复的运行时状态，分段器不会在其活动区间内切段。可用安全切点不足或重放成本过高时会自动降低实际 Worker 数，而不是牺牲成片一致性。
- `-keep` 动画在已经完成动态阶段后通过静态终态 + dormant hold 身份恢复，后续仍可被同目标动画正常卸载，但不会在新 Worker 起点重新播放一次。
- GPU DOM 合成在 Worker warmup 之前建立文字状态监听，保证预热期间发生的文字结算也能同步到合成状态。旧规划缓存通过新的 pipeline revision 自动失效。


### 内部版本 0.6.13 / 导出内核 0.5.8

- 放宽项目级引擎版本限制：当前游戏内的 MyGO / WebGAL 运行时即使版本号不同于导出适配基线，也会先按实际结构尝试接入；只要导出补丁锚点仍然兼容，就直接使用该游戏自己的运行时，不再因为版本号不同而提前拒绝。
- 项目级运行时结构确实不兼容时改为自动回退：MyGO 回退到已校验的 3.2.1 derivative-engine 基线，标准 WebGAL 回退到 Terre 模板或内置 4.6.4 快照。回退原因写入导出引擎元数据，不再把可回退情况直接作为“导出未完成”。
- 即使发生引擎回退，仍继续优先保留单个游戏自己的项目配置与素材覆盖：`game/config.txt`、模板、用户样式、自定义动画原有复制逻辑保持不变；Live2D 运行库查找顺序改为当前游戏优先、回退引擎兜底，避免项目级 `lib/live2d*.js` 被全局 MyGO 覆盖。
- 导出内核推进到 `0.5.8`，旧任务不会复用此前严格版本拒绝逻辑下生成的规划缓存。

### 内部版本 0.6.12 / 导出内核 0.5.7

- MyGO 专版导出现在优先使用当前游戏目录内随衍生引擎复制下来的实际运行时，而不是直接回到全局 derivative-engines 中的 MyGO 基线。Terre 创建衍生游戏时本来就会把整套引擎壳复制进单个游戏目录，因此游戏内单独修改的 Live2D 默认淡入淡出、背景/立绘转场、文字动画、CSS、拆分 JS chunk 等运行时配置现在会随该游戏进入导出。
- 项目内 MyGO 仍要求描述文件为 MyGO 3.2.1 / WebGAL 4.6.4，并在真正建立工作副本前完整试跑导出器的结构补丁；允许常量、lazy chunk 甚至主 bundle 中不影响补丁锚点的项目级定制，但结构已经不兼容时直接报错，不再静默换成全局 MyGO 运行时。
- 全局 derivative-engines 中的 MyGO 发现逻辑继续保持严格主 bundle 哈希校验，作为未带项目级运行时或项目级运行时不可用时的保守基线。引擎结果元数据会区分 `mygo-project-runtime` 与 `mygo-derivative-runtime`，并记录实际主 bundle 哈希与是否仍为 canonical MyGO。
- 导出内核推进到 `0.5.7`，旧 0.5.6/更早任务不会复用旧的规划缓存；重试会按新的项目级 MyGO runtime 选择逻辑重新规划。

### 内部版本 0.6.11 / 导出内核 0.5.6

- 导出 WebGAL 4.6.4 时不再一律使用 WebVideo+ 内置的固定引擎快照。若项目自身或 Terre 模板中存在结构兼容的 WebGAL 4.6.4 运行时，会优先复制该运行时的引擎壳（主 bundle、拆分 JS、CSS、图标、Live2D 库等）到任务工作副本，再只注入导出所需探针。这样项目对 Live2D 默认淡入淡出、背景/立绘默认转场、文字速度/动画、内置样式等运行时默认值的修改会随实际游戏进入导出。
- 外部运行时在写入任务副本前会完整试跑现有结构补丁；官方 WebGAL 4.6.4 描述存在但结构已改到无法安全接入时会直接报错，不再静默退回固定快照生成与游戏表现不同的成片。未检测到可用项目运行时时仍回退到固定 4.6.4 快照。
- 导出计划的引擎元数据新增 `sourceKind`、`runtimeParity` 与适配器版本，便于区分项目运行时、Terre 模板、内置快照和 MyGO 运行时并诊断一致性问题。
- 导出内核推进到 `0.5.6`，使旧任务的 `native-version.json` 不会复用 0.5.5 时代的固定运行时规划缓存；重试会按新的运行时一致性策略重新规划。

### 内部版本 0.6.10 / 导出内核 0.5.5

- 修复 0.6.9 安装器增强脚本在生成 `SetupEngine` 时多写入一个类级右花括号，导致生成的 `installer/Installer.cs` 在旧 C# 编译器下报 `CS1022`（第 123 行附近）并使安装器构建失败。

### 内部版本 0.6.9 / 导出内核 0.5.5

- 调整安装器存储路径策略：导出工作缓存位于 Terre / 游戏目录内部时不再被拒绝；磁盘根目录、Terre / 游戏根、用户目录根、Windows 系统目录以及存储目录重叠等高风险情况改为明确警告，用户可选择继续。
- 自定义安装缓存目录即使已有其它文件也可继续使用。卸载和缓存迁移改为保守清理：共享 / 高风险安装缓存不递归删除通用目录，导出工作缓存只按已记录任务路径清理，无法确认归属的数据目录会保留。
- 导出服务的工作缓存目录接口同步取消 Terre / 游戏目录内的硬性限制，并返回风险提示信息。

### 内部版本 0.6.8 / 导出内核 0.5.5

- 修复原生字幕文件选择器在旧 .NET Framework 编译器下因 `Contains` LINQ 扩展不可见而无法编译的问题。字幕扩展名校验改为不依赖 LINQ 的直接比较，行为保持不变。

### 内部版本 0.6.7 / 导出内核 0.5.5

- 修复字幕“选择…”按钮能触发但 Windows 文件选择窗口不可见的问题。字幕文件选择不再使用 WinForms `OpenFileDialog`，改为与现有目录选择器一致的原生 Windows `IFileDialog` COM 路径，并将当前前台 Terre 窗口作为对话框 owner，避免隐藏服务进程创建的无主窗口被压在 Terre 后面。
- 字幕文件对话框要求文件实际存在，并在返回后继续校验 SRT / ASS / SSA 扩展名。

### 内部版本 0.6.6 / 导出内核 0.5.5

- 修复“导出后处理”中的字幕文件“选择…”按钮在导出服务连接状态尚未写入前端时被直接禁用的问题。文件选择按钮现在仅在真正忙碌状态下禁用；点击时会主动读取/恢复本机导出服务连接，再打开系统字幕文件选择器。外部字幕编辑器入口同样使用这一连接恢复路径。

### 内部版本 0.6.5 / 导出内核 0.5.5

- 修复安装/应用模块时把“字幕后处理”误当成独立前端脚本模块，进而查找不存在的 `features/modules/subtitles.js` 的问题。字幕仍是安装器中可独立选择的功能模块，但前端实现由导出组件承载，不再要求单独的 JS 文件。
- 安装器侧缓存清理同步纳入 `subtitle-snapshot` 与 `subtitle.log`，与导出内核的字幕缓存生命周期保持一致。

### 内部版本 0.6.4 / 导出内核 0.5.5

- “字幕后处理”继续作为可独立拆卸模块，但默认安装。全新安装时默认勾选；从 0.6.2 之前的安装首次升级到支持字幕的版本时也会自动补勾一次。用户在 0.6.2 及之后主动取消字幕模块后，后续安装器会尊重该选择，不再自动重新启用。

### 内部版本 0.6.3 / 导出内核 0.5.5

- 修复字幕烧录硬件编码回退路径在旧 .NET Framework C# 编译器下无法编译的问题：不再在 `catch` 子句中使用 `await`，保持原有“硬件编码兼容性失败后回退 CPU x264”的行为不变。

### 内部版本 0.6.2 / 导出内核 0.5.5

- 导出界面移除旧的“播放速度与预览同步”展示残余，原位置改为“导出后处理…”三级设置入口。播放速度仍默认从预览读取；读取失败提示移动到高级设置中的速度区域。
- 新增可独立安装/拆卸的“字幕后处理”模块。安装器高级选项会单独显示该模块；未安装时后处理入口保留说明，不影响普通视频导出。
- 字幕支持 SRT、ASS、SSA。可选择 MP4 可开关软字幕（`mov_text`，视频/音频流不重新编码）或 FFmpeg/libass 烧录；烧录会按当前编码档再次编码视频并保留 ASS/SSA 样式。字幕后处理失败时不会废弃基础成片，而是保留无字幕原视频并在任务状态中给出警告。
- 字幕时间基准支持四种来源：字幕自身 0 秒、复用现有 WebGAL 时间线选择器选择单条语句、绑定已保存的后处理音乐轨开始位置、手动输入成片时间。时间线/音乐锚点在任务执行时解析为最终成片时间，因此后处理音乐移动后重新导出会跟随新的位置。
- 字幕文件通过 Windows 原生文件选择器读取；“用外部字幕编辑器打开”交给系统文件关联，可使用 Subtitle Edit、Aegisub 等现有工具。WebVideo+ 不新增自有字幕样式编辑器，也不捆绑这些第三方编辑器。
- 成片音乐快照现在保留轨道 ID 与名称，供字幕等后处理功能稳定引用；字幕快照纳入任务缓存生命周期，成功任务会随其它重型缓存一并清理。

### 内部版本 0.6.1 / 导出内核 0.5.5

- 导出界面的“使用已配置的导出音乐”继续默认启用；启用后新增默认勾选的“使用导出音乐替换 WebGAL 剧本中的 BGM”。关闭第二项时，成片音乐会与剧本 `bgm:` 同时混音；关闭第一项时第二项自动隐藏且不参与导出。
- `replaceGameBgm` 改为每次导出任务的显式选项。项目音乐配置不再为新配置强制写死该值，旧配置字段仍保留兼容；旧前端未传新字段时后端继续按“替换 BGM”处理。

### 内部版本 0.6.0 / 导出内核 0.5.5

- 安装器主窗、高级目录字段与卸载确认窗改用实际文字测量布局，说明自动换行增高，模块自适应分列；小窗口保留滚动，避免高 DPI 下文字裁切和标签遮挡输入框。

- 修复自动/手动导出规划中普通 `wait` 被提前推进截短的问题；等待自然结束，显式 `wait -next` 仍保持非阻塞。
- 修复 GPU DOM 分层截图将模板隐藏的描边等子元素强制显示的问题；保留原有可见性和脚本主动指定的描边，捕获结束恢复临时属性。
- 升级后重试旧任务会重新规划和渲染，避免复用旧时序或带错误描边的片段缓存。
- 产品版本仍为 `1.0.0`，安装器文件版本仍为 `1.0.0.0`；本次仅提升内部开发版本。


- 同步生成的滤镜预设：83 项，包含 11 项贡献预设及既有条目的分类、别名等更新。

### 内部版本 0.5.24 / 导出内核 0.5.5

**安装 / 更新 / 卸载从“严格拒绝”改为“严格默认 + 显式强制”。** 正常路径仍校验 Terre 入口、WebVideo+ 启动器、原程序备份与安装记录；发现入口被其他程序修改、备份丢失、hash 不一致或完整性记录缺失时，不再让安装器永久锁死，而是向用户显示“强制修复 / 强制拆卸”。强制操作会先建立事务性临时回滚副本，成功后立即删除；能够通过结构锚点、已知原 bundle、Terre 本地原程序副本或恢复副本确认的内容会优先自动重建。无法安全合并的外部修改在强制模式下可能恢复为已知原版基线，仍无法确认原版时则停止而不盲目覆盖。

**长期恢复备份改为可选。** 安装器默认勾选“保留 Terre 原始文件的长期恢复备份”，副本统一放在所选 WebVideo+ 数据目录的 `recovery` 中；用户可以关闭。无论是否保留长期副本，本次安装/更新/拆卸仍使用临时事务副本保护回滚。旧 `install-backup` 成功升级后会清理，避免在 C 盘长期重复保存原文件。

**三类存储目录全部可调。** 安装器高级设置新增 WebVideo+ 数据目录、导出工作缓存目录、安装缓存目录。数据目录迁移会停止服务、复制到空目标、逐文件 SHA-256 校验，操作成功后才删除旧目录；失败会回滚。角色映射、滤镜、预制效果、Anogo 动作与 AI 配置迁入 `stateDir/user-data`，并兼容首次复制旧版 `%LOCALAPPDATA%\WebVideoPlus` 数据。工作缓存和安装缓存路径对后续任务/下载生效。

**卸载清理由用户决定。** 点击“卸载 WebVideo+”后弹出独立确认窗，而不是把清理选项藏在高级设置：默认勾选“删除 WebVideo+ 缓存和临时文件”，默认不勾选“删除 WebVideo+ 配置和用户数据”。前者清理导出工作缓存、WebView 临时数据、临时音乐和安装下载/解包/运行依赖缓存；后者在 Terre 恢复成功后再删除设置、任务历史、日志、自动备份、项目内 WebVideo+ 成片音乐配置、滤镜/角色映射/预制效果/AI 配置、长期恢复副本以及旧版全局配置。两项都勾选即完整清理 WebVideo+ 产生的数据；已导出的 MP4 与 WebGAL 游戏工程本体不删除。保留数据时会留下一个很小的最近安装指针，便于以后重装重新找到自定义数据目录。

**导出质量前移并重命名。** 质量选择从高级设置移到主导出界面，四档改为 **推荐 / 高质量、超高质量、完全无损、传统 / 兼容**。推荐档继续使用约 Q/CRF 21，超高质量约 Q/CRF 18，完全无损为 x264rgb CRF 0，传统/兼容使用旧 JPEG 捕获链路；界面明确提示“完全无损文件可能特别大”和“传统/兼容导出速度明显变慢”。

### 内部版本 0.5.23 / 导出内核 0.5.4

**编码体积与跨 GPU 自动硬编。** 默认导出从“NVENC 可用则 NVENC，否则 x264rgb 真无损”改为四档画质模型。推荐 / 录屏级使用约 Q21 的高质量有损 H.264，高质量 / 后期使用约 Q18，无损母版才启用 `libx264rgb -crf 0`，传统 / 兼容继续保留 JPEG CapturePreview 路径。推荐和高质量档会并行实测 NVIDIA NVENC、AMD AMF、Intel Quick Sync，并按 NVENC → AMF → QSV 选择可用硬件编码器；均不可用时使用 CPU x264。硬件编码任务在开始前按目标分辨率预检，运行中若仍出现设备/驱动错误，会保持原画质档回退 CPU x264，不再意外回退到巨大无损文件。

NVENC 正常成片从原先速度极端优先的 P1/CQ19 调整为推荐档 P4/CQ21、高质量档 P5/CQ18；AMF 使用 balanced/quality + CQP，QSV 使用 veryfast/medium + global quality，CPU x264 使用 veryfast/fast + CRF。最终合并仍为 `-c:v copy`，不会二次压缩已经编码好的分片。

**工作缓存从 C 盘状态目录拆出。** `stateDir/jobs/<id>` 现在只保留 request、status、日志和必要分析结果等轻量历史；planning、parts、混音 WAV、音乐快照和渲染期 WebView2 profile 改写入独立 `workDir/<id>`。首次升级/安装默认使用当前成片目录下的 `.webvideo-cache`，导出面板高级设置可随时修改工作缓存目录，新任务立即生效。

成功导出与时间分析完成后会自动删除重型工作缓存；失败或取消任务保留分片和素材快照以支持继续重试。规划进程和每个渲染 worker 的 WebView2 profile 正常结束即清理；进程被强制终止时，服务会在任务退出或下次启动时补扫残留 profile。升级后服务启动也会尝试清理历史“已完成”任务遗留的旧重型缓存。 面板临时导入的 BGM 会在建任务时复制进该任务工作缓存，`stateDir/media` 的全局上传副本在服务启动/退出时按未完成旧任务引用关系回收，媒体探测失败也会立即删除半成品。

旧编码偏好升级到 schema v2：传统 / 兼容模式继续保留，其余旧 NVENC/x264rgb 自动选择结果统一迁移到新的“推荐 / 录屏级”，避免非 NVIDIA 机器继续因为历史默认值生成超大无损成片。CLI 同步支持 `auto/recommended`、`quality`、`lossless`、`traditional`，以及显式 `nvenc/amf/qsv/x264/x264rgb`。


**首个正式发布版基线。** WebVideo+ 产品版本进入 `1.0.0`，安装器 Win32 文件版本使用 `1.0.0.0`；首发基线导出内核为 `0.5.3`。后续内部开发继续保持正式产品版本 `1.0.0` 不变，并单独推进内部版本与导出内核。

安装器改为可调整窗口大小，并重新整理主界面布局：Terre 路径改为独立标签加完整路径行，“自动查找 / 选择”按钮不再与标签争抢宽度；生成式 AI 选项保持在高级选项之外并独占一行；空闲时隐藏多余的“关闭”按钮，保留明确的“卸载 WebVideo+”入口。窗口同时增加最小尺寸、状态文本空间、模块说明空间和高级区域滚动容错，降低 Windows 高 DPI / 显示缩放下文字被裁切的概率。安装器启动时会优先复用历史/默认 Terre 路径；无有效记录时快速检查桌面与开始菜单快捷方式，并在常见安装位置浅层搜索 `WebGAL_Terre.exe` / `WebGAL Terre.exe`。若仍未找到，会明确提示用户手动选择；手动入口同时接受 Terre 文件夹、主程序 EXE 和 `.lnk` 快捷方式。稳定版安装器文件名使用面向用户的产品版本（`WebVideo+-Setup-1.0.0.exe`）。

现有 0.5.x 安装记录会被 1.0.0 安装器识别为可升级版本，可直接用于升级流程演示并作为首个正式发布版本。

## 0.5.3 / 安装器内部版本 0.5.3.0

完整发行说明：[RELEASE_NOTES_0.5.3.md](RELEASE_NOTES_0.5.3.md)

**4K 导出提示与稳定 readback。** 保留 0.5.2 的 DOM workload 成本切点优化，但撤回未观察到可见收益的 PBO ring 正式路径，GPU raw 导出恢复直接 `gl.readPixels(..., sharedUint8Array)` → SharedBuffer → host → ffmpeg。移除 PBO 专用结果字段，继续保留 readback / host copy / pipe 等稳定性能统计。

导出界面在选择 2160p（4K）时显式提示：4K 像素量约为 1080p 的 4 倍，预期导出速度明显下降，过高并行数可能进一步恶化性能，建议 2–4 worker；若原始素材本身不是 4K，通常不会获得更多实际细节，常规成片优先推荐 1080p 或 1440p。

## 0.5.2 / 安装器内部版本 0.5.2.0

**4K 导出调度与回读优化。** 保持分片数量不超过有效 worker 数，不增加 WebView2 冷启动；Planner 复用既有时序预演采集 DOM workload，SegmentPlan 按“基础帧成本 + DOM refresh 估算成本”选择最近的安全对白切点，减少 DOM-heavy 分片造成的长尾。

GPU raw 正式管线在 WebGL2 可用时默认尝试 3-slot PBO ring：`readPixels` 先进入 `PIXEL_PACK_BUFFER`，通过 fence 延迟回收，再用 `getBufferSubData` 写入既有 WebView2 SharedBuffer，从而允许 GPU 渲染、GPU readback 与宿主/FFmpeg 消费发生流水重叠。初始化会先探测 SharedBuffer 作为 `getBufferSubData` 目标的兼容性；不支持时自动回退原同步 SharedBuffer `readPixels`。结果 JSON 新增 readback mode、enqueue/drain/wait 分阶段计时。

## 0.5.1 / 安装器内部版本 0.5.1.0

**GPU 导出清理版本。** 产品版本、安装器和导出内核统一推进到 `0.5.1`。

### 导出设置与兼容性

移除已完成使命的 Windows Graphics Capture 实验诊断及其 UI、原生探针、构建脚本和 capture-only benchmark。正式成片继续使用现有 GPU raw / x264rgb / NVENC 管线；SharedBuffer readback 与端到端编码 benchmark 保留。

新增一次性管线偏好迁移。升级自 0.5.0 实验构建且尚未带新偏好版本标记时，先前保存的 x264rgb/传统模式不会继续冒充“默认值”，而是恢复到自动选择：实测 `h264_nvenc` 可用时默认 NVENC，否则默认 x264rgb。迁移完成后，用户后续手动选择会继续正常保存。

## 0.5.0 / 安装器内部版本 0.5.0.0

**GPU 导出正式版本。** 产品版本为 `0.5.0`，导出内核为 `0.5.0`。安装器构建名为 `WebVideo+-Setup-0.5.0.exe`。

### GPU 捕获 PoC

新增独立的 Windows Graphics Capture / D3D11 探针 `gpu-capture-probe.exe`。导出面板可开启“GPU 捕获实验诊断”；当前成片仍按原 JPEG → H.264 路径生成，探针仅在后台捕获同一 BrowserHost，统计实际 capture FPS、唯一逻辑帧、重复帧、跳帧、回退帧、SystemRelativeTime 间隔、捕获尺寸和 D3D11 adapter。

为避免诊断 marker 污染正常视频，帧编号条由 WinForms 作为 WebView2 的同级顶层控件绘制；Windows Graphics Capture 可以看到它，而 `CoreWebView2.CapturePreviewAsync` 只捕获 WebView2 内容。探针不可用或失败时只写入诊断错误，不改变正常导出结果。

实验分支构建新增 Visual Studio 2022 C++ Build Tools 与 Windows SDK 依赖；后续是否切换到 CompositionController → CreateFromVisual → GPU 编码，将以本轮真实工程测得的捕获吞吐和逐帧可靠性决定。

根据首轮 RTX 4060 / 1080p60 实测，现有 JPEG `CapturePreviewAsync` 占单 worker 渲染时间约九成。新增 `--gpu-benchmark N` capture-only 模式，不再为了测 WGC 而完整编码视频；同时用 WebView2 的 ANGLE renderer 字符串匹配 DXGI adapter，优先让 WGC D3D11 device 与 WebView 使用同一 GPU。第二轮 8 worker 实测确认 WGC 与 WebView 均可稳定落在 RTX 4060，但屏外 HWND 的 WGC 到帧率只有约 6–7 fps。

benchmark 帧编号现直接写入 Pixi 最终 WebGL framebuffer，与画面共享同一 GPU surface；另新增 `--gpu-benchmark-visible true` 单窗口可见模式，用于和屏外 HWND 做 DWM/compositor 节流对照。

可见/屏外对照确认 WGC 到帧率与窗口可见性几乎无关，compositor 路线不适合作为离线逐帧帧源。因此新增 `--gpu-readback-benchmark N`：通过 WebView2 SharedBuffer 把宿主共享内存直接暴露为页面 ArrayBuffer，每帧用 `gl.readPixels` 写入共享内存，单独测量 raw RGBA readback 的 fps、带宽以及与逻辑渲染合并后的吞吐；该路径完全绕过 JPEG、FFmpeg 与 Windows.Graphics.Capture。

单 worker 实测进一步确认 WebGAL/Pixi 原生 framebuffer 为固定 2560×1440 舞台，而导出视口可为 1920×1080。对比发现 WebGL2 framebuffer blit 到 1920×1080 后再 readPixels 反而比直接读取 2560×1440 默认 backbuffer 更慢，因此 SharedBuffer benchmark 默认回到 direct 原生 readback，并保留 `scale` 作为诊断对照。新增 `renderer` 模式：直接将 Pixi renderer resize 到输出尺寸，并对 2560×1440 逻辑舞台施加等比例全局 stage 缩放，测试能否省掉 1440p backing buffer 和二次 blit。单 worker 1080p + host copy 实测达到约 96.7 fps，宿主 SharedBuffer 全帧读取约 14 GB/s。新增 `--gpu-encode-benchmark N --gpu-encode-codec x264rgb|nvenc`，把 renderer 1080p raw RGBA 真正送入 ffmpeg：x264rgb 用于 RGB 无损基线，nvenc 用于 RTX 硬件编码速度测试；编码结果会 count-frames 验证帧数与尺寸。首轮 x264rgb 成片出现色彩显示异常，因此实验管线现显式写入 full-range GBR / BT.709 primaries / sRGB transfer 色彩元数据，NVENC 则显式做 PC→TV、BT.709 YUV 转换；同时生成编码前的 `reference-first-frame.png` 并记录 WebGL premultiplied-alpha / drawing-buffer color-space，用于区分 raw frame 与播放器/编码元数据问题。

## 0.4.11 / 安装器修订 0.4.11.0

**待发布。** 当前主分支产品版本为 `0.4.11`，导出内核为 `0.3.16-internal`；下一次正式构建将生成 `WebVideo+-Setup-0.4.11.0.exe`。

### 导出性能

原生导出短场景不再强制所有并行片段从第 0 帧恢复，而是与长场景统一使用剧情安全点恢复，减少无意义的重复预演，同时保持分片数量不超过有效并行数，避免额外资源冷启动。

临时视频分片不再执行仅对最终成片有意义的 faststart 重排。最终合并文件改为直接写入目标目录的临时文件，完整校验通过后同盘移动到正式文件名，避免此前先在任务缓存生成整片、再完整复制一遍的额外磁盘 I/O。

任务状态会报告实际有效并行数；渲染结果新增 WebView 启动、导航初始化、剧情恢复、逐帧推进、截帧、管道写入和编码收尾的分阶段耗时，为后续 GPU 直传编码实验提供基准。

### 生成式 AI 稳定性与可诊断性

“小说转剧本骨架”现在明确要求单个显示段落控制在 100 个字符以内；模型未遵守时，程序会在进入第二轮舞台安排前按现有语义 unit 边界自动拆分超长段落，避免硬截断正文，也避免后处理拆分导致背景和人物行号错位。

AI 错误链改为保留并解释结构化失败信息，尽量区分模型拒答/内容过滤、真实超时、上游主动中止、认证失败、额度不足、限流、上下文超限、输出截断、网络/代理问题、响应格式异常、服务商 5xx、模型或接口不存在以及空响应。可用时会显示脱敏后的错误码、HTTP 状态、请求 ID 和 Retry-After。模型直接返回拒答文本而不是 JSON 时，也会识别为拒答而非普通格式错误。

第二轮基础舞台不再沿用约 45–55 秒的短任务时限；正文识别和舞台安排均按长任务处理，避免慢模型在正常生成过程中被宿主或 runtime 过早中止。

## 0.4.10 / 安装器修订 0.4.10.2

**已发布：`v0.4.10.2`**

发布安装器：`WebVideo+-Setup-0.4.10.2.exe`

SHA-256：

```text
a31a3d0ba1c76a3dd033d8027b7998c98de24a668db2501038196f8da1fe9378
```

正式发布前已完成标准 Terre、MyGO 分发版和 Steam 版的本机安装/卸载回归。

### 安装兼容性修正

安装器不再要求 Terre 前端 bundle 与已知 Terre 4.6.4 基线整文件 SHA-256 完全一致。官方基线哈希仍用于识别完全匹配的版本；对于便携版、Steam 版或其他仅对前端做无关修改的分发版本，改为执行结构锚点兼容性校验。所有目标锚点仍必须存在且唯一，任一锚点不匹配时安装会在写入 Terre 文件前中止。

根据 MyGO 分发版实测，剧情编辑器的 `editor:update-scene` 挂载点不再依赖其周围经压缩/混淆后的局部变量名。该补丁限定在 `GraphicalEditor` 结构范围内，用正则匹配稳定的调用关系，并继续要求范围内唯一，以兼容前端重新打包而不放弃定位校验。

Steam 版首次安装时不再把主程序文件名固定为 `WebGAL_Terre.exe`；同时识别 `WebGAL_Terre.exe` 与 `WebGAL Terre.exe`，并对仅空格、下划线或连字符差异的 `WebGAL Terre` 文件名做唯一匹配兜底。检测到的实际文件名会写入安装记录，后续启动、更新和卸载沿用该名称。

### 构建与发布

新增 `build-product.ps1 -Fast` 开发构建模式，复用已 staged 的 AI `node_modules`，并用无压缩（不支持时 Fastest）ZIP 直接从 `package/` 生成开发安装器 payload，减少兼容性调试时的重复复制和压缩时间。

正式构建流程会清理旧的 `package/`、`.build/` 和正式解包输出，避免删除过的旧文件残留进安装器。最终用户发布物只需要 `WebVideo+-Setup-0.4.10.2.exe`，无需同名 `.exe.config` sidecar。

公开构建脚本现可直接使用已发布的 0.4.10.2 安装器作为固定运行资源 bootstrap，同时继续接受发布前维护环境使用的旧 bootstrap 哈希。

### 仓库许可证

发布后仓库正式补齐根许可证：除 `LICENSES.md` 中列出的第三方或独立许可材料外，WebVideo+ 原创源代码、构建脚本、项目特定实现和原创数据采用 **Mozilla Public License 2.0（MPL-2.0）**。GitHub 已识别仓库主许可证为 `MPL-2.0`。

`LICENSES.md` 同时记录混合来源边界：Terre/WebGAL 上游继续按 MPL-2.0；`anogo-actions.factory.json` 中来自 Anogo 的默认动作词表继续按 AGPL-3.0；js-yaml 继续按 MIT；已归属的 `webgal-skill`/社区资料保留原有许可和署名。`v0.4.10.2` 标签创建早于许可证文件，因此标签快照本身不包含根 `LICENSE`；对 WebVideo+ 0.4.10 系列原创部分的 MPL-2.0 授权已在 `main` 的 `LICENSES.md` 中明确，后续发布标签应直接包含这些许可文件。

## 0.4.9

### AI 接入修正

OpenCode Go 请求使用真实 WebVideo+ 客户端标识与当前配置会话 ID。模型按已核对目录自动匹配协议和地址；服务端只返回 ID 时合并本地协议表，混合协议提供商的未知模型要求显式手动配置。自定义设置可关闭自动匹配。失败显示脱敏后的错误码、HTTP 状态和原因。未使用用户 Key 进行实测。

启动时后台刷新已配置 Key 的所有提供商模型目录，最多并行两个请求，不触发文本生成。成功列表缓存在本机 `ai/model-lists.json`；失败保留旧缓存。配置页显示缓存并在后台刷新结束时更新，不改当前模型或未保存 Key。Google 与 Mistral 使用各自目录接口。

生成不再额外指定 8192 token 上限，也不把未知模型强制设为 4096 token；未知模型的默认输出目标为 272000 token，有明确能力信息的按模型目录及剩余上下文限制。当前批次遇到中断自动重试一次，成功批次保留，手动取消、总超时、认证和额度类错误不自动重试。连接测试仍使用独立的小额度，避免测试耗费大量 token。截断会明确报告 `MODEL_OUTPUT_LIMIT`。

修复本机角色别名表的字典类型读取错误，避免已有角色文件夹被误判为零立绘。

排除所有角色目录中的 `.mtn_exp` 辅助模型入口。角色表补充正文角色和昵称，并已按维护决定清除重复 ID，当前共 137 行。
修复 x264rgb 色彩诊断版启动失败：`-colorspace gbr` 会被 libx264rgb 私有选项解析器拒绝，导致 ffmpeg 提前退出并在宿主侧表现为 broken pipe。现改用 `-x264-params fullrange=on:colorprim=bt709:transfer=iec61966-2-1`，同时保留 RGB 自动 GBR matrix；raw pipe 写入失败时会直接附带 ffmpeg stderr。

新增 GPU DOM/UI 缓存合成 PoC：`--gpu-encode-dom true` 使用 MutationObserver + 可见动画/视频状态检测 dirty，仅在 DOM 视觉变化时隐藏 Pixi canvas 并通过 CDP 截透明 DOM-only PNG，再把 overlay 缓存为 Pixi 顶层 texture；后续 raw readback 因此仍然只读取一张完整 framebuffer。结果记录 DOM capture/upload 次数与耗时，并保留首张 overlay PNG 便于检查 alpha 和定位。

DOM/UI PoC 继续优化：确认 WebGAL 逐字显示主要由 `.Textelement_start` 的 opacity 动画和逐字 delay 驱动。现将这类动画从 DOM dirty 判定中剥离；DOM refresh 时缓存 static/final 两张 overlay，之后通过 Pixi GPU alpha mask 按浏览器实时 computed opacity 还原每字淡入，避免为同一句文字每帧重新截图。诊断继续使用 frame 100，并新增 domRefreshCount/domAnimationSeconds/textEntries 等指标。

修复 DOM static/final 捕获会重置逐字文字动画的问题：此前诊断样式对 `.Textelement_start` 临时设置 `animation:none`，在其他 UI/回想动画频繁触发 DOM refresh 时会反复销毁并重建文字 CSS animation，表现为首句逐字淡入启动过晚或无法播完。现在捕获只通过 visibility/opacity 隔离 static/final 层，不再修改 animation 属性，因此浏览器文字动画时间轴保持连续。

DOM GPU 合成继续拆层：将默认 TextBox 根容器约 0.7 秒的 opacity showSoftly 动画也从 DOM screenshot 中剥离。缓存现为 base/textbox/text 三层；Pixi 每帧用真实 TextBox computed opacity 控制整个对话框 GPU container alpha，同时逐字文字继续使用 alpha mask。这样默认对话框淡入不再产生约 40 余次截图；非 opacity 的自定义 TextBox 动画仍走正确性优先的 DOM refresh fallback。

修复 GPU DOM 三层缓存的两个 correctness 问题：逐字文字在 WebGAL 结算时会从 `.Textelement_start` 切换到 settled class，旧实现因此在 refresh 后把 final text 层误判为空；现为文字节点添加稳定的 `data-gpu-text-char` 标记，class 变化后仍保持身份。另修复 textbox 捕获层 selector specificity 被 `#root *` 压制的问题，提升到 `#root [data-gpu-textbox-root]`，恢复对话框背景、姓名和头像等静态内容。

完整 GPU raw 导出已接入正常 JobRunner：每个分片可使用 output-size Pixi + DOM 三层 GPU 合成 + SharedBuffer raw RGBA + ffmpeg 编码，同时保留原有多 worker 分段、fast restore、音频混合、最终 concat、retry/cache 与 count-frames 校验。默认模式改为硬件感知自动选择：NVENC 实际可用时默认 NVENC，否则默认 x264rgb；旧 JPEG CapturePreview 路径保留为“传统/兼容模式”。缓存签名包含 raw pipeline/codec/DOM 模式。

完整 GPU raw JobRunner 增加并行扩展统计：输出实际渲染墙钟时间、聚合 FPS、实时倍速、各 part 渲染秒数之和、实测并行度与并行效率；每个 part 也记录自身输出 FPS/实时倍速。新增 `compare-gpu-scaling.ps1`，用于直接比较 1/4/8/16 worker 完整导出结果并计算相对首个 run 的 speedup。

Terre 导出 GUI 提供“视频渲染管线”选项：x264rgb、NVENC、传统/兼容模式。NVENC 实际可用时默认 NVENC，否则默认 x264rgb；传统/兼容模式不默认选中。并行数继续由用户在 1–32 范围内自行选择，不根据单一开发机写死甜点位。问号提示说明 x264rgb 的普遍兼容性、NVENC 的 NVIDIA 限制，以及传统模式作为渲染问题回退路径。

修复构建元数据版本漂移：staged product.json/component.json 现在统一读取 version.json，不再被 build-timeline/build-feature-assets 覆盖成旧 0.4.x/0.3.x 常量。
