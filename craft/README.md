# WebVideo+ Craft 开发版

此目录是基于本机 `craft/mvp`（bee5888）继续开发的完整 Craft 编辑器适配，不是只提供导出按钮。当前保留官方 Craft 自动检查更新，功能入口通过当前启动会话的 WebView2/CDP 注入。未改官方更新源、公钥和签名校验。

## 当前边界

- 已验证宿主：官方 Windows `1.0.0-beta.2`，SHA-256 `3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d`
- 已验证精确引擎档位：官方 WebGAL 4.6.4 / 4.6.5，仍逐项校验描述、运行时字节及工程绑定，不接受未来版本或自定义同版本包
- 安装默认为独立增强入口。宿主保持原文件；直接打开官方 EXE 不会自动加载增强界面
- 同名包装器是显式实验选项，需先在隔离副本测试。未知宿主哈希会拒绝挂载
- 完整功能状态见 [FEATURE-COVERAGE.md](FEATURE-COVERAGE.md)，云端单元测试与 Windows 实测分开记录
- 协调更新安装保持关闭：本机非提权安装观察权限不足，且真实官方升级接续尚未验证。Craft 自带更新检查及更新入口继续保留；官方更新后须检查新宿主兼容性，必要时重新安装适配并从增强入口启动，不能承诺自动恢复
- 已完成原生编辑/撤销、重载注入、VFS、实际预览速度及两个精确引擎的成片验证；最后的音乐/字幕/取消与安装恢复验收见 [FINAL-ACCEPTANCE.md](FINAL-ACCEPTANCE.md)

## 编辑与工程

批量编辑通过 Craft 原生文档事务提交，保留未保存状态和原生撤销。提交前检查工程、活动文档、文本、revision 和引擎绑定；等待超过宿主历史合并窗口，期间文本有变化就要求重新预览。不会使用把文档标记为 clean 的系统重构同步接口。

资源列表和读取通过 Craft 的 VFS。导出使用官方 export_web 生成拥有明确归属的临时快照，并检查源文件/文档是否变化。工程的引擎与模板来自原生注册表和绑定配置；不把默认文件夹扫描当成工程发现。

音乐时长来自实际探测，故事时间来自实际引擎运行。预览速度通过经过所属页面检查的独立 iframe/CDP session 读取。没有准确加载配置证据时，速度修改只影响本次预览，并明确说明；不会猜测 IndexedDB 存档键。

## 构建（Windows，隔离工作目录）

1. 运行 `powershell -File prepare-build.ps1`，从带 SHA-256 校验的官方固定来源重建输入；不再强制依赖历史安装器
2. 运行 `powershell -File build.ps1`，编译本次源代码的原生内核
3. 在 `ai-runtime` 执行 `npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund`，再运行 `powershell -File scripts/build-ai.ps1`，准备本次源码的 AI 运行模块；构建不调用模型服务
4. 运行 `powershell -File craft/build-craft-package.ps1`，生成独立适配安装包
5. 仅在新建的 Craft 副本、新 WebView profile 和测试项目上安装/验收；确认版本清单、撤销、VFS、导出和恢复结果后再考虑真实使用

版本由根 `version.json` 与 `craft/version.json` 分开记录：根文件是原生内核基础版本，Craft 文件是适配产品版本。没有创建公开发行版。

## 验证

云端：`node --test craft/tests/*.test.mjs tests/features-imports.test.mjs tests/craft-installer.test.mjs tests/craft-packaging.test.mjs tests/build-inputs.test.mjs`

Windows 原生回归：`tests/font-render-preflight.test.ps1` 验证普通项目不会因未用的 Live2D SDK 被阻挡；`craft/tests/native-update-observer.ps1` 只编译、运行写入隔离标记文件的合成宿主/安装器，不升级 Craft。合成安装器通过也不代表官方 NSIS 升级已验证。

当前会话日志在适配目录的 `state/sessions/<sessionId>`，内核用户配置位于独立的 `state/kernel/user-data`。不会自动导入旧 Terre 的用户配置、凭据或模型列表；AI 请求只由显式功能操作启动。

安装和卸载校验清单、文件哈希与归属。未知或已被官方更新替换的主程序不会被旧备份覆盖。未能证明安装完成时，不自动声明修复成功。
