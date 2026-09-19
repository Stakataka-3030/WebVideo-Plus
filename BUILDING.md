# 构建与发布

当前实验分支产品版本 **0.5.0-rc1**，安装器内部版本 **0.5.0.1**，导出内核 **0.4.0-rc1-internal**；当前最新公开 Release 仍为 **0.4.10.2**。开发于 Windows，使用系统 .NET Framework C# 编译器、Node 22.20.0，以及 GPU 捕获 PoC 所需的 Visual Studio 2022 C++ Build Tools。

产品、安装器和内核版本的唯一源码真源是根目录 `version.json`。需要推进版本时只修改该文件；`manifest.mjs`、`build-product.ps1`、`configure-installer.mjs`、C# 安装/运行元数据和 staged AI runtime 会在构建或运行时读取该版本信息，不应再手工同步版本常量。

## 初次准备

1. 使用 Windows PowerShell 5.1 或 PowerShell 7，安装 Node.js 22.20.0 或兼容版本。GPU 捕获 PoC 还需要 Visual Studio 2022 Build Tools 的 **Desktop development with C++** 工作负载以及 Windows 10/11 SDK（含 C++/WinRT 头文件）。
2. 从 GitHub Release 下载当前已发布的 `WebVideo+-Setup-0.4.10.2.exe`。构建脚本从其中抽取固定的 WebGAL/WebView2 运行资源和既有许可文件，不会启动安装程序。该旧安装器不包含编译期 managed WebView2 SDK，因此 `prepare-build.ps1` 另行固定下载 Microsoft.Web.WebView2 `1.0.4191.47`，并保留其许可文本；不会解析 latest。
3. 在仓库目录执行：

```powershell
.\prepare-build.ps1 -InstallerPath C:\Downloads\WebVideo+-Setup-0.4.10.2.exe
Push-Location ai-runtime
npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
Pop-Location
.\build-product.ps1
```

国内网络可为 `npm ci` 附加 `--registry=https://registry.npmmirror.com`。以提交的锁文件和完整性校验值为准，不重新解析 latest。

当前公开 Release 安装器 SHA-256：

```text
a31a3d0ba1c76a3dd033d8027b7998c98de24a668db2501038196f8da1fe9378
```

为兼容发布前的维护环境，`prepare-build.ps1` 也继续接受旧 bootstrap SHA-256：

```text
1ed9f61ab893f32c59c84a5b1a0865fea760789b1e5b71d79fd8083e7b00ed2d
```

`prepare-build.ps1` 会先清空并重建 `package/` 与 `.build/`，避免旧构建文件残留。之后再执行 `npm ci`；不要在安装依赖后重复运行 `prepare-build.ps1`。

输出位于 `dist/`。`package/`、`dist/`、`.build/` 和 `node_modules` 都不提交。脚本不依赖维护者个人目录；Node 位置由当前 PATH 解析。

按当前 `version.json`，预发布构建产物为 `dist/WebVideo+-Setup-0.5.0-rc1.exe`；Win32 安装器内部文件版本使用数字形式 `0.5.0.1`。面向最终用户的 Release 只需要对应版本的安装器；安装器不依赖同名 `.exe.config` sidecar。`webvideo-plus.zip` 及其 SHA-256 文件只是安装器构建中间产物。

## 开发快速构建

兼容性调试时可使用：

```powershell
.\build-product.ps1 -Fast
```

`-Fast` 仍会重新编译当前 C# 内核、管理器、时间线挂载资源与安装器，但会优先复用已经放入 `package/ai-runtime/node_modules` 的固定 AI 依赖；提示词、worker、provider 目录、Node 可执行文件等轻量内容仍会刷新。如果还没有可复用的依赖，会自动执行一次完整复制。

快速模式不再先复制整个 `package/` 到 `dist/webvideo-plus/` 后使用 `Compress-Archive` 高压缩，而是直接从 `package/` 生成带 `webvideo-plus/` 根目录的开发 payload，并使用无压缩 ZIP（运行环境不支持时回退为 Fastest）。因此生成的安装器可能明显更大，但适合反复做本机兼容性测试。

快速模式不会刷新解包形式的 `dist/webvideo-plus/` 目录。正式发布前应重新运行一次 `prepare-build.ps1`、恢复 `ai-runtime` 依赖，然后执行不带 `-Fast` 的：

