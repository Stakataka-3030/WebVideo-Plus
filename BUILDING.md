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

WebGAL/Pixi 的原生舞台 framebuffer 是 2560×1440；这不是 Windows DPI 缩放。若导出请求为 1920×1080，benchmark 不修改 Pixi 舞台尺寸，而是在 WebGL2 内创建 1920×1080 RGBA8 framebuffer，并用 `blitFramebuffer(..., LINEAR)` 从原生舞台 GPU 缩放后再 readPixels。结果中的 `sourceFrameBytes` 表示原生 1440p RGBA 数据量，`frameBytes` 表示真正搬到 SharedBuffer 的输出 RGBA 数据量，`readbackPlan.mode` 应为 `webgl2-blit`。

## 当前边界

这是一份整理后的现有工程，而不是重新编写的独立编辑器。首次构建仍从固定安装器中抽取 WebGAL 运行快照和 WebView2 二进制资源；没有宣称从源码重建全部第三方引擎和 SDK。C# 内核、管理器、安装器、process-guard、launcher 及浏览器扩展均从本仓库源码构建。

精确补丁使用 `baseline/terre-4.6.4.js`，与 Terre 4.6.4 对应。更新上游时需要重新核对补丁锚点，不能只修改版本号。对于前端被重新打包但挂载语义未变化的 Terre 4.6.4 变体，部分锚点允许在限定结构范围内使用正则匹配；仍要求目标唯一，避免把兼容性放宽成无条件写入。

安装器的 AI 勾选框位于主界面，标记 Beta，并有 API Key 提示。AI 运行环境随包离线提供，仅启用时部署。

源码可复现当前 WebVideo+ 自有部分的构建；由固定安装器抽取的第三方二进制仍按其各自来源与许可处理。完整来源和许可说明见 `NOTICE.md` 与 `licenses/THIRD-PARTY.md`。