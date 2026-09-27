# WebGAL / Terre 4.6.5 适配调查

本分支从 WebVideo+ 1.1.0 的本地提交 `d035c5e` 分出。此文记录适配入口与待验证项；**尚未宣称兼容 4.6.5**。MyGO 3.2.2 尚未发布，本轮不调整 MyGO 路径。

## 上游变化与核对材料

- [Terre 4.6.5 发布说明](https://github.com/OpenWebGAL/WebGAL_Terre/releases/tag/4.6.5)：立绘差分命令、新的变换起点选项，以及编辑器预览修复。
- [WebGAL 4.6.5 发布说明](https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.5)：还改变了资源预加载、长场景解析、自动播放与逐字文本时序。
- 官方 `WebGAL-4.6.5-web.zip` 的 GitHub SHA-256 为 `30a6a446121482cb431950c4d0457ee48f4af9652ca81250fc3f5e244537ce1b`；本地下载核对一致，主 bundle 为 `assets/index-CC7KTie-.js`。
- 从官方 Terre Windows ZIP 的中央目录按范围读取 `release/public/assets/index-469ad252.js`，ZIP 成员 CRC 校验通过。调查时没有把完整 Terre ZIP 作为已校验成品保存。

## 当前适配边界

1. `src/EngineAdapter.cs` 内置 WebGAL 4.6.4，`Patch` 依赖该版压缩 bundle 的局部变量与语句锚点。官方 4.6.5 引擎 bundle 不包含 `__wgProbe` / `__probeCommands`，也不含旧版 `bP`、`dp`、`JAe` 的对应锚点。现有 `TryWebgalRuntime` 会拒绝它并回退内置 4.6.4。必须为 4.6.5 建立可验证的探针与补丁，不能只改版本字符串或替换 ZIP。
2. `build-timeline.mjs` 固定读取 `baseline/terre-4.6.4.js`，`product.json` 也声明 Terre 4.6.4。4.6.5 前端上已抽样检查：时间线补丁 0–6、8 的范围/唯一锚点可定位，多个菜单锚点也仍唯一；补丁 7 的复杂正则在旧、新两版上均超过 20 秒，尚不能视为通过。安装器所有补丁还须在完整 4.6.5 bundle 上逐一干跑、验证注入后脚本可解析并实际挂载。
3. 新命令 `changeFigureDiff` 是图片差分替换，保留位置、效果与层级；同尺寸图片可混合过渡，Live2D/Spine 不适用。当前 `src/ProjectAssets.cs` 未把它列为标准命令或扫描其立绘图片；`browser/workload.js`、`browser/timeline.js` 和导航语义也未跟踪它。直接导出可能漏复制新图片，并在切段恢复时漏掉动态演出窗口。
4. 4.6.5 的 `transformFrom=default|current` 优先于旧 `writeDefault` / `ignoreDefault`，无参数时默认从当前状态开始；旧参数仍有兼容分支。必须用新引擎核对滤镜预设和 `setTransform`、`setAnimation`、`setTempAnimation` 的预览、时间线及跨段结果。
5. `say`、`wait`、`autoPlay` 与 TextBox 的 concat 节点和文字淡入时序已改。现有离线时序、`-notend` 视觉尾段补偿和 DOM GPU 逐字透明层都依赖这些语义，需用真实短场景比较预览与导出。

## 建议实施顺序

1. 为原版 WebGAL 4.6.5 建立固定且可追溯的运行时快照、探针注入与补丁自检；保留 4.6.4 和 MyGO 3.2.1 路径，不让旧引擎默默处理 4.6.5 新语句。
2. 加入 Terre 4.6.5 前端基线，干跑并复核全部安装/时间线/菜单补丁，确认安装与卸载的原版恢复路径。
3. 扩展差分资源扫描、工作量/安全切点和剧情导航。差分不能按普通 `changeFigure` 重置模型或变换状态。
4. 做小场景对照：差分前后、两种 `transformFrom`、concat / `-notend` / wait、透明对话框、跨 Worker 切段；再用资源较多的项目观察扫描与预加载。

适配验证完成前，不要把 `README.md` 的 4.6.4 适配基线或安装器支持范围改成 4.6.5。