```powershell
.\build-product.ps1
```

普通构建会清空并重建 `dist/webvideo-plus/`，以正式构建产物为准。

## GPU 捕获 PoC

0.5.0-rc1 的实验导出器会额外构建 `gpu-capture-probe.exe`。在导出面板高级设置中启用“GPU 捕获实验诊断”后，正常成片仍沿用现有 JPEG → H.264 编码，同时探针通过 Windows.Graphics.Capture 抓取 BrowserHost 的 D3D11 surface，并读取窗口顶层的帧编号 marker。每个分片的 `result.json` 会写入 `gpuCaptureProbe`，用于判断捕获吞吐、重复帧、跳帧和 compositor 节拍。探针失败只记录 `gpuCaptureProbeError`，不会改变正常成片路径。

第一阶段故意仍以现有 HWND 为捕获源，用于验证 WGC 的真实性能和逐帧可观测性；只有这一步通过后，才会把 WebView2 改成 CompositionController / CreateFromVisual 的正式离屏 GPU 路径。

为避免完整导出等待，实验分支还提供 capture-only benchmark。它复用同一套 Planner、WebView2、剧情推进和资源加载，但跳过 `CapturePreviewAsync`、JPEG、FFmpeg 和成片合并。每个 worker 独立运行相同的短帧区间，适合观察并发 WGC 吞吐和 compositor 丢帧：

```powershell
.\WebGAL.Video.exe export --project "D:\Games\Project" --scene start.txt --out "D:\Temp\gpu-benchmark.json" --width 1920 --height 1080 --fps 60 --workers 4 --gpu high --gpu-benchmark 300
```

MyGO 工程继续附加已有的 `--engine mygo --mygo-root "..." ` 参数。benchmark JSON 会记录每个 worker 的 WebGL GPU、WGC adapter、是否成功匹配同一 DXGI adapter、capture FPS、唯一 marker FPS、重复/跳过/倒退 marker 和各初始化阶段耗时。

为判断屏外窗口是否触发 DWM 节流，可用同一场景再跑一次可见窗口对照；该模式要求单 worker：

```powershell
.\WebGAL.Video.exe export --project "D:\Games\Project" --scene start.txt --out "D:\Temp\gpu-visible.json" --width 1920 --height 1080 --fps 60 --workers 1 --gpu high --gpu-benchmark 300 --gpu-benchmark-visible true
```

benchmark marker 直接写入 WebGL 最终 framebuffer 左上角的 64×8 像素区域，与 Pixi 画面共享同一 GPU surface，仅在 benchmark 模式启用且不会生成成片。

WGC 仅用于 compositor 行为诊断。真正的原始帧候选使用 WebView2 SharedBuffer：宿主创建一块 `width × height × 4` 的共享内存并以 ReadWrite 方式发送给页面，页面在每次 Pixi render 后直接执行 `gl.readPixels(..., RGBA, UNSIGNED_BYTE, sharedUint8Array)`。下面的 benchmark 跳过 WGC、JPEG 和 FFmpeg，只测 WebGL→CPU shared memory 的逐帧吞吐：

```powershell
.\WebGAL.Video.exe export --project "D:\Games\Project" --scene start.txt --out "D:\Temp\gpu-readback.json" --width 1920 --height 1080 --fps 60 --workers 4 --gpu high --gpu-readback-benchmark 300
```

结果包含每个 worker 的 `readbackSeconds`、`readbackFps`、`combinedFps`、`frameBytes` 和 `readbackGigabytesPerSecond`；完成后还会由宿主通过 `CoreWebView2SharedBuffer.OpenStream()` 读取一小段样本并记录 checksum，用来确认脚本写入与宿主读取确实落在同一共享缓冲区。

WebGAL/Pixi 的原生舞台 framebuffer 是 2560×1440；这不是 Windows DPI 缩放。benchmark 支持 `--gpu-readback-mode direct|scale|renderer`：`direct` 直接 readPixels 原生 framebuffer；`scale` 先在 WebGL2 内用 `blitFramebuffer(..., LINEAR)` 缩到请求输出尺寸再 readPixels；`renderer` 则把 Pixi renderer 直接 resize 到请求输出尺寸，同时按 WebGAL 2560×1440 逻辑舞台比例缩放 `app.stage`，再直接 readPixels。RTX 4060 实测 direct 比 scale 明显更快，renderer 用于验证是否能在不改变舞台坐标语义的前提下消除多余 1440p backing buffer。结果中的 `nativeDrawingBufferWidth/Height` 是模式切换前的原生 framebuffer，`drawingBufferWidth/Height` 是实际 readback framebuffer。

