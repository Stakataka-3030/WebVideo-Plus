# 仓库结构

## 阅读入口

- [`../README.md`](../README.md)：安装、主要功能与文档导航
- [`USER_GUIDE.md`](USER_GUIDE.md)：完整使用说明与致谢
- [`BUILDING.md`](BUILDING.md)：构建、调试与发布
- [`releases/README.md`](releases/README.md)：历史发行说明索引
- [`../CHANGELOG.md`](../CHANGELOG.md)：逐版本变更记录

## 源码与资源

- `src/`：C# 导出内核与本机服务
- `browser/`：浏览器端编辑、时间线和导出模块
- `manager/`、`installer/`、`launcher/`、`bootstrap/`：管理器、安装器、启动器与引导工具
- `ai-runtime/`：可选 AI 运行时、提示词与锁定依赖
- `baseline/`：固定 Terre 4.6.4 补丁基线与历史校验元数据
- `vendor/`、`licenses/`：第三方代码、许可证与归属说明
- 根目录 `*.factory.json`：构建与 C# 嵌入资源使用的默认数据，保留现有路径与资源名称
- 根目录图标、`native.manifest`、`version.json`：原生构建输入；版本类别不可互相替换

以上路径均相对仓库根目录。`opencode-go-routing.json` 保留在原位置，供既有开发工作流使用。

## 构建与检查

根目录只保留常用的 PowerShell 构建入口：

- `prepare-build.ps1`：准备固定第三方运行资源
- `build.ps1`：编译本机导出组件，并运行生命周期检查
- `build-product.ps1`：组合产品并生成安装器

辅助构建与性能比较脚本放在 `scripts/`；自动检查放在 `tests/`。从仓库根目录可运行不依赖 Windows 编译器的检查：

```sh
node --test tests/*.test.mjs
node tests/verify-export-lifecycle.mjs
node tests/update-check-and-atlas.mjs
node scripts/build-timeline.mjs
node scripts/configure-installer.mjs
```

后两项会生成资源/安装器源码；完整原生编译仍需要 Windows 及构建文档列出的依赖。`package/`、`dist/`、`.build/` 和 `node_modules/` 都是忽略的构建产物，不应提交。

## 维护约定

- 新发行说明写入 `docs/releases/`，更新其索引和 README 当前版本链接；保留用于更新检查的兼容性标记
- 当前版本以根目录 `version.json` 为真源；历史发行说明、bootstrap 固定版本、测试夹具和上游依赖版本不随产品版本机械替换
- 移动文件时同步检查脚本、工作流、文档链接及发布包内的路径
- 不通过整理目录改变原有许可或第三方归属；许可范围见 [`../LICENSES.md`](../LICENSES.md)
