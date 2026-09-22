# 构建与发布

当前分支产品版本 **1.0.0**，产品内部开发标识 **0.7.41**，安装器 Win32 版本 **1.0.0.0**，导出内核 **0.6.34**。开发于 Windows，使用系统 .NET Framework C# 编译器和 Node 22.20.0。构建 bootstrap 仍固定使用已发布的 **0.4.10.2** 安装器，以保证第三方运行资源来源和校验值可复现。

产品、安装器和内核版本的唯一源码真源是根目录 `version.json`。需要推进版本时只修改该文件；`manifest.mjs`、`build-product.ps1`、`configure-installer.mjs`、C# 安装/运行元数据和 staged AI runtime 会在构建或运行时读取该版本信息，不应再手工同步版本常量。

## 初次准备

1. 使用 Windows PowerShell 5.1 或 PowerShell 7，安装 Node.js 22.20.0 或兼容版本。
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

按当前 `version.json`，构建产物为 `dist/WebVideo+-Setup-1.0.0.exe`；Win32 安装器内部文件版本使用数字形式 `1.0.0.0`。面向最终用户的 Release 只需要对应版本的安装器；安装器不依赖同名 `.exe.config` sidecar。`webvideo-plus.zip` 及其 SHA-256 文件只是安装器构建中间产物。

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

## 内部版本构建

开发测试包可以使用独立的内部版本标识，而不修改正式产品版本：

```powershell
.\build-product.ps1 -Fast -InternalBuild
```

`-InternalBuild` 默认读取根目录 `version.json` 的 `productInternalVersion`。内部构建仍把 `productVersion` 作为安装/升级比较版本，因此不会把 `0.5.x` 误判成低于正式 `1.0.0` 的降级包。安装器界面、包内 `MANIFEST.json`、`product.json` 和安装后的 `webvideo-plus.json` 会额外记录内部版本。

需要重现某个旧内部标识时，可直接覆盖：

```powershell
.\build-product.ps1 -Fast -InternalVersion 0.5.7
```

指定 `-InternalVersion` 会自动启用内部构建模式。上面的命令输出 `dist/WebVideo+-Setup-0.5.7-dev.exe` 和 `dist/webvideo-plus-0.5.7-dev.zip`；正式 `productVersion` 仍保持 `1.0.0`。不带 `-InternalBuild` / `-InternalVersion` 的正常构建行为和正式产物命名保持不变。

## 安装恢复与存储目录

安装器高级设置管理三类存储根目录：`stateDir`（WebVideo+ 数据目录）、`workDir`（导出工作缓存）和 `installCacheDir`（安装下载、解包、FFmpeg/WebView 等安装缓存）。默认值仍兼容旧安装；三者可由用户改盘。数据目录迁移属于事务操作：先停止当前服务，将旧目录复制到空目标并逐文件 SHA-256 校验，成功安装后才删除旧目录；失败会保留旧目录并清理新目标。工作缓存和安装缓存只影响后续任务或下载。

角色映射、滤镜库、预制效果、Anogo 动作与 AI 提供商配置现在统一使用 `stateDir/user-data`。若新目录首次使用且检测到旧版 `%LOCALAPPDATA%\WebVideoPlus`，服务会尽量复制一次旧数据用于迁移。WebGAL 项目正文和 `video-project.json` 不属于 WebVideo+ 数据目录。

新版安装器在安装、更新或拆卸结束后还会回收旧版本遗留的历史安装 payload：仅处理可由 SHA-256 命名、ready 标记或已知 WebVideo+ / 旧导出器目录结构确认归属的 `payload-*.zip` 与 `packages/<hash>`，并在使用自定义安装缓存时同时检查旧默认缓存目录；来源不明的目录、downloads 与 tools 不参与这项历史垃圾回收。

安装/更新继续先走严格校验；入口、启动器或备份记录不一致时，管理器返回 `[FORCE_AVAILABLE]`，安装器再由用户显式确认“强制修复”。强制路径仍尽量使用结构锚点、已知原 bundle、Terre 目录中的原程序副本或可选长期恢复副本；写入前会创建事务性临时副本，成功后删除。长期恢复副本默认开启，放在 `stateDir/recovery`，用户可以关闭；关闭不会取消本次操作的临时回滚能力。

卸载按钮弹出两个复选框：缓存/临时文件默认删除，配置/用户数据默认保留。完整用户数据清理发生在 Terre 恢复成功之后，并包括任务历史、日志、用户库、AI 配置、长期恢复副本、旧版全局配置、各游戏中的 WebVideo+ `.webvideo-plus` 自动备份元数据以及项目根目录 `video-project.json`；导出的 MP4、剧本和素材等 WebGAL 游戏工程本体不会删除。安装状态不一致时可显式强制拆卸。

