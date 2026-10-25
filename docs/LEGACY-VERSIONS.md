# 历史版本与 EOL

以下维护线已结束维护，保留对应安装器、兼容范围、校验及使用说明。当前维护版本见[项目首页](https://github.com/Stakataka-3030/WebVideo-Plus#下载与版本选择)。

| 适用环境 | 最终版本与状态 | 下载 | 发行与校验 |
| --- | --- | --- | --- |
| Terre / WebGAL 4.6.5 | 1.2.1，内核 0.6.54，EOL | [WebVideo+-Setup-1.2.1.exe](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/v1.2.1/WebVideo%2B-Setup-1.2.1.exe) | [v1.2.1](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/v1.2.1) · [SHA256SUMS.txt](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/v1.2.1/SHA256SUMS.txt) |
| 官方 Windows x64 Craft 1.0.0-rc.1 / 1.0.0-beta.2 | Craft 1.1.17c，安装器 1.1.17.0c，内核 0.6.61，EOL | [WebVideoCraft-Setup-1.1.17.0c.exe](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/craft-v1.1.17.0c/WebVideoCraft-Setup-1.1.17.0c.exe) | [craft-v1.1.17.0c](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/craft-v1.1.17.0c)，SHA-256 见发行正文 |

## Terre / WebGAL 4.6.5

1.2.1 是 4.6.5 的最终版，已停止维护。保存工程并关闭 Terre 后，运行对应安装器并选择 Terre 目录。更新使用同一通道安装器；卸载默认清理缓存，删除配置和数据需要单独勾选，不删除 WebGAL 工程或已导出的视频。

该版本支持 JPEG / PNG 兼容捕获，默认 JPEG；PNG 避免截图压缩，最终 H.264 仍为有损编码。功能和数据目录以该标签的[使用指南](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.2.1/docs/USER_GUIDE.md)及[构建说明](https://github.com/Stakataka-3030/WebVideo-Plus/blob/v1.2.1/docs/BUILDING.md)为准。

## Craft RC1 / beta.2

维护分支 `release/craft-1.1.15c` 在 1.1.17c 结束维护。精确支持的官方 Windows x64 主程序为：

- Craft 1.0.0-rc.1：SHA-256 `c1f3cd843a5b3d09a8c7232a7e8158492a1c4feec3d96c99f8b809d30e3a5b1f`。
- Craft 1.0.0-beta.2：SHA-256 `3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d`。

工程引擎范围是官方 WebGAL 4.6.4 / 4.6.5 / 4.6.6 和 MyGO 3.2.1（基础 WebGAL 4.6.4），均按精确构建匹配；同版本的自定义包不自动视为兼容。最终安装器 SHA-256 为 `f92d564562446ac5343109cc9f4153aa3817b118a244094254bb10a9a14bcbc9`。

保存工程并正常关闭 Craft 后运行旧线安装器，选择程序、目录或快捷方式并安装增强组件。安装器校验并保存原程序，统一使用原 `webgal-craft.exe` 入口；旧独立增强安装可迁移，原快捷方式继续有效。更新、修复和卸载挂载使用同一安装器；卸载保留组件、配置、日志和数据，不删除工程或视频。

1.1.12c 及更早的增强版需手动下载安装；1.1.13c 起支持仅提供 EXE 附件的发行格式，早期客户端依赖的独立描述文件不再随新版本提供。增强更新由明确检查、下载和校验后打开 Setup；运行中的 Craft 会阻止覆盖安装。官方更新保留原来源、公钥和签名校验，确认后正常关闭并交接官方安装器；更新到新宿主后应使用匹配该宿主的增强包重新挂载。真实注册安装的跨版本 NSIS 升级仍未验收。

1.1.17c 保留 JPEG / PNG 捕获、语句/`;CutHere`/帧秒时间码手动切点。手动模式不自动移动或补点，有效切点为空时单段导出；仅音轨不执行视频分段。新配置每进程 Cubism Core 初始内存默认 128 MiB，已有显式值（包括 0）保留；0 使用引擎默认值，手动范围 16–1024 MiB。具体限制和历史验证见以下固定标签文档：

- [安装与管理](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/craft/README.md)
- [功能范围](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/craft/FEATURE-COVERAGE.md)
- [导出说明](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/craft/EXPORT-PARITY.md)
- [既有验收边界](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/craft/ACCEPTANCE-1.1.15c.md)

## 历史基线文档

Terre 历史基线资料继续保留：[1.1.2](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/RELEASE_NOTES_1.1.2.md)、[1.1.1](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/RELEASE_NOTES_1.1.1.md)、[1.1.0](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/RELEASE_NOTES_1.1.0.md)、[1.0.4](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/RELEASE_NOTES_1.0.4.md)、[1.0.3](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/RELEASE_NOTES_1.0.3.md)、[1.0.2](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/RELEASE_NOTES_1.0.2.md)、[1.0.1](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/RELEASE_NOTES_1.0.1.md)、[1.0.0](https://github.com/Stakataka-3030/WebVideo-Plus/blob/craft-v1.1.17.0c/RELEASE_NOTES_1.0.0.md)。完整版本沿革见[变更记录](../CHANGELOG.md)和[历史发行索引](https://github.com/Stakataka-3030/WebVideo-Plus/blob/main/docs/releases/README.md)。
