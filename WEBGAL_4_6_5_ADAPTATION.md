# WebGAL / Terre 4.6.5 适配记录

本分支 `1.2.0exp` 从 1.1.0 演进。正式 1.1.0 仍面向 Terre 4.6.4；此处的 4.6.5 适配尚未发布或安装到用户的 Terre。MyGO 3.2.2 尚未发布，本轮未改变 MyGO 路径。

## 固定上游材料

- [Terre 4.6.5 发布说明](https://github.com/OpenWebGAL/WebGAL_Terre/releases/tag/4.6.5)；官方 Windows ZIP SHA-256：`3100b12e01f9ec9fabaf893b1f5caf8c18c5ca36f537b3c8055ea48462d57c9d`。
- 官方 Terre 前端 `release/public/assets/index-469ad252.js` 保存为 `baseline/terre-4.6.5.js`，SHA-256：`1c4911a397ad887cba6a13eba4e16b58faea72c6595a6b4a14f146f200232cd4`。该文件在 Git 中保留原始字节，避免 Windows 换行转换破坏固定哈希。
- [WebGAL 4.6.5 发布说明](https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.5)；官方 `WebGAL-4.6.5-web.zip` SHA-256：`30a6a446121482cb431950c4d0457ee48f4af9652ca81250fc3f5e244537ce1b`。主 bundle 为 `assets/index-CC7KTie-.js`，SHA-256：`356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6`。

## 已实现

1. `prepare-build.ps1` 现在要求明确提供官方 WebGAL ZIP 并核对 SHA-256，使用该 ZIP 替换 bootstrap 中的旧 WebGAL 网页运行时。`EngineAdapter` 针对固定 4.6.5 bundle 注入导出探针；结构不符时不会假装兼容。MyGO 3.2.1 的独立路径保持原状。
2. 安装器与时间线的 Terre 基线改为 4.6.5。官方前端的全部补丁锚点已逐项校验；使用全部 21 个非 AI 模块生成的补丁脚本通过 `node --check`。
3. `changeFigureDiff` 进入资源扫描、导出时间线、跨进程切段保护、剧情导航和相关批量工具。图片差分保留已有立绘的变换状态；Live2D/Spine 差分不被误当成普通立绘替换。
4. 导出资源屏障会主动排空 Pixi Prepare 的待上传队列，避免离线时钟停止后资源一直停留在 GPU 上传队列。图片项目不再无条件要求 Live2D 外部库；确有 Live2D 模型时仍检查它们。
5. 4.6.5 网页引擎中空回调的零间隔定时器会在导出副本里禁用，避免离线虚拟时钟无法推进。

## 已完成的有界验证

- 内核构建、Terre 时间线和导航元数据生成、JavaScript 语法检查通过。
- 官方 4.6.5 网页引擎探针启动检查通过；图片差分的 3.2 秒短片导出完成，差分前后与变换后的抽帧符合预期。
- 11.6 秒的双进程切段导出完成；切点前后无画面跳变，差分混合期间的抽帧连续。
- 透明对话框 MOV 导出完成，87 帧，ProRes 4444、`yuva444p12le`；逐字显示、`-notend`/`-concat` 与 `wait` 的抽帧符合预期。

## 尚待验证

- `transformFrom=default` 与 `current` 的实际导出对照，尤其是跨段后状态。`current` 已在图片差分短片中观察到位移；`default` 补充任务卡在浏览器内核启动前，状态和 CPU 长时间不变，已仅停止该次测试进程，因此尚不能据此判断功能成败。
- 在真实 Terre 4.6.5 安装目录中的挂载、卸载恢复及整套界面的目视验收；目前只对官方前端原包进行了独立补丁生成与语法验证。
- 较大项目和 Live2D/Spine 的 4.6.5 专项回归。本分支不宣称已通过长片或用户项目验收。
