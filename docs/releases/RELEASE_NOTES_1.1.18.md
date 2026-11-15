<!-- webvideo-compat: {"product":"terre","webgal":["4.6.4"]} -->
# WebVideo+ 1.1.18

- 修复大量语音、音效和 BGM 混合时，FFmpeg 总命令行超过 Windows 长度限制导致导出失败的问题。
- 视频和纯音轨导出共用有界混合流程，保留音量、声道、循环标签、延迟、淡入淡出与静音区间，全局限幅只在最终混音执行。

- 修复调整 MyGO 动作淡入淡出等兼容设置后，引擎选项消失的问题。
- 项目引擎与回退基线统一按补丁结构判断，保留兼容的自定义参数。

适用于 Terre / WebGAL 4.6.4、MyGO 和本线支持的 LoveLive。

构建内核：0.6.70。音频回归与验证范围见 [音频混合验证](../verification/audio-mix-command-limit.md)。
