# CL-013b/c：契约、迁移与基础安全门禁

2026-10-14（UTC）· [CL-013b #51](https://github.com/cn-ryh/canlearn-v2/issues/51)、
[CL-013c #52](https://github.com/cn-ryh/canlearn-v2/issues/52)，承接 [CL-013a](../CL-013a/README.md)。
本包初次归档为本地实现与验证交付；当时没有提交、推送或更新 GitHub，PR #55 的既有 CI 不代表本轮代码。
随后授权交付的提交、真实 GitHub CI 与 Issue 记录见[收尾](../../delivery/2026-10-14-cl013bc-delivery.md)。
非作者审核和实际验收继续待补，Issue 保持 Open。用户延期真人标注，CL-009 仍待合法真实样本与独立双标。

## 复现

需要 Node 24、pnpm 12.4.2、Python 3.12、uv 0.12.15、本机 Docker/Compose。
扫描器固定为 Gitleaks 8.30.1、Trivy 0.75.0；安装器只支持 Linux x86_64。
首次运行需访问固定 GitHub release 和漏洞数据库，断网或校验失败会使检查失败。
安装器保留代理和 TLS 校验，核对归档 SHA-256，每次使用时复核缓存及二进制；不执行远程安装脚本。

```bash
pnpm install --frozen-lockfile
uv sync --project apps/workflow --frozen
pnpm verify
pnpm smoke:test --skip-build
pnpm security:scan
pnpm security:probes
```

`pnpm verify` 包含离线版本/迁移规则、Drizzle schema 漂移检查及 14 项故障门禁回归；
联网安全扫描独立运行，CI 新增 security job。CI Actions 固定完整提交 SHA，Node 固定 24.21.0，
pnpm/uv 和两套依赖沿用项目锁文件；Python 仍为项目约定的 3.12 系列。
四个 Compose 镜像保留原入口、命名空间、标签并追加摘要；没有修改全局 daemon。

## CL-013b：真实 HTTP、事件与迁移

运行时 Swagger 与手写合成 OpenAPI 比较三条操作的参数位置/必填/Schema、请求体/媒体类型、
security、响应码/媒体类型/Schema/响应头及实现范围。补齐比较后发现并修正了幂等请求头重复声明。
HTTP schema 校验使用手写契约，不从控制器生成预期值。

真实隔离栈的测试收集公共 API 返回，逐个验证完整响应体、Content-Type、声明状态码及错误体 statusCode。
覆盖 POST 创建 202/400/403/409/503、GET 查询 200/400/404、POST 取消 200/400/403/404。
GET 的非回环 403 通过真实 Nest guard 的远端地址注入验证；API 进程只监听回环，不能从本机 socket
伪造非回环来源。原有默认关闭检查、健康响应校验和 27 条规划接口 404 检查保留。
WAITING_REVIEW、生产授权和 resource.invalidated 的业务实现没有因增加门禁而完成。

实际 SQL Outbox 中三个事件族继续通过封闭 CL-008 Schema。受控测试复制实际 HTTP 返回/持久事件，
分别删除必填字段，再调用同一 CLI；必须非零退出，随后原始数据仍能通过。测试不修改生产契约或历史证据。
新记录的 35 项集成检查包含原有取消、回执、真实 history 重放、SQL 回滚、重启和并发场景。

迁移验证在隔离 PostgreSQL 15433 上创建随机数据库，使用真实 Drizzle migrator：

1. 空库应用全部迁移。
2. 0000 旧库写入完整合成健康 Job，再升级到当前版本，所有旧字段保留。
3. 升级后旧列集合仍能写入、读取并获得原 QUEUED 默认值。
4. 再次迁移不改 schema 或迁移账本。
5. 空库与升级库的表/列/类型/默认值收敛。
6. 真实外键拒绝孤立的 smoke 元数据。
7. 加入无回填的 NOT NULL 列必须失败；此前 DDL、旧数据和迁移账本全部回滚。

临时数据库在 finally 删除，隔离卷保留；不测试业务库、不自动执行 down migration。
静态规则还拒绝修改已记录迁移/快照、破坏性 SQL、日志与文件不一致；PR CI 对 base SHA 中已存在的
SQL/快照做字节比对。Drizzle 在临时目录生成并比较，schema.ts 改动而缺迁移会阻断。
SQL 词法规则采用保守拒绝，不能证明任意 SQL 的语义安全；未来复杂回填/收紧需单独设计兼容验证。

## CL-013c：阻断、残余项与人工处置

| 检查 | 当前规则 | 负责角色/处置 |
| --- | --- | --- |
| 密钥 | Gitleaks 扫完整 Git 历史及当前受版本管理/未忽略文件；发现即阻断 | A（任宇航）组织吊销/轮换与调查，B 修复；不能只删 Git 字符串 |
| 依赖 | Trivy 扫 pnpm/uv 两个锁文件，包含开发依赖；HIGH/CRITICAL 全部阻断，包括未修复漏洞 | B/C 升级，B/A 非作者复核；中低危报告并跟进 |
| 镜像 | 四个固定摘要真实扫描；扫描失败立即阻断，已知漏洞暂报告 | A/B 在 2026-10-21 前逐项处置；期限后未解决 HIGH/CRITICAL 自动阻断 |
| 版本 | 直接依赖/构建后端精确版本、Actions 完整 SHA、镜像 tag+digest、扫描器 SHA 校验 | B/C 变更锁文件并完整复验；平台托管 runner/漏洞 DB 本身仍会更新 |
| 迁移 | 已应用文件不可改、增量兼容规则、schema 漂移与真实升级/失败回滚 | B 实施，A 非作者审核；无自动破坏性回退 |

这些是职责映射和工程跟进目标，未新增实际指派或人工签审。镜像暂报告是公开残余项，不是安全验收或风险豁免。
`security/image-policy.json` 固定跟进日期；CI 执行状态为绿只说明已配置规则通过。

本轮实际发现并修复：Next.js 16.3.7 → 16.3.8（CVE-2026-94483）、source-map-js 1.2.1 → 1.2.2
（CVE-2026-93749）、concurrently 10.0.5 → 10.0.6，带入 shell-quote 1.12.0（修复 CVE-2026-102422）。
清除旧 Next 版本的 release-age 例外，固定 Hatchling 1.32.4。修复后扫描 403 个 pnpm、31 个 uv 包，
HIGH/CRITICAL 为 0；仍有开发工具链 esbuild 0.18.20 的 MEDIUM GHSA-67mh-4wv8-2f99，
随 Drizzle 工具升级跟进（B/C，目标 2026-10-21），没有忽略该条报告。

| 固定镜像 | HIGH | CRITICAL | 当前结论 |
| --- | ---: | ---: | --- |
| PostgreSQL 17-alpine | 24 | 1 | 含 gosu 所带 Go stdlib；待上游/可达性与替换方案复核 |
| Redis 8-alpine | 0 | 0 | 仍有 1 个 MEDIUM，保留报告 |
| Temporal auto-setup 1.29.7 | 156 | 2 | 多个内置组件/依赖；需结合开发镜像与后续生产部署方案处置 |
| Temporal UI 2.54.1 | 43 | 0 | 内置 Go 依赖；待升级或收窄启用范围 |

计数来自本轮漏洞 DB 和实际摘要，按发现记录计数，不等于独立 CVE 数或已经可利用的漏洞数。
不得把“本地回环”或扫描器匹配当作已完成可达性判断；当前不用于真实用户试点/生产安全放行。

人工例外统一记录于 `security/exceptions.json`，当前为空。依赖例外必须精确匹配 target/id/package/version，
填写原因、实际批准人、GitHub 评审证据和到期日；缺字段、过期或不匹配不能消除阻断。
批准前由非作者核对上游公告、锁文件路径、调用可达性和补丁范围；不可直接关闭扫描、降低严重级别或全局忽略 CVE。
密钥发现不能通过依赖例外消除；镜像未复用依赖例外，仍保留上述到期强制处置。

受控密钥探针只在临时目录构造不存在的 token，扫描器输出全量脱敏；依赖探针只构造含已知漏洞的
lodash 4.17.20 锁文件，不安装/执行漏洞包。两者均验证扫描器非零退出。仓库和 CI 日志不保存测试 token。
正常扫描只导出 git 列出的文件，不读用户 .env、私有 runtime、node_modules 或样本私有目录。
临时报告目录为 0700；CI 仅上传不含密钥的 summary/probe 及合成集成/迁移记录，保留 14 天。

## 证据、回退与下一步

本包 `integration-results.json`、`migration-results.json`、`security-summary.json`、`security-probes.json`
是本轮本地实测记录；`validation-record.json` 记录基线提交、工作区源码摘要和边界。
CL-013a 的旧记录仍绑定原提交，不能当本轮结果。初次归档时新 CI 配置尚未推送执行，远端 Issue/PR 未改变。

回退应用/工具版本前先保留发现与证据；不能为回退而恢复已知漏洞依赖或修改迁移账本。
需要暂停合成环境时使用 smoke:down；新增数据库验证只操作自己的临时库，没有新增业务迁移。
门禁误报应先核实并评审精确例外；CI 暂不可联网时记录失败，不能报告扫描已通过。

下一工程工作为 CL-010 MinerU Adapter 协议和恢复路径，继续使用现有原创 PDF；真实解析质量指标等真人双标恢复后验收。
CL-009、生产身份/空间/上传与正式 R0 退出评审的未完成条件不因本包交付而解除。

工具依据：[Trivy 锁文件覆盖](https://trivy.dev/docs/v0.69/guide/coverage/language/)、
[Trivy 严重级别与未修复漏洞](https://www.trivy.dev/docs/dev/guide/scanner/vulnerability/)、
[Gitleaks 固定版本](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)、
[Trivy 固定版本](https://github.com/aquasecurity/trivy/releases/tag/v0.75.0)。
