# 固定镜像 CRITICAL 初步核对

2026-10-14（UTC）。承接 [CL-013c 扫描](../../integration/CL-013bc/security-summary.json)：
223 条 HIGH、3 条 CRITICAL 发现记录，后者对应 2 个独立 CVE。当前扫描计数、固定摘要、报告模式、
人工例外空表及 2026-10-21 处置期限保持不变；本页是初步技术证据，不是已批准风险例外。

从扫描对应的 PostgreSQL/Temporal 固定摘要容器中只读复制三份二进制，临时容器/匿名卷已移除，
没有启动现有业务数据库或更改镜像。使用本机 `go version -m` 和 `go tool nm` 核对真实二进制；
SHA、编译版本和符号计数见[机器记录](image-critical-binaries.json)。

| 镜像/文件 | 发现与技术证据 | 建议处置（A/B，10 月 21 日前） |
| --- | --- | --- |
| PostgreSQL `/usr/local/bin/gosu` | Go 1.24.6，CVE-2025-68121；该 CVE 涉及 crypto/tls 会话恢复与 CA 配置变更。实际 gosu 1.19 二进制的符号表无 crypto/tls 符号，固定源码 main 为切换用户和 exec | 非作者复核固定源码/二进制是否确无受影响路径，或采用带修复 Go 编译器的 gosu/上游镜像；新摘要完整回归 |
| Temporal `/usr/local/bin/tctl` | gRPC-Go 1.56.3，CVE-2026-33186；含 gRPC server 符号，不能凭 CLI 名称判定无影响 | 优先上游升级/重建或生产镜像排除旧管理工具，保留许可并验证 Temporal 启动/健康/恢复 |
| Temporal `/usr/local/bin/tctl-authorization-plugin` | 同一 gRPC-Go CVE 与版本，亦有 server 符号；不能自动判无影响 | 与 tctl 联合处置，核对授权拦截器和插件启动路径；不能只替换主 temporal-server |

Go [官方漏洞记录](https://pkg.go.dev/vuln/GO-2026-4337)给出修复版本 Go 1.24.13 / 1.25.7；
检查 gosu 固定源码 [main](https://github.com/tianon/gosu/blob/6456aaa0f3c854d199d0f037f068eb97515b7513/main.go)
与二进制符号表，推断这个精确二进制可能不包含受影响 TLS 调用；尚未签审为 not-affected。
不能将该推断应用于 PostgreSQL 镜像的其他 HIGH 或未来不同 digest。

gRPC [上游公告](https://github.com/grpc/grpc-go/security/advisories/GHSA-p77j-4mvh-x3m3)
说明缺少前导 slash 的 HTTP/2 path 可绕过依赖规范化完整方法名的授权拦截器，修复为 1.79.3。
当前实际 auto-setup 脚本的 namespace、search attribute 和健康操作使用 `temporal operator`，
未调用 tctl；Compose 没有启用 tctl 授权插件。由此只能推断当前启动路径没有主动运行这两个旧工具，
不能证明镜像所有调用路径安全，也不能将未来授权配置排除在评审之外。

处置应先固定候选新摘要及每项 CVE/目标包，完整重跑 schema、Job/迁移、Temporal replay 与镜像扫描，
再按非作者审核结果决定替换或记录精确、限期的风险批准。现有规则没有镜像例外机制；
本轮没有新增自动豁免，也不降低严重级别。223 个 HIGH 和开发 esbuild MEDIUM 仍由 CL-013c 清单跟进。
到期未解决 HIGH/CRITICAL 将自动阻断。真实用户试点/生产放行继续等待安全及 R0 闸门评审。
