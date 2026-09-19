# 版本记录

## 0.5.0-rc1 / 安装器内部版本 0.5.0.1

**GPU 导出实验候选。** 产品版本为 `0.5.0-rc1`，导出内核为 `0.4.0-rc1-internal`。预发布安装器构建名为 `WebVideo+-Setup-0.5.0-rc1.exe`。

### GPU 捕获 PoC

新增独立的 Windows Graphics Capture / D3D11 探针 `gpu-capture-probe.exe`。导出面板可开启“GPU 捕获实验诊断”；当前成片仍按原 JPEG → H.264 路径生成，探针仅在后台捕获同一 BrowserHost，统计实际 capture FPS、唯一逻辑帧、重复帧、跳帧、回退帧、SystemRelativeTime 间隔、捕获尺寸和 D3D11 adapter。

为避免诊断 marker 污染正常视频，帧编号条由 WinForms 作为 WebView2 的同级顶层控件绘制；Windows Graphics Capture 可以看到它，而 `CoreWebView2.CapturePreviewAsync` 只捕获 WebView2 内容。探针不可用或失败时只写入诊断错误，不改变正常导出结果。

实验分支构建新增 Visual Studio 2022 C++ Build Tools 与 Windows SDK 依赖；后续是否切换到 CompositionController → CreateFromVisual → GPU 编码，将以本轮真实工程测得的捕获吞吐和逐帧可靠性决定。

根据首轮 RTX 4060 / 1080p60 实测，现有 JPEG `CapturePreviewAsync` 占单 worker 渲染时间约九成。新增 `--gpu-benchmark N` capture-only 模式，不再为了测 WGC 而完整编码视频；同时用 WebView2 的 ANGLE renderer 字符串匹配 DXGI adapter，优先让 WGC D3D11 device 与 WebView 使用同一 GPU。第二轮 8 worker 实测确认 WGC 与 WebView 均可稳定落在 RTX 4060，但屏外 HWND 的 WGC 到帧率只有约 6–7 fps。

benchmark 帧编号现直接写入 Pixi 最终 WebGL framebuffer，与画面共享同一 GPU surface；另新增 `--gpu-benchmark-visible true` 单窗口可见模式，用于和屏外 HWND 做 DWM/compositor 节流对照。

可见/屏外对照确认 WGC 到帧率与窗口可见性几乎无关，compositor 路线不适合作为离线逐帧帧源。因此新增 `--gpu-readback-benchmark N`：通过 WebView2 SharedBuffer 把宿主共享内存直接暴露为页面 ArrayBuffer，每帧用 `gl.readPixels` 写入共享内存，单独测量 raw RGBA readback 的 fps、带宽以及与逻辑渲染合并后的吞吐；该路径完全绕过 JPEG、FFmpeg 与 Windows.Graphics.Capture。

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