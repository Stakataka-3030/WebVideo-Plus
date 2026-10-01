# WebVideo+

面向 **WebGAL Terre 4.6.4** 的视觉小说视频制作辅助工具：批量编辑、剧情导航、音乐配置、备份与检查、Anogo 故事导入，以及本机视频导出。生成式 AI 是默认不安装的可选 Beta 组件，需要自行配置 API Key。

[下载安装器](https://github.com/Stakataka-3030/WebVideo-Plus/releases/latest) · [使用指南](docs/USER_GUIDE.md) · [1.1.4 发行说明](docs/releases/RELEASE_NOTES_1.1.4.md) · [构建说明](docs/BUILDING.md)

当前源码版本 **1.1.4**，内部开发标识 **0.8.8**，安装器 Win32 版本 **1.1.4.0**，导出内核 **0.6.48**，统一以 [`version.json`](version.json) 为准。最新正式安装器、校验值和发布说明以 [GitHub Releases](https://github.com/Stakataka-3030/WebVideo-Plus/releases/latest) 为准；当前不声明兼容 Terre 4.6.5。

## 安装与开始使用

1. 在 Windows 上准备已有的 **Terre 4.6.4** 安装目录。
2. 从 [Releases](https://github.com/Stakataka-3030/WebVideo-Plus/releases/latest) 下载 `WebVideo+-Setup-*.exe`，运行并选择 Terre 目录。
3. 默认安装常用模块；高级选项可单独增删功能、设置数据与缓存目录。灰选模块是其他已选功能的依赖。
4. 安装完成后照常启动 Terre，在编辑器中使用 WebVideo+ 工具。

支持标准版及 Steam 版常见的 Terre 主程序命名。可选 MyGO 集成优先使用已有本机引擎，不捆绑角色素材或模型。

卸载时默认清理缓存，删除配置和用户数据需要单独勾选；已导出的 MP4 和 WebGAL 游戏工程本身不会删除。重要工程仍建议保留自己的备份。

## 能做什么

- **编辑与演出**：批量 ID、表情、滤镜、`-next`、自动离场，以及分类预制效果
- **剧情与音乐**：剧情导航、连续区间选择、时间线工具、并行音乐与时长匹配
- **检查与恢复**：待核对标记、自动备份和确认回滚
- **视频与字幕**：全文或区间导出；可选软字幕封装或 FFmpeg/libass 烧录，字幕内容由外部编辑器制作
- **故事导入**：Anogo 文本/JSON/YAML；可选 AI 将小说转换为可预览、待核对的剧本骨架

导出默认使用 GPU Raw 管线。建议从 **1080p、推荐 / 高质量** 开始；编码器会探测 NVENC、AMF、Quick Sync，必要时回退 CPU x264。完全无损可能产生非常大的文件，传统兼容管线更慢。分辨率、并行数、缓存和 AI 配置详见[完整使用指南](docs/USER_GUIDE.md)。

## 文档与开发

- [使用指南](docs/USER_GUIDE.md)：详细功能、安装/卸载、数据目录、AI 配置和上游致谢
- [构建与发布](docs/BUILDING.md)：Windows 工具链、固定上游依赖、正式/内部构建及验证
- [发行说明索引](docs/releases/README.md)与[完整变更记录](CHANGELOG.md)：保留历史说明，按版本查阅
- [仓库结构](docs/REPOSITORY.md)：源码、工厂数据、构建脚本与测试的位置

从源码构建不需要先下载旧版安装器；第三方输入按官方来源及 SHA-256 锁定，支持缓存和离线重新准备。根目录保留三个常用构建入口：`prepare-build.ps1`、`build.ps1`、`build-product.ps1`。辅助脚本位于 `scripts/`，回归检查位于 `tests/`；请从仓库根目录按[构建说明](docs/BUILDING.md)操作。

## 许可证与致谢

WebVideo+ 原创源代码、构建脚本和原创数据采用 **[MPL-2.0](LICENSE)**。仓库包含混合来源材料，根许可证不会覆盖第三方原有条款；Anogo 默认动作词表继续采用 AGPL-3.0，js-yaml 采用 MIT，其他材料以[许可范围映射](LICENSES.md)、[来源说明](NOTICE.md)和[第三方许可](licenses/THIRD-PARTY.md)为准。

感谢 WebGAL / Terre、FFmpeg、WebView2、DeepSeek Harness、pi-ai、Anogo、webgal-skill 及社区贡献者，特别感谢北风的猫5306 提供的工作流与演出资料。[完整引用与致谢](docs/USER_GUIDE.md#开源项目引用与致谢)保留了来源和用途说明。角色、Live2D、音乐等素材的权利仍归各自权利人。