## GPU Raw 导出与性能诊断

0.5.4 起的正常导出继续使用 output-size Pixi renderer、WebView2 SharedBuffer raw RGBA 与 ffmpeg 编码，并把“画质档”和“具体编码器”分开。界面显示为 **推荐 / 高质量、超高质量、完全无损、传统 / 兼容**：推荐档会并行实测 NVENC、AMD AMF、Intel Quick Sync，按 NVENC → AMF → QSV 的优先级选择可用硬件编码器；都不可用时使用 CPU x264。超高质量使用相同编码器但提高质量；完全无损才使用 x264rgb CRF 0；传统/兼容保留旧 JPEG CapturePreview 路径。质量选择位于导出主设置区，不再藏在高级设置中。硬件编码器在任务开始前会按目标分辨率预检，运行时失败也会保持原画质档回退 CPU x264。升级自旧偏好格式时会迁移到新的推荐档（传统兼容模式继续保留）。

工作缓存从状态目录中拆出：`stateDir/jobs/<id>` 只保留 request/status/log/结果等轻量记录，`config.workDir/<id>` 保存 planning、parts、audio.wav、音乐快照和渲染期 WebView2 profile。默认 `workDir` 为当前成片目录下的 `.webvideo-cache`，导出面板可修改并持久化到 `config.json`。成功任务在校验并落盘后删除重型工作目录；失败/取消保留以支持 retry。规划和每个 part 的 WebView2 profile 无论成功失败都在对应进程结束后清理。 面板上传的临时 BGM 在建任务时复制到 `workDir/<id>/imported-music`，全局 `stateDir/media` 只作为当前服务会话的上传暂存；服务启动/退出会清理未被旧未完成任务引用的副本。

原始帧路径使用 WebView2 SharedBuffer：宿主创建 `width × height × 4` 共享内存并以 ReadWrite 方式发送给页面，页面在每次 Pixi render 后直接执行 `gl.readPixels(..., RGBA, UNSIGNED_BYTE, sharedUint8Array)`。0.5.2 曾试验 3-slot PBO ring，但完整 1080p/4K 导出未观察到可见收益，因此 0.5.3 正式路径恢复 direct readback。下面的 benchmark 可继续用于测量基础 WebGL→CPU shared memory 吞吐：

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

### 完整 GPU raw 导出

在 benchmark 路径验证 Pixi output-size renderer、SharedBuffer、DOM 三层 GPU 合成和 raw encoder 后，正常 JobRunner 已接入整条 GPU raw 视频分片渲染管线。CLI 默认使用 `auto`：实测 NVENC 可用则选择 NVENC，否则选择 x264rgb；如需旧路径可显式指定 `--gpu-raw-export traditional`：

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

### Terre GUI 中的 GPU raw 选项

导出面板“高级设置”提供“视频渲染管线”下拉框。默认会实测 NVENC 是否可用：可用时选择 NVENC，否则选择 x264rgb；传统/兼容模式仅在用户手动选择时使用：

- **传统/兼容模式**：保持既有 CapturePreviewAsync JPEG → H.264 路径，用于 GPU raw 渲染出现兼容问题时回退。
- **GPU Raw · x264rgb**：使用 output-size Pixi + DOM 三层 GPU 合成 + SharedBuffer RGBA，再以 libx264rgb CRF0 编码；画质优先但文件体积大。
- **GPU Raw · NVENC（NVIDIA）**：同一 raw 帧管线，后端使用 h264_nvenc CQ19；需要可用的 NVIDIA NVENC。

并行数仍由用户在 GUI 中选择，支持 1–32 的整数及快捷值。项目不会依据开发机实测写死 8 worker 等“最佳值”；不同 CPU、GPU、显存、内存带宽和磁盘环境应由用户自行选择。GUI 的 `gpuRawMode` 会持久化到 settings，并由 QueueService 映射为 JobRunner 的 `gpuRawExport/gpuRawCodec/gpuRawDom` 请求字段。任务列表会显示当前 GPU Raw codec，便于区分历史任务。

构建链版本同步：`build-timeline.mjs` 与 `build-feature-assets.mjs` 不再把 staged `product.json` / `component.json` 写回旧的 0.4.x / 0.3.x 常量，统一从根目录 `version.json` 读取 productVersion/kernelVersion。这样安装包内 MANIFEST、product.json、component.json 和运行时版本元数据保持同源。
