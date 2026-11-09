# Craft 1.2.2c 验证范围

安装器 1.2.2.0c，Win32 文件版本 1.2.2.0，导出内核 0.6.66，产品基线 1.3.10。开发阶段、旧候选与最终包结果分别归档，最终提交的发行验收见[发布页](https://github.com/Stakataka-3030/WebVideo-Plus/releases)。

官方宿主仍严格限定 Windows x64 Craft 1.0.0，EXE SHA-256 为 `0de472c44f642c8f140e16bcc040a171519af59d245ae88b1b4a47987cf2756c`，不扩大精确允许列表。

## 开发阶段证据

- Live2D 表情开发阶段完成四种已知插件各 18 项合约与 9 项时钟回归。4.6.5 壳按官方 manifest 逐文件 SHA 校验，仅为合约，不等同完整宿主运行。
- 五类导出配置本来被动，本次增加 16 项实际生产入口回归。VM / DOM / 模拟桥接不等同真实 Craft 窗口和宿主验收，见[配置读取契约](PREVIEW-CONFIG-CONTRACT.md)。
- 监听修复使用原生 listener-only 表，保留 loopback、唯一 owner、祖先和原页面校验，不放宽权限；后台监听回归不证明增强界面接入、编辑或导出已通过，见[监听说明](LISTENER-VERIFICATION.md)。
- sceneOnly 独立实现阶段通过 C# 97 项及三线源码 overlay 检查、Node 99 项、官方 4.6.6 纯函数 oracle 和 1600 项 Bounds 对照，并经过独立审核；这些是源码与逻辑验证，不能代替移植后最终提交的原生验证。原理和保守回退见[sceneOnly 尾部边界](../docs/scene-only-tail.md)。

## 旧候选证据

旧候选 [5f0de0de](https://github.com/Stakataka-3030/WebVideo-Plus/commit/5f0de0de20b0c89fd964eb43bbe1b4488e61705e)（[run 42624766204](https://github.com/Stakataka-3030/WebVideo-Plus/actions/runs/42624766204)）曾完成 550 行完整预演（1460.7 秒、runtimeParity=true）及 15 秒 / 450 帧静音渲染，未改动语句、未回退引擎。这些是合入本轮新增功能前的历史候选结果，不是最新最终包验收，也不代表完整长片音视频或其他宿主通过。

此前 Craft 的 73 项 CLI 断言及旧候选 CI / EXE 记录继续保留其原提交和产物归属，不能当作新增功能合入后的最终包结果。Terre 两线的 184 项旧 CLI 断言也不证明 Craft 宿主验收。

## 最终发行包的独立验收

真实 Craft 接入仍需证明唯一主页面、增强注入、实际编辑预览、短片导出和关闭清理。最终提交的 Windows CI、正式构建、安装升级 / 重复安装 / 修复 / 卸载恢复、版本与材料完整性、公开 EXE 大小 / SHA-256、重下载和 Craft stable 更新推荐分别记录。

sceneOnly 的真实像素、PCM、并发 renderer gate 按引擎分别记录在对应发行页的最终提交验收中，不以源码或旧候选结果替代；自动 anchor 策略、Live2D SDK 像素与实测显存降低未验证。完整约 24 分钟含音视频导出和 Craft 官方 NSIS 跨版本注册升级不列为通过。原始工程、素材、SDK 与私人调查日志不作为公开证据或 Release 资产。
