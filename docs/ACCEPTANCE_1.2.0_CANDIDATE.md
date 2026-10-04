# 1.2.0 适配候选验收记录

状态：云端源码集成与便携回归通过，等待原生测试包构建及 Windows 成片/UI 验收。产品 1.2.0、安装器 1.2.0.0、内部版本 0.9.0、内核 0.6.53。未发布、未合并 main。

## 已完成的本轮检查

| 检查 | 结果与实际范围 |
| --- | --- |
| Node 汇总 | 124 项通过；双宿主真实解析器、按语句/注释切点、立绘控制、动作状态、导航/作者工具、语言证据与计时缓存、构建输入与文档 |
| 生产 C# 引擎/语言检查 | 156 项通过；使用官方 4.6.4 / 4.6.5 原始字节和 4.6.4 预处理字节；描述、SHA、选择顺序、版本不匹配/变更/缓存、启动语言边界 |
| 生产 C# 人工切点检查 | 178 项通过；包含按语句锚点、标记、精确边界、范围/重复/失效和旧数值请求兼容 |
| 生产 C# 资源扫描 | 66 项通过；差分图片、SVG/BMP/AVIF 快照、旧解析器保留的差分原始标记、模型/SDK/动态引用与版本能力 |
| 真正的 C# 宿主补丁函数 | 16 份完整输出；2 版 Terre × 4 组模块 × 原始/结构变体，额外检查重复注入与缺锚点拒绝，全部输出通过 JavaScript 语法检查 |
| 固定引擎动作函数 | 两版各 15 组生命周期场景；从各自主 bundle 提取原始函数，与实际生产 planner 输出比较；重新引入同名动作重启会令测试失败 |
| 固定 4.6.5 差分函数 | 15 例；未改写的原始调度器与 URL 分类函数，验证首次/移除委托、同图、状态保留、模型/Spine 拒绝、SVG/BMP/AVIF 与 PNG 的双向替换 |
| 固定 Live2D 插件和帧调度器 | 两版各 30/60fps × 普通/合成路径；开启/关闭立绘的命令、时钟、update/draw 次数、资源等待、音频时间与帧数相同 |
| 完整生产源码编译 | C#5 / .NET Framework 4.8 的导出内核、process guard、Terre launcher、Manager、生成的 installer 源码共 5 个目标通过；安装器只做源码编译，未把编译检查产物当作可分发安装包 |
| 输入与生命周期 | 官方 ZIP/SDK/Node/bootstrap 固定哈希、离线重建、16 份内置运行文件、资源路径安全、Update/atlas 和 export lifecycle 检查通过 |

C# 源码测试使用 PowerShell 7 的 JSON 桥接，其他被测类来自生产源码。它不等同于 Windows .NET Framework 产品进程执行。编译只出现既有 CS4014/CS0414 和 Roslyn 引用版本匹配警告 CS1701。

CI 中会编译重复类型的测试均放入独立 `pwsh -NoProfile -File` 子进程并检查退出码；已重现并消除同一进程重复 Add-Type 的冲突。

## 可重复的主要命令

准备官方引擎夹具后运行：

```powershell
node --test tests/*.test.mjs
pwsh -NoProfile -File tests/engine-adapter-dual-profile.test.ps1 -Webgal464Root <官方4.6.4目录> -Webgal465Root <官方4.6.5目录> -Portable
pwsh -NoProfile -File tests/manual-cuts.test.ps1
pwsh -NoProfile -File tests/font-render-preflight.portable.ps1
pwsh -NoProfile -File tests/terre-host-patch.test.ps1
node tests/cubism2-runtime-contract.mjs
node tests/cubism2-runtime-465-contract.mjs <官方4.6.5目录>/assets/index-CC7KTie-.js
node tests/figure-diff-runtime-contract.mjs <官方4.6.5目录>/assets/index-CC7KTie-.js
node tests/figure-export-runtime.mjs
node tests/figure-export-runtime.mjs <官方4.6.5目录>/assets/index.es-0XzJiDJZ.js
node tests/verify-export-lifecycle.mjs
```

正常压缩的候选安装包应使用 `build-product.ps1 -InternalBuild`，不加 `-Fast`。这会保留产品升级版本 1.2.0，同时将安装界面与产物标记为内部测试包。

## 未运行与待验收

- 本轮没有运行 Windows 安装器、启动 Terre，或操作用户已有工程
- 本轮没有新的 GPU 像素、实际 WebView2 编码、4.6.5 实际 Live2D SDK/MOC 单/多 worker 成片结果
- MyGO 3.2.1 原有补丁语义保留，严格身份/回退边界得到便携检查；完整历史编译夹具未取得，`engine-adapter-mygo-profile.test.ps1` 未执行
- 原生图片差分单/双 worker、字体、透明舞台/立绘四组合以及双版本文件级安装恢复夹具已保存，但其存在不代表本轮已通过
- 本地源码通过不代表远端 CI 通过；本轮未推送或触发远端工作流

此前实验分支的视频验收仅属于其原提交、原测试文件和当时记录，不移作本候选的新验收结果。所有当前测试使用官方公开引擎或合成数据，没有打包私有模型或额外第三方 SDK。
