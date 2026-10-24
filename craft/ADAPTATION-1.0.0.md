# Craft 1.0.0 正式版适配

分支 `adapt/craft-1.0.0`。产品 1.2.0c、安装器 1.2.0.0c，内核 0.6.61；[发行与 SHA-256](https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/craft-v1.2.0.0c)，[本版验收](ACCEPTANCE-1.2.0c.md)。

- 官方 Release/tag：[`v1.0.0`](https://github.com/A-kirami/webgal-craft/releases/tag/v1.0.0)，提交 `a4179024ab53100ab42a1432b8360a31193e5bd0`；发布于 2026-10-24，`prerelease=false`。
- 官方 Windows x64 安装器 SHA-256：`e80d10a9ce05a5a9aab886f69df05d528af036c65a4d0838a4f293527ae70f26`；原 Minisign 公钥验证通过。
- 静态提取主程序 SHA-256：`0de472c44f642c8f140e16bcc040a171519af59d245ae88b1b4a47987cf2756c`，产品版本 1.0.0。安装器仅允许该构建。
- 官方更新服务、控制器、Pinia store 与现有固定 blob 一致；Pinia 4.0.3 / Vue 3.5.43。编辑器、VFS、预览绑定接口按精确 tag 核对，原生导出平台仍为三个按钮且 Android 禁用；无需扩展兼容层。
- RC1 维护线在 1.1.17c 结束维护，正式版适配从该源码单独分支，不修改 Terre 两条分支，不包含共享文件夹功能。
- 正式 tag 包含 #398 回收站语义、#401 动画草稿保存、#402 撤销后编辑、#403 动画缓动撤销和 #404 冒号对白修复，以及 #411–#418 的正式版功能与修正；这些属于上游基线，不重复在增强组件中实现。

单测、真实 GUI、实际导出分别记录。官方 NSIS 注册升级、旧模型超时与换动作缩小仍不属于已通过验收。
