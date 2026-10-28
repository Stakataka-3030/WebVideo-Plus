# 对白字幕（SRT）

新增“导出字幕（SRT）”。安装器高级选项中的“字幕导出与后处理”控制这项功能；它沿用已有字幕模块，也包含原有视频字幕后处理。

在 WebVideo+ 分栏或“导入与导出”中选择“导出字幕（SRT）”，确认故事范围、保存文件夹和文件名后导出。内容选项只有“包含说话人”，默认关闭；开启时显示为“说话人：正文”。原有“导出对话框”继续输出对话框视频。

字幕使用原生播放计划的最终时序和现有范围边界，选段从零开始。任务先完成时序规划，再直接写入 SRT，不生成视频帧或混合音轨。播放速度读取当前游戏设置，与现有自动放映导出保持一致。

普通对白开始新条目；非空 concat 只输出新增文字，避免重复前文；空 concat 延长当前条目的停留。空对白或隐藏文本框结束当前条目。富文本通过原生文字编译器提取可见文字，保留换行，丢弃样式和 ruby 注音；SRT 为 UTF-8。

相关定向检查：

```powershell
node --test tests/dialogue-subtitles.test.mjs tests/subtitle-export-ui.test.mjs tests/subtitle-module.test.mjs tests/timeline-resource-labels.test.mjs
.\tests\dialogue-subtitles.test.ps1
.\tests\subtitle-integration.test.ps1 -SourceBundle <原版Terre前端JS>
```

`subtitle-integration` 检查真实管理器生成的前端和模块开关，属于补丁层检查；文件安装事务、完整安装器和实际界面需另外验收。
