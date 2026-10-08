<!-- webvideo-compat: {"product":"terre","webgal":["4.6.6"]} -->
# WebVideo+ 1.3.1 · WebGAL 4.6.6

修复 [#31](https://github.com/Stakataka-3030/WebVideo-Plus/issues/31)：旧式配音参数后有多个分隔空格时，导出声音与立绘口型丢失的问题。缺失或无效配音现在会明确报错，文件名内部空格和全角空格保持有效。

本版仅面向 Terre / WebGAL 4.6.6。**1.1.x / 1.2.x 不回移此修复，#31 在这两个维护系列不予修复。** 4.6.4 / MyGO 3.2.1 仍使用 1.1.7，4.6.5 最终版仍为 1.2.1，Craft 保持独立 1.1.12.0c。

保留兼容模式可选 PNG、默认 JPEG、animation v2 和 Cubism2 支持。PNG 无损仅指截图格式。

本次正式发布仅分发 Windows EXE 安装器。
