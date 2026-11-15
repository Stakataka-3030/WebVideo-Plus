<!-- webvideo-compat: {"product":"terre","webgal":["4.6.6"]} -->
# WebVideo+ Terre 1.3.12

- 修复大量语音、音效和 BGM 混合时，FFmpeg 总命令行超过 Windows 长度限制导致导出失败的问题。
- 视频和纯音轨导出共用有界混合流程，保留音量、声道、循环标签、延迟、淡入淡出与静音区间，全局限幅只在最终混音执行。

适用于 Terre / WebGAL 4.6.6，兼容范围保持不变。

- 修复 MyGO 插件仅调整动作淡入淡出等兼容参数后无法识别的问题。
- 项目引擎与回退基线统一按补丁结构检查，保留自定义设置。

构建内核：0.6.70。音频回归与验证范围见 [音频混合验证](../verification/audio-mix-command-limit.md)。