加 `--gpu-readback-host-copy true` 后，宿主会在每帧 readPixels 完成后通过 `CoreWebView2SharedBuffer.OpenStream()` 将整帧读入复用的 C# byte[]，用来测量正式接 ffmpeg/native encoder 前不可避免的 SharedBuffer→host 消费成本。结果会额外记录 `hostCopySeconds`、`hostCopyFps`、`hostCopyGigabytesPerSecond` 和 `hostBytes`。

端到端 raw 编码 benchmark 使用：

```powershell
.\WebGAL.Video.exe export --project "D:\Games\Project" --scene start.txt --out "D:\Temp\gpu-encode.json" --width 1920 --height 1080 --fps 60 --workers 1 --gpu high --gpu-encode-benchmark 300 --gpu-encode-codec x264rgb
```

`x264rgb` 使用 `libx264rgb -preset ultrafast -crf 0`，作为不经过 YUV 4:2:0 的 RGB 无损基线；RGB VUI 通过 `-x264-params fullrange=on:colorprim=bt709:transfer=iec61966-2-1` 写入，避免直接传 `-colorspace gbr` 触发 libx264rgb 参数解析错误；`nvenc` 使用 `h264_nvenc` 的 P1/VBR/CQ19 配置，作为 RTX 硬件编码速度路线。两者都固定使用 output-size Pixi renderer + SharedBuffer raw RGBA，并在 ffmpeg 输入端执行 `vflip` 纠正 WebGL readPixels 的垂直方向。

RGB benchmark 现在显式标记 full-range GBR、BT.709 primaries 与 sRGB transfer；NVENC 路线也显式执行 PC→TV range 和 BT.709 matrix 转换。每次编码还会在 part 目录生成 `reference-first-frame.png`，它来自编码前同一张 raw RGBA 帧并仅做 vflip + RGB24，用来区分“raw readback 本身颜色不对”和“视频编码/播放器色彩解释不对”。result JSON 会记录 WebGL `premultipliedAlpha`、`drawingBufferColorSpace` 等上下文信息，并通过 ffprobe 回报输出的 `pix_fmt/color_range/color_space/color_transfer/color_primaries`。

加 `--gpu-encode-dom true` 后，实验编码会把 DOM/UI 作为缓存层合入 Pixi framebuffer，而不是每帧 CapturePreview：页面通过 MutationObserver、可见 CSS animation 和可见 video currentTime 判断 DOM 是否需要刷新；仅在 dirty 时暂时隐藏 `#pixiCanvas`，通过 CDP `Page.captureScreenshot` + transparent default background 获取 DOM-only PNG，再把该 PNG 上传为 app.stage 最顶层 Pixi texture。DOM 不变的帧直接复用 texture。结果记录 `domCaptureCount/domCaptureSeconds/domUploadSeconds/domOverlayBytes`，并保存第一张 `dom-overlay-first.png` 便于检查透明度、缩放和位置。

## 当前边界

这是一份整理后的现有工程，而不是重新编写的独立编辑器。首次构建仍从固定安装器中抽取 WebGAL 运行快照和 WebView2 二进制资源；没有宣称从源码重建全部第三方引擎和 SDK。C# 内核、管理器、安装器、process-guard、launcher 及浏览器扩展均从本仓库源码构建。

精确补丁使用 `baseline/terre-4.6.4.js`，与 Terre 4.6.4 对应。更新上游时需要重新核对补丁锚点，不能只修改版本号。对于前端被重新打包但挂载语义未变化的 Terre 4.6.4 变体，部分锚点允许在限定结构范围内使用正则匹配；仍要求目标唯一，避免把兼容性放宽成无条件写入。

安装器的 AI 勾选框位于主界面，标记 Beta，并有 API Key 提示。AI 运行环境随包离线提供，仅启用时部署。

