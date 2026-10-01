# WebVideo+ Craft 注入原型

这个 Windows 原型使用 **Craft 已发布的程序**，不重新编译，也不覆盖原安装。安装器在独立目录放置启动包装器、注入脚本、Node 运行时和 WebVideo+ 内核。请关闭原 Craft，再启动 `WebVideoCraft.Launcher.exe`。包装器只在本次 Craft 进程中开启随机的本机 WebView2 调试端口，向编辑器顶栏注入一个“导出视频”按钮；Craft 退出时端口随进程关闭。不要把这个调试端口暴露到网络。

按钮从 Craft 的当前工程记录读取游戏、引擎和模板路径，调用 Craft 原有的 `export_web` 命令把 VFS 叠加层整理到临时目录，再由 `WebGAL.Video.exe` 导出 MP4。未修改 Craft 的项目文件或原程序。成功后清理临时 Web 目录，失败时保留供排查；导出工作目录保留任务记录。运行日志在适配包目录的 `craft-injection.log`，任务日志在成片旁的 `.native-work-*` 目录。

从同版本已构建的 `package/` 运行 `./craft/build-craft-package.ps1`，得到 `dist/WebVideoCraft-Setup-1.1.2.0c.exe`。安装时选择现有 `webgal-craft.exe`；默认适配包目录是 `%LOCALAPPDATA%/WebVideoCraft/1.1.2.0c`。内核标识为 `0.6.46c`，与 Terre 版隔离。随包包含 Node.js 22.20.0 及其许可证；FFmpeg 和 ffprobe 仍需在系统 PATH 中。

这是最小功能验证：固定从 `start.txt` 开始，1280×720、30 fps、1 进程、完整 MP4，其他行为沿用内核默认值。点击前需先在 Craft 保存编辑中的内容。已在本机 Craft `1.0.0-beta.2` 的隔离副本验证“注入按钮 → Craft 原生 VFS Web 导出 → WebVideo+ 导出”，用 WebGAL 4.6.4 测试工程得到 6.6 秒、198 帧 H.264 成片。当前工程自动识别逻辑尚未用一个真实注册在 Craft 中的工程做最终验收，因此不作为正式发布版。
