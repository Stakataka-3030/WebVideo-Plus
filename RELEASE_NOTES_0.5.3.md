# WebVideo+ 0.5.3 发布说明

> 本文汇总自已发布的 `v0.4.10.2` 到 `0.5.3` 的主要变化。0.4.11 的开发内容没有单独作为正式 Release 发布，因此一并纳入本次说明。

WebVideo+ 0.5.3 的重点是一次完整的视频导出管线升级，同时补齐并行调度、AI 稳定性、预位表情选择、构建流程和开源许可说明。默认导出已经不再依赖旧的逐帧 JPEG CapturePreview 路径；在支持的硬件上会优先使用 GPU Raw + NVENC，仍保留 x264rgb 和传统兼容模式。

## 升级要点

- 当前适配基线仍为 **WebGAL Terre 4.6.4**。
- 生成式 AI 组件仍为可选 Beta；不启用 AI 时，不影响普通编辑与视频导出功能。
- MyGO 仍为可选本机引擎，WebVideo+ 不捆绑 MyGO 引擎或角色素材。
- 0.5.x 的视频导出设置会保存到本机。升级自早期 0.5.0 实验构建时，旧的导出管线偏好会做一次迁移并重新使用硬件自动选择。
- 4K 继续可用，但它被明确定位为高成本输出。若原始背景、立绘、Live2D 贴图本身不是 4K，通常不会因为导出到 4K 获得更多真实细节。

## 1. 视频导出管线重构

### GPU Raw 成为正式导出路径

0.4.10.2 的导出核心仍依赖 WebView2 `CapturePreviewAsync` 生成 JPEG，再由 FFmpeg 解码并编码成 H.264。0.5.x 经过多轮实测后，把正式路径改为：

`Pixi 输出尺寸渲染 → DOM/UI GPU 合成 → WebGL RGBA → WebView2 SharedBuffer → 宿主 → FFmpeg`

这条路径绕开了逐帧 JPEG 压缩/解码，尤其改善了 1080p 多 worker 导出的吞吐。

### 三种导出模式

导出面板现在提供三种视频渲染管线：

- **NVENC**：支持 NVIDIA NVENC 的机器优先自动选择。使用 H.264 NVENC CQ19，速度优先、画质较高，但**不是无损编码**。
- **x264rgb**：使用 `libx264rgb -preset ultrafast -crf 0`，提供 RGB 视频无损基线；文件较大，部分 Windows 自带播放器可能兼容性较差，但浏览器、Bilibili 上传和 Premiere 等常见工作流通常可用。
- **传统/兼容模式**：保留旧的 CapturePreview JPEG → H.264 路径，主要用于 GPU Raw 渲染出现兼容问题时回退。

默认模式会实测 `h264_nvenc` 是否可用；可用则优先 NVENC，否则使用 x264rgb。用户手动选择后会继续保留该偏好。

### 色彩与帧校验

GPU Raw 路线补齐了颜色范围和元数据处理：

- x264rgb 明确写入 full-range RGB、BT.709 primaries 与 sRGB transfer。
- NVENC 路线执行 PC → TV range 和 BT.709 YUV 转换。
- 导出结束会使用 ffprobe 校验尺寸、帧数和时长；分片和最终成片都保留完整校验流程。

## 2. DOM/UI 合成与画面正确性

WebGAL 的画面并不只有 Pixi canvas，文本框、逐字文字和部分 UI 仍由 DOM 绘制。0.5.x 为 GPU Raw 路线新增了 DOM 三层缓存合成：

- **base**：非 TextBox 的静态 DOM。
- **textbox**：对话框、姓名、头像等静态层。
- **text**：逐字文字最终态。

逐字文字的淡入不再要求每帧重新截图，而是通过 Pixi RenderTexture alpha mask 按浏览器实时 computed opacity 还原。默认 TextBox 的整体 opacity 淡入也改为 GPU 侧控制。

同时修复了数个 correctness 问题：

- DOM refresh 不再通过 `animation:none` 重置逐字动画。
- 文字结算后 class 改变时，仍用稳定的 `data-gpu-text-char` 标记保持文字身份。
- 修复 TextBox 捕获 selector specificity，恢复对话框背景、姓名和头像等静态内容。
- 非 opacity 的自定义 DOM 动画仍保留正确性优先的重新 rasterize fallback。

## 3. 并行导出、分段与恢复

### 减少无效冷启动和重复预演

从 0.4.10.2 之后，短场景不再强制所有分片从第 0 帧恢复，而是统一使用剧情安全点恢复。分片数量保持不超过有效 worker 数，避免为了“更细分段”额外启动更多 WebView2。

### workload-aware 切点

0.5.2/0.5.3 进一步让 Planner 在既有时序预演里采集 DOM workload，SegmentPlan 不再只追求平均帧数，而是使用“基础帧成本 + DOM refresh 估算成本”在安全对白边界附近选择切点。

这个改动不增加分片数量，也不增加 WebView2 冷启动，只改变各 worker 分到的剧情区间，用于减少 DOM-heavy 分片形成长尾。

### 并行与性能统计

最终导出 JSON 新增并保留：

- `renderWallSeconds`
- `aggregateFps`
- `realtimeFactor`
- `parallelismFactor`
- `parallelEfficiency`
- 各 part 的 `stepSeconds` / `readbackSeconds` / `hostCopySeconds` / `pipeSeconds` / DOM capture/upload 等分阶段指标

仓库根目录新增 `compare-gpu-scaling.ps1`，用于直接比较不同 worker 数的完整导出结果。

