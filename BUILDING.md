# 构建与发布

当前产品0.4.10，安装器修订0.4.10.2。开发于Windows，使用系统.NET Framework C#编译器及Node 22.20.0。

## 初次准备

1. 使用Windows PowerShell 5.1或PowerShell 7，安装Node.js 22.20.0或兼容版本。
2. 准备固定的 `bootstrap-installer-0.4.10.2.exe`。它仅作为固定版本的WebView2 SDK和WebGAL导出运行资源来源，不会在构建时启动安装程序。
3. 在仓库目录执行：

```powershell
.\prepare-build.ps1 -InstallerPath C:\Downloads\bootstrap-installer-0.4.10.2.exe
Push-Location ai-runtime
npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
Pop-Location
.\build-product.ps1
```

国内网络可为npm ci附加 `--registry=https://registry.npmmirror.com`。以提交的锁文件和完整性校验值为准，不重新解析latest。

固定bootstrap安装器SHA-256：`1ed9f61ab893f32c59c84a5b1a0865fea760789b1e5b71d79fd8083e7b00ed2d`。

`prepare-build.ps1` 会先清空并重建 `package/` 与 `.build/`，避免旧构建文件残留。之后再执行 `npm ci`，不要在安装依赖后重复运行 `prepare-build.ps1`。

输出位于 `dist/`。`package/`、`dist/`、`.build/`和node_modules都不提交。脚本不依赖维护者的个人目录；Node位置由当前PATH解析。

面向最终用户的Release只需要 `dist/WebVideo+-Setup-0.4.10.2.exe`。安装器不依赖同名 `.exe.config` sidecar；构建脚本也不会再生成该文件。`webvideo-plus.zip`及其SHA-256文件是安装器构建中间产物，可用于内部核对，不要求随Release发布。

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

这是一份整理后的现有工程，而不是重新编写的独立编辑器。首次构建仍依赖固定bootstrap中的WebGAL运行快照和WebView2二进制资源；没有宣称从源码重建全部第三方引擎和SDK。C#内核、管理器、安装器及浏览器扩展从本仓库源码构建，process-guard也由源码编译。

精确补丁使用baseline/terre-4.6.4.js，与Terre 4.6.4对应。更新上游时需要重新核对补丁锚点，不能只修改版本号。对于前端被重新打包但挂载语义未变化的 Terre 4.6.4 变体，部分锚点允许在限定结构范围内使用正则匹配；仍要求目标唯一，避免把兼容性放宽成无条件写入。

安装器的AI勾选框位于主界面，标记Beta，并有API Key提示。AI运行环境随包离线提供。仅启用时部署运行目录。

本项目目前按编译和安装检查交付；模型调用、视觉效果、真实作品播放及导出由使用者验收。不要把源码发布视为完整功能验证。
