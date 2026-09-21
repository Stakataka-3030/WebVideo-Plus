# 版本记录

## 1.0.0 / 安装器内部版本 1.0.0.0

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