### 分片和最终文件 I/O

- 临时分片不再执行只对最终成片有意义的 faststart 重排。
- 最终合并文件直接生成到目标目录的临时文件，完整校验通过后同盘移动为正式文件名，避免额外整片复制。
- 重试会复用已经通过校验的分片，减少失败后的重复工作。

## 4. 4K 导出策略

4K 每帧像素量约为 1080p 的 4 倍，GPU readback、系统内存搬运、DOM rasterize/upload 和编码输入流量都会显著增加。

0.5.3 在选择 2160p 时会明确提示：

- 预期导出速度明显低于 1080p。
- worker 过高可能因为显存、GPU、内存带宽和 DOM capture 竞争而进一步变慢。
- 建议优先尝试 **2–4 worker**。
- 如果原始素材本身不是 4K，通常不会获得更多实际细节。
- 常规成片优先推荐 **1080p**；需要更高输出分辨率时可优先考虑 **1440p**。

4K 仍然保留，适合后期裁切、缩放或特定平台规格，但不再被视为默认“更高质量”的推荐档位。

## 5. 预位表情选择改进

“预位表情调整”现在增加：

- **选中推荐**：一键选择系统认为适合预位表情的行。
- **解锁非推荐行**：允许手动选择旁白、画外音等原本默认禁用的行；只有能够唯一确定目标立绘时才允许选择。
- 原有全选、反选、拖动连续选择、Ctrl 多选和 Shift 范围选择继续保留。

默认行为仍保持保守：普通用户只会看到系统推荐项；需要特殊剧情结构时可以主动解锁。

## 6. 生成式 AI 稳定性

### 100 字显示段落约束

“小说转剧本骨架”现在明确要求单个显示段落控制在约 100 个字符以内。若模型没有遵守，程序会在进入第二轮舞台安排前按现有 unit 边界自动拆分，优先选择自然停顿，不截断、不删字、不改写原文。

### 更完整的错误诊断

AI 接入层现在会尽量区分：

- 模型拒答 / 内容过滤
- 真实超时和主动取消
- 认证失败 / 访问被拒绝
- 额度不足 / 限流
- 上下文超限
- 输出达到上限
- 空响应
- 网络、DNS、TLS、代理问题
- 上游 5xx
- 模型或接口不存在
- 流式响应提前结束 / 返回格式异常

可用时会显示脱敏后的错误码、HTTP 状态、请求 ID 和 Retry-After，避免把所有问题都归为“连接失败”。

### 长任务时限

正文识别和第二轮基础舞台都按长任务处理，宿主和 AI runtime 允许最长约 60 分钟，不再让第二轮沿用短连接测试的几十秒级时限。

## 7. 构建、版本与发布流程

### 统一版本源

新增根目录 `version.json` 作为产品版本、安装器版本和内核版本的统一来源。构建阶段的 staged `product.json`、`component.json`、安装器元数据和运行时版本都改为读取统一版本，减少旧版本号残留。

### 快速构建

新增 `build-product.ps1 -Fast`：

- 可复用已经 staged 的 AI `node_modules`。
- 开发构建使用低压缩或无压缩 payload，减少重复压缩时间。
- 正式发布仍建议重新执行完整准备和普通构建。

### WebView2 SDK 与许可

构建流程固定 WebView2 SDK 版本，并保留其许可文件；构建脚本和发布 payload 的许可证、来源说明也得到整理。

## 8. 开源许可与来源说明

从 0.4.10.2 到 0.5.3，仓库的许可结构进行了系统整理：

- 根项目原创代码、构建脚本、项目特定实现和原创数据明确采用 **MPL-2.0**。
- 新增 `LICENSES.md`，按路径说明第三方或独立许可例外。
- `NOTICE.md` 与 `licenses/THIRD-PARTY.md` 补充来源、依赖和许可映射。
- Anogo 默认动作词表、js-yaml、Terre/WebGAL、AI 依赖等继续按各自许可处理。

## 9. 已结束的实验路线

0.5.x 中有两条性能实验没有进入 0.5.3 最终正式路径：

- **Windows Graphics Capture / WGC**：实测在离线高速逐帧推进下无法稳定充当可靠帧源，相关诊断 UI 和原生探针已在 0.5.1 清理。
- **WebGL2 PBO ring readback**：0.5.2 曾尝试用 PBO/fence 隐藏 readback stall，但完整 1080p/4K 导出没有观察到可见收益，0.5.3 已恢复稳定的 direct SharedBuffer `readPixels`。

这些实验代码不再影响正常用户路径。

## 10. 当前已知边界

- 当前补丁基线仍为 **Terre 4.6.4**。
- NVENC 需要支持 NVIDIA NVENC 的显卡；当前 NVENC 模式为高质量有损 H.264，不是无损。
- x264rgb 的“无损”仅指视频流；最终音频仍沿用 AAC 192 kbps。
- 4K 输出不会自动提升低分辨率背景、立绘或 Live2D 贴图的真实细节。
- 自定义主题中的特殊 DOM transform/filter 动画可能触发更昂贵的 DOM refresh fallback。
- MyGO 继续使用用户现有本机安装；WebVideo+ 不分发 MyGO 角色素材或模型资源。

## 从 0.4.10.2 升级

关闭 Terre 后运行最新安装器并选择现有 Terre 4.6.4 目录即可。项目故事、游戏目录、成片、备份以及本机保存的角色/滤镜/预制效果库不依赖旧的导出缓存。

发布资产请以 GitHub Releases 页面为准；安装器文件名使用 `WebVideo+-Setup-<版本>.exe`。
