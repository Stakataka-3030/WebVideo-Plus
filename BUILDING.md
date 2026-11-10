# 构建与发布

本地未发布开发候选：Craft 1.2.3c，安装器 1.2.3.0c，Win32 1.2.3.0，内核 0.6.67；共享产品基线 1.3.10。已离线生成本地候选安装器，未发布；实际宿主及安装器图形界面尚未验收。


本发行线为 WebVideo+ Craft 1.2.2c（安装器 1.2.2.0c；内核 0.6.66），共享产品基线为 1.3.10，内部开发标识保留 0.9.8；版本以 `craft/version.json` 与根 `version.json` 为准。最终提交 CI、正式安装器与隔离宿主验收见[本版发布页](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/craft-v1.2.2.0c)；发布页公开前不表示安装器已经上线。

当前 Craft 构建、打包步骤及验收边界以 [Craft 说明](craft/README.md) 为准。构建输入由 `prepare-build.ps1` 按 `build/dependencies.lock.json` 的固定来源和哈希准备；AI 运行模块使用 `scripts/build-ai.ps1`，独立安装包使用 `craft/build-craft-package.ps1`。

`craft/version.json` 记录 Craft 产品、安装器和 Win32 文件版本；根目录 `version.json` 记录共享产品基线与内核版本。两者用途不同，不能只修改其中一个版本字符串就宣称完成版本推进。

[Terre 基础工程与诊断说明](docs/BUILDING.md) 保留历史构建流程和 GPU 导出诊断资料，其中的历史版本号不代表当前 Craft 产品。根目录保留的 Terre 产品构建脚本不用于生成 Craft 安装器。

版本历史见 [CHANGELOG.md](CHANGELOG.md)，源码与构建来源记录见 [Craft 构建来源](craft/BUILD-PROVENANCE.md)，第三方来源和许可见 [NOTICE.md](NOTICE.md) 与 [LICENSES.md](LICENSES.md)。
