# WebGAL / Terre 4.6.5 适配记录

本分支 `1.2.0exp` 从 1.1.0 演进，已合并 main `2b8f5225` 的整理、构建与字体修正。稳定 1.1.4 仍面向 Terre 4.6.4；此处的 4.6.5 适配尚未发布或安装到用户的 Terre。版本保留为产品 1.2.0、安装器 1.2.0.0、内部 0.9.0-exp.1、内核 0.6.48。本轮没有扩大既有 MyGO 3.2.1 支持范围。

## 固定上游材料

- [Terre 4.6.5 发布说明](https://github.com/OpenWebGAL/WebGAL_Terre/releases/tag/4.6.5)；官方 Windows ZIP SHA-256：`3100b12e01f9ec9fabaf893b1f5caf8c18c5ca36f537b3c8055ea48462d57c9d`。
- 官方 Terre 前端 `release/public/assets/index-469ad252.js` 保存为 `baseline/terre-4.6.5.js`，SHA-256：`1c4911a397ad887cba6a13eba4e16b58faea72c6595a6b4a14f146f200232cd4`。该文件在 Git 中保留原始字节，避免 Windows 换行转换破坏固定哈希。
- [WebGAL 4.6.5 发布说明](https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.5)；官方 `WebGAL-4.6.5-web.zip` SHA-256：`30a6a446121482cb431950c4d0457ee48f4af9652ca81250fc3f5e244537ce1b`。主 bundle 为 `assets/index-CC7KTie-.js`，SHA-256：`356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6`。

## 已实现

1. `prepare-build.ps1` 从依赖锁文件固定的官方 WebGAL ZIP、WebView2 和 Node 输入准备运行资源并核对 SHA-256，不再要求 0.4.10.2 安装器。17 份 4.6.5 运行文件保留官方原始字节；`EngineAdapter` 在任务副本中对固定 4.6.5 bundle 注入导出探针。描述文件若存在，其 version 与 webgalVersion 必须一致为 4.6.5；原始文件和待准备副本均检查实际 SHA-256，出现探针字符串不再绕过校验。MyGO 3.2.1 的独立路径保持原状。
2. 安装器与时间线的 Terre 基线改为 4.6.5。官方前端的全部补丁锚点已逐项校验；使用全部 21 个非 AI 模块生成的补丁脚本通过 `node --check`。
3. `changeFigureDiff` 进入资源扫描、导出时间线、跨进程切段保护、剧情导航和相关批量工具。图片差分保留已有立绘的变换状态；Live2D/Spine 差分不被误当成普通立绘替换。
4. 导出资源屏障会主动排空 Pixi Prepare 的待上传队列，避免离线时钟停止后资源一直停留在 GPU 上传队列。图片项目不再无条件要求 Live2D 外部库；确有 Live2D 模型时仍检查它们。
5. 4.6.5 网页引擎中空回调的零间隔定时器会在导出副本里禁用，避免离线虚拟时钟无法推进。

## 历史已完成的有界验证（实验分支交接记录）

- 内核构建、Terre 时间线和导航元数据生成、JavaScript 语法检查通过。
- 官方 4.6.5 网页引擎探针启动检查通过；图片差分的 3.2 秒短片导出完成，差分前后与变换后的抽帧符合预期。
- 11.6 秒的双进程切段导出完成；切点前后无画面跳变，差分混合期间的抽帧连续。
- 透明对话框 MOV 导出完成，87 帧，ProRes 4444、`yuva444p12le`；逐字显示、`-notend`/`-concat` 与 `wait` 的抽帧符合预期。

## 尚待验证

- `transformFrom=default` 与 `current` 的实际导出对照，尤其是跨段后状态。`current` 已在图片差分短片中观察到位移；`default` 补充任务卡在浏览器内核启动前。另一次独立的 4.6.5 启动检查也超时。两次均只停止本次启动的测试进程，未触碰系统中先前存在的其他导出进程，因此尚不能据此判断变换功能成败。
- 在真实 Terre 4.6.5 安装目录中的挂载、卸载恢复及整套界面的目视验收；目前只对官方前端原包进行了独立补丁生成与语法验证。
- 较大项目和 Live2D/Spine 的 4.6.5 专项回归。本分支不宣称已通过长片或用户项目验收。


## 本轮云端审计与验证（2026-10-01）

- 已验证交接提交 `cbfb6d9` 的双亲为原实验 `39aebc2` 与 main `2b8f5225`，没有将实验功能提升到主线。
- 官方 4.6.5 raw bundle 在便携 PowerShell 7 中编译生产 `EngineAdapter`、JSON 包装及文件辅助代码，14 项选择/准备检查通过。便携层仅桥接 .NET Framework 的 JSON serializer；它不是 WebView2 验收。相同断言另有针对真实 Windows 产品程序集的执行入口。
- 检查覆盖 project-runtime、terre-template、项目优先、描述缺项/不一致、修改/探针伪装/BOM 字节变化、选择后源文件改变、重复适配、源 CSS/资源保留。测试明确要求版本、sourceKind、runtimeParity 和原始 bundle hash；不能把成功回退当作外部引擎适配成功。
- 50 项生产源码扫描检查也在便携环境通过，使用同一份 Windows 断言；媒体探测边界若被意外调用会明确失败，不伪造 FFmpeg 结果。
- 上游将 `changeFigureDiff:none` 规范化为空内容，扫描器现在允许这一实际解析结果。差分仍仅支持导出器允许的图片格式；不因此扩展视频、Live2D 或 Spine 差分支持。
- 便携差分回归覆盖显式 transformFrom 对 ignoreDefault 的优先级、同图差分的 no-op、保留的图像/变换状态和切段窗口。数据层断言不等于已经验证实际视频画面。
- Manager 的已有 `--no-recent` 开关在保留数据的卸载路径也生效，避免隔离验收写回用户最近安装记录。
- 新增 `figure-diff-native.ps1` 使用生成的彩色 PNG 和实际 4.6.5 项目运行时，要求单/双 Worker 视频抽帧验证差分位置/亮度保持、default/current、同图 no-op、none 移除和切段一致性；本轮 Windows 执行尚待完成。
- 新的 Windows 验收包含三个真实 WebView2 导出来源（bundled-runtime / project-runtime / terre-template）；外部来源还检查实际模板字体与自定义 CSS 的快照字节。新增检查尚待本轮 Windows 执行，不能用此前纯文本 bundled-runtime 成功替代。
- 安装/重装/卸载必须使用官方 Terre 4.6.5 的可丢弃副本、独立状态/缓存及 `--no-recent`，保留数据。已连接用户当前宿主实际为 4.6.4，不得用于实验覆盖安装。实验安装器使用 `-InternalBuild` 标识；未授权 Release。
