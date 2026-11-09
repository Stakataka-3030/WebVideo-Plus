# Craft 会话监听验证

## 问题与范围

2026-11-09，在 Windows 26H2、构建 26300.9818 上发现：Craft 的本机 `/json/list` 已返回唯一主页面，但 `Get-NetTCPConnection -State Listen` 没有匹配结果，阻止增强界面接入。

使用不启动 Craft、不显示窗口的自有 loopback HTTP 服务，连续三个时点复现相同错误。完整 CIM 查询可以找到正确地址、端口和拥有进程，但监听行的 State 为 0。增加等待不能修复该枚举异常；netstat、通用 IP Helper 连接表与 .NET 的状态过滤也不能作为可靠替代。这里只确认该环境的行为，不把异常进一步归因于未经验证的 Windows 或网络组件。

1.2.1.0c 与此前 1.2.2.0c 候选的 `launch-injected.mjs` 完全相同，因此这是既有启动检查的环境兼容问题，不是本次 Live2D 修复引入的问题。

## 修复与安全边界

复用已校验、已打包的 `WebVideoCraft.Launcher.exe`，增加 `--verify-listener <port> <hostPid>` 只读模式。该模式在 GUI、安装和会话初始化之前执行，不启动宿主、不修改系统或用户设置。

- 直接查询 Windows `GetExtendedTcpTable` 的 `TCP_TABLE_OWNER_PID_LISTENER`（3），同时查询 IPv4 和 IPv6。只有该 listener-only 表的成员才能参与验证，绝不从 all-connections 表删除 State 过滤后直接放行。
- 不使用返回的 State 字段判断监听；该字段在 listener-only 表中也可能异常。
- 端口必须存在；全部匹配监听必须为 `127.0.0.1` 或 `::1`，只有一个明确的拥有 PID，不允许重复、含糊的同地址监听。双栈同一 PID 可接受。
- 通过只读 Toolhelp 进程快照确认拥有者是本次启动的宿主或其后代。宿主缺失、祖先缺失、环路、超过深度限制以及外部进程都拒绝。
- 双栈任一查询失败、缓冲区不完整、过大、持续变化或进程快照异常均拒绝。仅对原生缓冲区大小竞争做有界重试。
- JavaScript 检查原生结果的完整 schema、端口、宿主 PID、拥有 PID 和地址；保留唯一 `tauri.localhost` 主页面、WebSocket 地址以及主执行上下文校验。

原生帮助模式通过现有构建清单和来源收据绑定到启动器，没有增加单独的运行时依赖或持久服务。失败时仍保留宿主供用户正常保存和关闭，不自动结束用户进程。

进程归属仍使用 PID 关系快照，未增加进程创建时间证明；双栈枚举至 CDP 连接也不是原子操作。本修复不声称消除了旧方案已有的祖先 PID 复用或检查后状态变化限制。

## 后台回归

运行：`node --test craft/tests/listener.test.mjs`

可移植部分验证结果协议、错误传播、隐藏且有界的原生调用以及保留的页面/WebSocket 检查。Windows 部分编译实际启动器和 `ListenerChecks.cs`，只使用后台进程与自有 loopback socket：

- IPv4、IPv6 真实监听，bind 但未 listen，以及关闭后的端口。
- State 为 0、2、6、11 时的 listener-only 成员识别。
- 正确拥有进程、真实子进程祖先、错误拥有者、缺失 PID、多个拥有者、重复端点、非 loopback、祖先环路及深度限制。
- 原生 API 错误、缓冲区增长、截断、大小越界、第二地址族查询失败和进程快照失败。
- 无窗口 CLI 的严格参数与错误返回。

这些回归不启动真实 Craft，也不声称验证了实际增强注入、编辑、导出或完整安装包。真实宿主验收需单独在隔离的 Windows CI/VM 中进行。版本仍为未发布的 1.2.2.0c；修复须经独立审核及最终 CI 后再进入发行流程。
