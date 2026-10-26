# FFmpeg 工具与分发材料

本版采用固定 BtbN win64 GPL 静态构建。固定输入、源码索引和配套分发信息记录在 `build/ffmpeg-corresponding-source.json`。

## 固定输入

- 发行：[autobuild-2026-09-30-13-08](https://github.com/BtbN/FFmpeg-Builds/releases/tag/autobuild-2026-09-30-13-08)。
- 二进制：`n9.0.2-17-g2a571b6068-20260930`，9.0 维护分支，Windows x64，GPLv3，不启用 nonfree。
- 归档：`ffmpeg-n9.0.2-17-g2a571b6068-win64-gpl-9.0.zip`，194,034,585 字节；SHA-256 `a0e45723c72141975f51d8666302e614711745f3102b704ca3f82c897a58d278`。
- `ffmpeg.exe`：`513368c81583572ce1d09d5c7ff827feed1a63db352412a5001f4da3a1583d98`。
- `ffprobe.exe`：`0fd8f3bae96cc707993bcd8c56c13f8cd73962d37dbcaac0dad4fe3a0ce1f68f`。
- FFmpeg 主体源码：[2a571b606854520cf89804d8030c8b328e621689](https://github.com/FFmpeg/FFmpeg/tree/2a571b606854520cf89804d8030c8b328e621689)；实际构建含 9.0.2 之后的 17 个提交，不能用纯 9.0.2 归档替代。
- 构建配方：[6c9aec5fc9a72ec3abedd1fa84db141fa18cf52b](https://github.com/BtbN/FFmpeg-Builds/tree/6c9aec5fc9a72ec3abedd1fa84db141fa18cf52b)，包含脚本、补丁、配置、CI 与构建环境说明。

`licenses/FFMPEG-GPL-3.0.txt` 保留 GPL 全文；`licenses/FFMPEG-BUILD-README.txt` 是本项目整理的固定来源记录，不冒充上游 README。FFmpeg 作为独立命令行工具使用，其许可不替换 WebVideo+ 原创代码的 MPL-2.0。依赖源码、递归子模块、额外下载和必要构建脚本按固定配方另行整理，源材料不塞进安装器。配方仓库快照本身不等于全部依赖源码。

## 安装与构建

安装器只携带 ffmpeg、ffprobe，不带 ffplay。两个工具与自有组件分别采用 solid 7z 压缩，附带固定 7-Zip 25.00 命令行、DLL 与许可证；使用前后均校验哈希。工具在同盘临时目录准备，完整验证后原子替换，失败保留原目录。

安装沿用现有工具探测与手动选择。有效的原 Gyan 工具缓存继续复用；缺失时从安装器释放固定 BtbN 工具。每个 Terre 组件副本不重复保存工具。旧载荷的下载分支同步使用固定归档和校验和。

WebView2 仍优先使用系统运行时，缺失时沿用微软引导程序；安装并非完全离线。

```powershell
.\prepare-build.ps1 -Offline -CacheDirectory <已校验缓存>
.\build-product.ps1 -InternalVersion <候选标识>
.\tests\bundled-runtime.test.ps1 -OutputRoot <隔离测试输出>
```

对应源码材料核对、实际工具编码/释放与安装验收各自记录结果；源码状态未完成不视为通过。

## 对应材料与兼容验证

固定源码、递归子模块、Rust 锁文件所列 vendor 材料、必要脚本及补丁已采集并逐项核验哈希。索引见 `build/ffmpeg-source-materials.json`。Rust 材料包含构建工具、测试和其他平台条目，是保守的源码集合，不代表全部条目都链接到二进制。完整原始许可保留在各源码归档中，安装器另附 `licenses/FFMPEG-DEPENDENCY-NOTICES.txt`。

对应源码与构建材料通过固定第三方源码发行提供[独立附件](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/third-party-sources-ffmpeg-20260930-7zip-25.00/BtbN-FFmpeg-win64-gpl-9.0-20260930-source-materials.zip)，两条产品线及后续采用相同工具版本的更新共用此材料包。附件为采集时的固定快照，包内准备状态文字不代替发行页的公开状态。归档大小 876694235 字节，SHA-256 `faf6e08870a17d5a97ea4bc4c95c05178b92d1e27de29f6ae713e6d0e98c72c7`。上游脚本中的 `cargo update cc` 与浮动构建环境如实记录；本项目不自行编译或宣称逐字节复现。

此固定构建的 NVENC 编码要求驱动支持 NVENC API 13.1，FFmpeg 报告的最低 NVIDIA 驱动版本为 610.00。API 版本与驱动版本不同；硬件编码按实际显卡和驱动探测。

归档可使用 [verify-source-materials.py](../scripts/verify-source-materials.py) 只读核对各条目长度和 SHA-256。Python 仅用于这项可选材料校验，不是产品安装、运行或常规构建要求。

7-Zip 25.00 的[官方完整源码归档](https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/third-party-sources-ffmpeg-20260930-7zip-25.00/7z2500-src.7z)在同一独立发行页单列，包含源码、构建 makefile 和上游许可；不包含在 FFmpeg 材料 ZIP 内。大小 1,518,060 字节，SHA-256 `4ca381182186c7d0f6bfdbb2dc608adb9aedce908948013219875201d3e32a47`，上游来源为 [ip7z/7zip 25.00](https://github.com/ip7z/7zip/releases/tag/25.00)。
