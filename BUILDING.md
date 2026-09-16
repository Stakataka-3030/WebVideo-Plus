# 构建与发布

当前产品0.4.10，安装器修订0.4.10.2。开发于Windows，使用系统.NET Framework C#编译器及Node 22.20.0。

## 初次准备

1. 使用Windows PowerShell 5.1或PowerShell 7，安装Node.js 22.20.0或兼容版本。
2. 从Release下载 `bootstrap-installer-0.4.10.2.exe`。它仅作为固定版本的WebView2 SDK和WebGAL导出运行资源来源，不会在构建时启动安装程序。
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

输出位于 `dist/`。`package/`、`dist/`、`.build/`和node_modules都不提交。脚本不依赖维护者的个人目录；Node位置由当前PATH解析。

## 当前边界

这是一份整理后的现有工程，而不是重新编写的独立编辑器。首次构建仍依赖固定bootstrap中的WebGAL运行快照和WebView2二进制资源；没有宣称从源码重建全部第三方引擎和SDK。C#内核、管理器、安装器及浏览器扩展从本仓库源码构建，process-guard也由源码编译。

精确补丁使用baseline/terre-4.6.4.js，与Terre 4.6.4对应。更新上游时需要重新核对补丁锚点，不能只修改版本号。

安装器的AI勾选框位于主界面，标记Beta，并有API Key提示。AI运行环境随包离线提供。仅启用时部署运行目录。

本项目目前按编译和安装检查交付；模型调用、视觉效果、真实作品播放及导出由使用者验收。不要把源码发布视为完整功能验证。
