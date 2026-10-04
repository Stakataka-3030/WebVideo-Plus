# Terre / WebGAL 4.6.5 适配候选

当前源码为 **1.2.0 未发布测试候选**，安装器 Win32 版本 **1.2.0.0**，内部版本 **0.9.0**，内核 **0.6.53**。以正式 1.1.6（`00015e0b8468a75c4772c3e8681d4d436e057ca6`）为基线，逐项复核并整合实验分支 `5044ddbcc52ee35591fa1fc23df3ab56ae8e1271` 与已审查的双引擎适配代码。没有合并 main、创建 tag 或发布 Release。

## 支持边界

- Terre 4.6.4 / 4.6.5 各自使用真实前端基线及独立补丁档位；保留旧版结构兼容锚点校验
- 官方 WebGAL 4.6.4 原始、已固定探针预处理快照，以及官方 4.6.5 原始运行时，分别使用准确版本、主 bundle SHA-256 和对应符号
- 优先使用项目运行时，其次兼容的 Terre 模板；已确定为 4.6.5 的项目不会静默改用 4.6.4 模板或内置基线
- 内置无项目运行时回退仍为 4.6.4，保留其原始字体、CSS 与固定探针字节；4.6.5 项目/模板自身资源保留原样，在任务副本注入探针
- MyGO 3.2.1 现有非严格专版选择/适配路径保留；新增可选严格身份检查没有扩大 MyGO 支持范围
- `changeFigureDiff` 及 `transformFrom` 依据实际导出引擎校验；旧版解析器把差分识别成对话的情况明确报错
- 图片差分保留已有 ID、位置、变换与退出动画；同图无操作、首次差分、模型与 Spine 拒绝路径分别处理
- 1.1.6 的临时按语句切点与 `;CutHere`、强制人工边界、包含背景/包含立绘四组合、同名 Live2D 动作时钟保持完整保留

## 启动语言和时序

Terre 入口只从当前同源游戏预览捕获已就绪语言：Redux 的合法整数、`localStorage.lang` 一致，且语言选择界面已关闭。该证据随普通导出和实际时间/配乐分析一起排队，并进入共享分析缓存身份。语言变化后，旧计时不会继续被标为有效。

没有可用预览语言时，官方引擎导出只接受真实项目配置中唯一且有效的 `Default_Language`。两者都缺失会提示先选择预览语言或设置项目默认语言，避免导出语言选择页面。导出仅修改任务副本的浏览器存储，不改项目、宿主或用户预览。MyGO 的原有非严格启动行为保留。

4.6.5 Pixi Prepare 队列在离线素材屏障中主动排空，不推进故事时钟；差分 perform 被纳入实际执行时长和跨 worker 恢复窗口。同名动作修复已分别对两版实际引擎函数验证。

## 固定上游输入

| 输入 | SHA-256 |
| --- | --- |
| 官方 WebGAL 4.6.4 ZIP | `f7dbb153c0372044055ad167eeddc7202c5978bf661983328490ecd8d0a391ae` |
| 官方 WebGAL 4.6.5 ZIP | `30a6a446121482cb431950c4d0457ee48f4af9652ca81250fc3f5e244537ce1b` |
| 4.6.4 原始主 bundle | `e49e15f0db25c95556b6b1eccad89d6e77a32e284cd4e4852fad7dc9a3019902` |
| 4.6.4 预处理主 bundle | `d9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10` |
| 4.6.5 原始主 bundle | `356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6` |
| Terre 4.6.4 前端 | `3b40aa7bccf427178c6580d9ed1686d3b50cc6617fa95c34632026002a9e7133` |
| Terre 4.6.5 前端 | `1c4911a397ad887cba6a13eba4e16b58faea72c6595a6b4a14f146f200232cd4` |

来源为 [官方 WebGAL 4.6.4](https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.4)、[官方 WebGAL 4.6.5](https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.5) 与 [官方 Terre 4.6.5](https://github.com/OpenWebGAL/WebGAL_Terre/releases/tag/4.6.5)。新测试输入由 `build/dependencies.lock.json` 固定；4.6.5 原始文件清单单列为 `build/runtime-4.6.5-test.json`。

## 本轮验证与尚未覆盖项

本轮在 Linux 云端执行生产 C# 源码便携检查、实际引擎函数契约、原生 C#5/.NET4.8 编译、Node 回归和真实 Terre 基线补丁检查。最终数量和运行命令见[本轮验收记录](docs/ACCEPTANCE_1.2.0_CANDIDATE.md)。

这些检查不是 Windows WebView2 成片或 GUI/GPU 像素验收。本轮尚未运行：Windows 安装/升级/卸载、实际 Terre 编辑界面、真实 WebView2 单/多 worker 视频、4.6.5 真实 SDK/MOC 成片、历史 MyGO 3.2.1 完整编译字节回归。已保留并扩展原生夹具与 CI 步骤，不能把“脚本存在”计作通过。

实验分支过去的有界成片记录属于当时提交和材料，不作为当前候选新一轮成片通过证据。