源码可复现当前 WebVideo+ 自有部分的构建；由固定安装器抽取的第三方二进制仍按其各自来源与许可处理。完整来源和许可说明见 `NOTICE.md` 与 `licenses/THIRD-PARTY.md`。
逐字文字动画优化：WebGAL 会预先把整句文字节点放入 DOM，并通过 `.Textelement_start` 上的约 1s opacity 动画和逐字 animation-delay 实现淡入。DOM GPU PoC 因此在真正 DOM refresh 时同时缓存两张 overlay（动态文字隐藏的 static UI、动态文字强制最终态的 final UI），随后用 Pixi RenderTexture alpha mask 按每个文字元素的实时 computed opacity 在 GPU 上逐帧还原淡入；这类文字动画不再触发 CDP screenshot。结果中的 `domRefreshCount` 是 DOM 内容/非文字动画触发的重新 rasterize 次数，`domCaptureCount` 是实际 screenshot 次数（每次 refresh 当前为两张），`domAnimationSeconds` 是 GPU mask 更新耗时。

对话框整体淡入进一步走 GPU：WebGAL 默认 TextBox 根容器使用约 0.7s 的 opacity `showSoftly` 动画，60fps 下本身就会造成约 42 次 DOM refresh。DOM 缓存现拆成 base / textbox / text 三层：base 不含 TextBox；textbox 捕获对话框、姓名、头像等静态内容并强制根 opacity=1；text 仅捕获逐字文字最终态。运行时 Pixi 每帧读取真实 TextBox 根节点 computed opacity，直接设置 textbox GPU container alpha，并继续用逐字 alpha mask 控制 text 层。因此默认 TextBox 整体淡入和逐字淡入都不再触发截图。若自定义主题给 TextBox 根节点使用 transform/filter 等非 opacity 动画，仍保留 DOM refresh fallback 以优先保证正确性。

### 实验性完整 GPU raw 导出

在 benchmark 路径验证 Pixi output-size renderer、SharedBuffer、DOM 三层 GPU 合成和 raw encoder 后，正常 JobRunner 现可通过 CLI 显式切换整条视频分片渲染管线，而不改变默认 JPEG 导出：

```powershell
.\WebGAL.Video.exe export --project "D:\Games\Project" --scene start.txt --out "D:\Temp\gpu-full.mp4" --width 1920 --height 1080 --fps 60 --workers 1 --gpu high --gpu-raw-export x264rgb
```

可选 `x264rgb`（RGB CRF0 无损视频基线）或 `nvenc`（H.264 NVENC CQ19 快速路线）；DOM 三层合成默认开启，可用 `--gpu-raw-dom false` 仅作舞台层诊断。该模式仍复用正常 Planner、分片、replayFrame 恢复、音频混合、concat 合并、完整 count-frames 校验和 retry/cache 机制；分片缓存签名会包含 raw pipeline、codec 与 DOM 开关，避免误复用旧 JPEG 分片。当前最终音频仍沿用既有 AAC 192k，因此 `x264rgb` 目前只代表视频无损，尚不是“全媒体无损”成片。

### GPU raw 并行扩展指标

正常 JobRunner 结果现在额外记录 `renderWallSeconds`、`aggregateFps`、`realtimeFactor`、`sumPartRenderSeconds`、`sequentialEquivalentFps`、`parallelismFactor` 与 `parallelEfficiency`。其中 `parallelismFactor = sum(part.renderSeconds) / renderWallSeconds`，表示本次任务实际获得的并行度；`parallelEfficiency = parallelismFactor / effectiveWorkers`，可直接观察 4/8/16 worker 的资源竞争损失。每个 `renderParts[]` 也会记录自身 `outputFps` 与 `realtimeFactor`。

仓库根目录提供 `compare-gpu-scaling.ps1`，可把多次完整导出的 JSON 一次汇总。例如：

```powershell
.\compare-gpu-scaling.ps1 D:\Temp\gpu-full-x264rgb.json D:\Temp\gpu-full-x264rgb-4w.json D:\Temp\gpu-full-x264rgb-8w.json D:\Temp\gpu-full-x264rgb-16w.json
```

脚本会以第一个 JSON 为基线输出 SpeedupVsFirst，并兼容旧的单 worker JSON（缺少新聚合字段时从 renderParts 回退计算）。
