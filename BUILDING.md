# 构建与发布

本分支为 WebVideo+ Craft 1.1.17c（安装器 1.1.17.0c；内核 0.6.61）；版本以 `craft/version.json` 与根 `version.json` 为准。

当前 Craft 构建、打包步骤及验收边界以 [Craft 说明](craft/README.md) 为准。构建输入由 `prepare-build.ps1` 按 `build/dependencies.lock.json` 的固定来源和哈希准备；AI 运行模块使用 `scripts/build-ai.ps1`，独立安装包使用 `craft/build-craft-package.ps1`。

`craft/version.json` 记录 Craft 产品、安装器和 Win32 文件版本；根目录 `version.json` 记录共享产品基线与内核版本。两者用途不同，不能只修改其中一个版本字符串就宣称完成版本推进。

[Terre 基础工程与诊断说明](docs/BUILDING.md) 保留历史构建流程和 GPU 导出诊断资料，其中的历史版本号不代表当前 Craft 产品。根目录保留的 Terre 产品构建脚本不用于生成 Craft 安装器。

版本历史见 [CHANGELOG.md](CHANGELOG.md)，源码与构建来源记录见 [Craft 构建来源](craft/BUILD-PROVENANCE.md)，第三方来源和许可见 [NOTICE.md](NOTICE.md) 与 [LICENSES.md](LICENSES.md)。
