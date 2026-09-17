# 构建与发布

当前源码产品版本 **0.4.11**，下一安装器修订 **0.4.11.0**，内核 **0.3.15-internal**；当前最新公开 Release 仍为 **0.4.10.2**。开发于 Windows，使用系统 .NET Framework C# 编译器及 Node 22.20.0。

产品、安装器和内核版本的唯一源码真源是根目录 `version.json`。需要推进版本时只修改该文件；`manifest.mjs`、`build-product.ps1`、`configure-installer.mjs`、C# 安装/运行元数据和 staged AI runtime 会在构建或运行时读取该版本信息，不应再手工同步版本常量。

## 初次准备

1. 使用 Windows PowerShell 5.1 或 PowerShell 7，安装 Node.js 22.20.0 或兼容版本。
2. 从 GitHub Release 下载当前已发布的 `WebVideo+-Setup-0.4.10.2.exe`。构建脚本只从其中抽取固定版本的 WebView2 SDK、WebGAL 导出运行资源和许可文件，不会启动安装程序。
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

按当前 `version.json`，构建产物为 `dist/WebVideo+-Setup-0.4.11.0.exe`。面向最终用户的 Release 只需要对应版本的安装器；安装器不依赖同名 `.exe.config` sidecar。`webvideo-plus.zip` 及其 SHA-256 文件只是安装器构建中间产物。

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

## 当前边界

这是一份整理后的现有工程，而不是重新编写的独立编辑器。首次构建仍从固定安装器中抽取 WebGAL 运行快照和 WebView2 二进制资源；没有宣称从源码重建全部第三方引擎和 SDK。C# 内核、管理器、安装器、process-guard、launcher 及浏览器扩展均从本仓库源码构建。

精确补丁使用 `baseline/terre-4.6.4.js`，与 Terre 4.6.4 对应。更新上游时需要重新核对补丁锚点，不能只修改版本号。对于前端被重新打包但挂载语义未变化的 Terre 4.6.4 变体，部分锚点允许在限定结构范围内使用正则匹配；仍要求目标唯一，避免把兼容性放宽成无条件写入。

安装器的 AI 勾选框位于主界面，标记 Beta，并有 API Key 提示。AI 运行环境随包离线提供，仅启用时部署。

源码可复现当前 WebVideo+ 自有部分的构建；由固定安装器抽取的第三方二进制仍按其各自来源与许可处理。完整来源和许可说明见 `NOTICE.md` 与 `licenses/THIRD-PARTY.md`。