# CanLearn 项目记忆

最后检查：2026-10-12（UTC）。以下为本地代码、命令验证与 GitHub 远端查询的快照。

## 最新收尾状态（2026-10-12，取代下文早先未提交/全部 Open 的快照）

- 用户明确要求先提交此前成果、关闭对应 Issue，再继续 CL-005；并选择只关闭
  CL-004 #4/#23/#24/#25，其余保持 Open。A = 任宇航，其他角色暂保留代号。
- 用户明确接受以 A 的 R0 设计验收收尾，调整原卡的非作者评审关闭要求。
  本包已有人工审阅记录；非作者复核、外部权利/隐私/学科签审和真实安全/E2E/恢复验证
  未被宣称完成，按 CL-005/006/007/008/009/010/013、相应实现卡及 CL-014 接续。
  Q01–Q09 不因关闭本卡而清零，R0 放行仍由 CL-014b 决定。
- 已在 GitHub 四卡逐一发布收尾证据并关闭，随后重新查询确认四卡 CLOSED，
  其余 50 卡 OPEN；父项记录：<https://github.com/cn-ryh/canlearn-v2/issues/4#issuecomment-6122928181>。
- 本地在 `docs/cl-004-data-governance` 分批提交：`4142a0d`（路线图、仓库说明、CL-001），
  `a498575`（CL-002 访谈准备与私下记录忽略规则），`915d45b`（CL-003 可重建合成对标资料），
  `728fecc`（CL-004 设计包、用户验收口径及下游交接）；本记忆另作同步提交。
  CL-001/002/003 的未完成状态如实保留，没有补造访谈、实测或签审数据。
- 本次完整 `pnpm verify` 退出码 0；提交钩子的 lint-staged/commitlint 通过。
  40 个变更文件、86 个本地 Markdown 链接、围栏、空白 CSV、脚本与 5 份 PDF 哈希已检查；
  自有文本空白检查通过。字体版权 NOTICE 保留上游原文，其中三处行尾空白未改写，
  所以不能声称新增文件的无例外 `git diff --check` 全部通过；其余文本检查通过。
- 用户已明确授权推送该工作分支；本段记录推送前的收尾状态，实际推送结果随后核验。
  不向 main 合并，不创建未经请求的发布，不关闭其他 Issue。
- CL-005 已收到的选型输入：大陆优先；额外运行预算 ¥300/月，不包含已有服务器、
  云存储和一台 4070 GPU 服务器；除邮件服务外，用户表示已有云账号/额度、域名及模型 API 等资源。
  具体供应商、地域、规格、实际额度、预计人数和登录需求仍未明确，不将资源存在当能力已验收。

## CL-005 启动与当前工作区（2026-10-12）

此前五个提交已成功推送 `origin/docs/cl-004-data-governance`，远端 SHA 与本地
`7da271e2879756c2e427f675543cfb73bd1401ea` 一致；推送钩子的完整 `pnpm verify` 通过。
核验时工作区干净，四卡 CLOSED/COMPLETED、其余 50 卡 OPEN；工作分支尚无远端 CI 运行记录，
没有向 main 合并。父卡已补充可访问的工件/提交链接：
<https://github.com/cn-ryh/canlearn-v2/issues/4#issuecomment-6122980866>。

随后继续用户已授权的 CL-005，切换新本地分支 `docs/cl-005-technical-decisions`，
从上述已推送提交承接。新增 `docs/architecture/CL-005/README.md` 及 ADR-0003–0006
四份**提议**，覆盖身份/私有存储、检索/索引、模型网关和部署/协调的候选、成本、失败与退出。
同时给两份路线图增加入口；本轮设计草案尚未提交或推送，CL-005 仍未验收、未关闭。

用户确认输入：大陆优先，10 人以内内部测试，额外运行预算 ¥300/月，
不包含已有服务器/云存储/GPU；邮箱注册且必填邀请码，接受邮箱/密码登录并接邮件服务验证邮箱。
既有资源为南京腾讯云 4 核 8G、200M 上限且按流量计费，南京 COS；
宁波小厂开发机 16 核 32G，宁波长期持续运行的 4070 主机 24 核 48G。
上述为用户提供规格，未登录主机或检查容量、COS 配置、网络、GPU 显存、邮件送达或费用。

模型经无公开文档的聚合平台，用户提供 deepseek-v4.1-flash、glm-5.3、gpt 系列别名，
并说明支持 OpenAI Responses 格式。按所提供别名记录，不推定官方模型 ID、实际路由或官方数据政策。
平台名称、价格、地域、训练/留存/分包/删除条件仍未核验，真实资料路径未准入；
仅建议用合成资料验证协议。已实际读取 OpenAI Responses create 官方参考，记录 status/output/SSE/usage
以及 `store: false` 的兼容性核验要求；该字段不能作为聚合平台零留存证明。

当前建议：先核验 Better Auth 邮箱/密码与邀请码门禁、南京 COS 私有桶及受控访问；
评估 PostgreSQL＋pgvector/中文词法检索，保留 Temporal 且不新增独立队列库；
先在宁波开发机验证完整链路，再评估南京 4 核 8G 的内部部署负载。
南京业务事实/对象＋宁波受限 GPU 是跨地域计算**例外提议**，尚未批准，
不默认为 ADR-0002 的生产拓扑变更。模型预算 ¥180 等分配仅为建议，总增量上限仍为用户确认的 ¥300。
Better Auth、pgvector、Temporal 与 OpenAI 官方文档已读取；未选择固定新增版本、安装依赖、
修改业务代码/契约/迁移/环境配置、运行真实模型/存储调用或重做业务测试。

## CL-005 第二轮决策与核验（2026-10-12，当前最新）

用户选择腾讯云 SES，企业资质已有，站点 `cl.hangxiaonet.com` 已备案且可配置 DNS，
发件域名 `no-reply.hangxiaonet.com`，地址 `canlearn@no-reply.hangxiaonet.com`。
用户授权制作模板；已交付 `docs/architecture/CL-005/email-templates/` 下的验证与找回
HTML/Text、六份可重建预览/SES 创建请求体及控制台/API 录入说明。模板未上传/审核、未发送真实邮件。
SDK 官方类型已确认变量语法、Base64 正文和 TemplateData JSON 字符串；SES 官网抓取为浏览器校验页，
没有据此断言价格、地域、域名/地址状态、模板审核或送达已验证。

用户最终修正：邀请码**不绑定邮箱**，任意邮箱可使用一个有效且未使用的邀请码，
一码一次、7天有效。注册成功即消费，失败不消费，邮箱验证不重复消费邀请码；
验证链接1小时、找回30分钟、限流后允许重发。只有邀请码邮箱绑定要求被修正，其他期限仍有效。
已更新 ADR-0003 和入口，未在真实应用中实现注册或邀请功能。

网络确认：双方固定公网 IP、UDP 被封；用户确认南京运行 Web/API、业务 DB、Temporal 与 CPU worker，
宁波仅提供 MinerU/解析入口，公网 TCP HTTPS/mTLS 加固定来源 IP 限制。WireGuard 原建议已排除。
该内部测试跨地域计算补充已同步 ADR-0002/0006；实际链路、证书/代理、来源 ACL、4核8G 容量与恢复待验证。

在仓库外临时目录安装 Better Auth 1.7.7、COS SDK 3.0.0、SES SDK 4.1.271，
加载仓库当前 NestJS/Fastify、Drizzle 0.45.3/postgres-js，并使用隔离 PostgreSQL 17 容器和内存邮件桩。
实际通过9组认证/SDK检查：缺失/错误码、失败注册回滚、不同邮箱并发一码仅一个成功、
未验证邮箱拒绝登录、错误Origin拒绝、链接/配置期限、验证后安全cookie/会话、退出撤销以及SDK方法可用。
另通过本地合成证书4条mTLS检查；只证明隔离原型，不等于正式安全/业务验收或远端接入成功。
原型邮件回调在事务内，真实接入仍须验证提交后通知/去重/重试、令牌重放和全部故障时序。
容器及匿名卷已移除，临时网络服务已退出；未启动真实 Compose 基础设施、访问腾讯云私有资源或模型平台。
详情和源摘要记录在 `docs/architecture/CL-005/validation-record.md`，操作节点见
`docs/architecture/CL-005/deployment-and-service-readiness.md`。

用户指定后续 Docker Hub 镜像入口 `jjs7iczbx3i38wpthb.xuanyuan.run`，GHCR 入口
`jjs7iczbx3i38wpthb-ghcr.xuanyuan.run`。已更新 Compose、.env.example、README 和 AGENTS，
提供 `CANLEARN_DOCKERHUB_REGISTRY` 覆盖项；未改全局 daemon 或用户本地环境文件。
默认镜像路径及 docker.io 覆盖经 Compose 检查，镜像入口的 PostgreSQL manifest 读取成功，
其他镜像/标签未逐一拉取验证。用户另提供下载代理，按需只用于对应下载命令，不固化本地代理地址。

本轮 `pnpm check` 退出码0，模板生成脚本 Ruff lint/格式通过，HTML/Text/Base64 回解、
占位符、合成链接转义及连续重建六份输出字节一致检查通过。新增原型没有进入应用依赖或 CI，
未重跑构建；此前完整 `pnpm verify` 结果仍属前轮工程基线。
当前分支 `docs/cl-005-technical-decisions`，所有本轮成果仍未提交/推送，未关闭 CL-005 或其他卡。
除用户要求的镜像入口外，未改业务代码、API、事件、迁移或实际部署配置；先前修改均保留。

## 本地提交与 SES 审核交接（2026-10-12，当前最新）

用户报告 SES 模板审核完成并提供邮箱验证 TemplateID **224682**、密码找回 **224683**。
已同步模板交接记录、ADR-0003 与 CL-005 入口；SES 发送地域、审核正文版本与真实送达仍待补，
没有将用户报告写成独立控制台/API 查询结果，也未发送实际邮件。

按用户“先把现有内容本地提交，再开始下一步”的要求，在
`docs/cl-005-technical-decisions` 完成 `ca629c7`（项目镜像入口）与 `0e3a8cf`
（CL-005 ADR、核验记录、模板与审核交接）两个提交；本记忆另作同步提交。
提交前文档/链接及差异检查通过，提交钩子 Biome/Ruff/commitlint 通过。
业务代码未改变，沿用上一轮 `pnpm check` 和模板/隔离验证结果，没有为状态记录重跑代码门禁。
本次仅本地提交，不推送、不关闭 CL-005。提交完成后继续 CL-005b 的检索/embedding 选型。

## 定位与依据

CanLearn 是面向自主学习者的资料驱动学习平台。当前产品规划入口是
`docs/CanLearn_Product_Plan_v2.1.tex`；V2.0 文档仍保留。
协作分工见 `docs/CanLearn_V2.1_四人团队协作与任务分配方案.md`。
架构依据为 `docs/architecture/ADR-0001-technology-stack.md` 和
`docs/architecture/ADR-0002-repository-and-deployment-topology.md`。

## 已实现的工程基线

- 单一 Git monorepo，各应用独立构建和部署。
- `apps/web`：Next.js/React/TypeScript，只有项目基线首页。
- `apps/api`：NestJS/Fastify/TypeScript，已注册健康接口 `GET /v1/health`，Swagger UI 为 `/docs`。
- Drizzle/PostgreSQL：已有 `jobs` 表及初始 SQL 迁移；任务状态枚举包含 QUEUED、RUNNING、WAITING_REVIEW、PARTIAL_READY、SUCCEEDED、FAILED、CANCELLED。存在表结构不等于任务 API 已实现。
- `apps/workflow`：Python/Temporal worker、HealthCheckWorkflow 和健康 activity。
- `compose.yaml`：PostgreSQL、Redis、Temporal、Temporal UI 的本地配置。
- OpenAPI 当前为健康接口基线；`contracts/events` 只有约定说明，没有真实事件 Schema。
- 已配置 Biome、Ruff、mypy、TypeScript、Vitest、pytest、Redocly、GitHub Actions 与 Husky 门禁。
- 尚无资料上传、MinerU Adapter、真实解析流程、鉴权或学习业务闭环；不要将产品文档、数据库枚举和健康烟测当作已交付功能。

## 架构与工作约束

- 主 API 负责业务权限、状态、配额和权威写入；Python worker 不绕过这些门禁。
- PostgreSQL 保存业务事实；Redis 保存可重建状态、缓存与短期协调信息。
- 前端只访问 CanLearn API，不直连数据库、Redis 或 MinerU。
- MinerU 是外部独立微服务，通过 Adapter 接入；默认 Compose 不启动它。
- 长任务使用异步任务资源；领域事件计划通过 PostgreSQL Outbox 发布，目前未实现。
- API、事件、数据库迁移、环境变量和部署配置变化须同步更新对应文档与契约。
- 提交规则与检查以 `CONTRIBUTING.md` 为准，使用 Conventional Commits。

## 规划与下一步

路线图入口：`docs/roadmap/CanLearn_V2.1_Issue_Backlog.md`；R0 具体拆分：
`docs/roadmap/CanLearn_V2.1_R0_Issue_Split.md`。
阶段为 R0 定义/基准 → R1A 资料闭环 → R1B 学习 MVP → R2 受邀 Beta → R3A 稳定性，之后按证据决定付费与扩展。

本地 R0 文档将 #1–#14 映射为 14 个父 Issue，#15–#54 映射为 40 个原生子 Issue。
2026-10-03 已通过 GitHub 查询确认 #1–#54 全部存在、Open、未指派负责人，全部归属 R0 里程碑；本次未逐一复核原生父子关联。
R0 重点是范围、合法样本、权限/生命周期、技术决策、数据/API/任务契约、解析评测与可复现纵向烟测。
现有骨架无需重建，进入下一阶段须有验收证据。
身份、对象存储、检索/向量方案、生产平台与模型供应商等仍列为待决事项，不能将本地配置当作生产决策。

2026-10-03 整理 CL-001（#1）与子项 CL-001a/b/c（#15–#17）：产出放在
`docs/product/CL-001-mvp-scope-and-release.md` 和三个对应子项文档中。用户已确认
MVP 首发范围按完整 P0 能力基线冻结，按 R1A/R1B 分阶段交付；单章节闭环仅是早期切片。
用户也确认责任表先使用 A/B/C/D 等角色占位并明确阻断项。实际成员映射、外部权利/法律
和学科审校人仍待指派和签署，旅程也未经过真人验收；因此 CL-001 尚未完成综合验收，
远端 Issue 未关闭或更新。本次为文档交付，没有改业务代码；`git diff --check` 通过，
没有重跑代码测试。

2026-10-03 新建并切换到 `docs/cl-002-user-research`，继续 CL-002（#2）及子项
#18–#20。用户确认目前没有可提供的真实试访记录，本次先准备可执行访谈包。
入口为 `docs/research/CL-002/README.md`；包含招募/同意流程、统一访谈与礼宾脚本、
空白会话及 CSV 台账、未验证假设和探索报告结构。建议目标为三组各约 12 人，其他组
至少三个学科；当前包中可复核的真实会话为 0，CL-002c 未完成，不能虚构访谈结论。
已在 `.gitignore` 添加 `/research-private/`，完成的私下记录/联系方式/同意凭据只放
在受控的私下存储中，仓库保留空白模板。正式招募前须填写实际联系人和数据处理安排。
此前 CL-001、路线图与记忆文件的未提交变更仍保留；本次未提交/推送或修改远端 Issue。

2026-10-03 新建并切换到 `docs/cl-003-competitor-benchmark`，继续 CL-003（#3）
及子项 #21/#22。入口为 `docs/research/CL-003/README.md`。新增四份两页原创合成
PDF（中文双栏栈、含算术错误的物理公式、英文阅读、故意缺原页41的经济学）和一份
纠错 v2、固定版本的可重建脚本、SHA/页数/区域 manifest、字体版权许可、固定问题与
截止日、盲评规则和空白会话/评分表。仅为小型烟测素材，CL-009a 来源准入和 C 复核
仍待完成，不替代真实解析基准。脚本经 Ruff 检查，PDF 页数/中英文提取和算术修订已验证，
预览检查双栏及英文版式；最终版本连续重建得到相同 PDF 哈希，所有段落锚点、页码与
区域边界已检查，Markdown 本地链接和空白 CSV 表头检查通过。
官方 StudyFetch/RemNote/Knowt 页面初筛另列，尚未获得登录后统一任务输出；CL-003b
未满足实测验收，不能从官网描述推断竞品缺失能力。尚未注册/购买/上传或改远端 Issue。

2026-10-12 修复 CL-003 生成文件格式：`build_fixtures.py` 在写入 manifest 前调用
仓库已安装的 Biome，使用根目录配置；缺 Biome 时在生成文件前提示安装依赖。
README 同步补充 `pnpm install --frozen-lockfile` 前置步骤。连续两次重建（含一次
从 `/tmp` 调用）得到相同的 PDF/manifest 字节；5 份 PDF 哈希与修复前一致，
manifest 的语义字段只有 `generator_sha256` 随脚本更新。完整 `pnpm verify` 通过。

同日核对工作顺序：按 R0 子项拆分，CL-004a 依赖 CL-001a 的范围输入，当前已确认的
完整 P0 范围足以开始数据目录与数据流草案；不依赖 CL-002c 的真实访谈或 CL-003b 的
竞品实测，也无需等待 CL-001 父卡关闭。CL-004b 在 a 的输入具备后开展，c 依赖 a/b。
真实访谈和竞品实测仍是对应 R0 研究卡的验收证据，可与设计工作并行；业务 E2E 与
学习效果验证按功能交付和阶段要求收集。外部签审、正式验收和阶段放行的缺口仍保留。
本次只核对 CL-004 的开工条件，未新增 CL-004 工件或宣称该卡已完成。

同日用户要求先规划 CL-004 整个部分，**确认后再开工**。计划已保存到
`docs/plans/CL-004-implementation-plan.md`，状态为待用户确认；覆盖 a 的数据目录/
生命周期、b 的权限/素材用途/供应商矩阵、c 的威胁与验证方案，以及综合评审和
后续实现卡映射。建议按原 R0 边界交付四份设计/评审文档，候选技术与具体期限
继续列待决项；正式业务代码由原后续卡接续。本轮仅新增计划并更新记忆，
没有创建 `docs/security/CL-004/` 实际工件、修改代码/契约/迁移、切换分支或更新远端。
在用户确认前不开展 CL-004 实施；这次规划不代表子项完成或验收放行。

随后用户确认按计划实施，并明确授权细分任务和 subagent 并行工作。
2026-10-12 新建并切换到 `docs/cl-004-data-governance`，保留全部此前未提交修改。
交付 [CL-004 设计包](security/CL-004/README.md) 的入口及 a/b/c 三份文档：
23 类资产及逐资产保留/删除/导出映射、API 权威接纳的数据流、权限/用途与供应商矩阵、
12 条威胁及后续验证规格；包含 7 个生命周期和 14 个权限合成纸面场景。
本地拆为 12 个小任务，三位 subagent 分别编写 a/b/c，root 汇总后进行文档交叉检查；
并行初稿最终依照 a→b、a/b→c 的输入依赖核对，没有将 agent 检查当作真实成员签审。
已统一历史回跳与新生成资格、VLU 与强诊断、合法缓存与日志/Temporal 原文禁止、
付费步骤准入及晚到接纳的原子协调、事件/Outbox 副本和凭据/备份清理边界。
计划确认记录和两份路线图已更新入口；Q01–Q09 的具体人员、期限、方案、用途和外部条件
仍待决定或核验。正式评审、外部权利/隐私/学科签审、真实业务/安全/恢复验证未完成，
CL-004 父项与子项未被自动关闭，R0 未宣布放行。未改业务代码、契约、迁移或环境变量，
没有提交、推送或修改 GitHub 数据；本轮未重新查询远端，远端快照仍为此前只读查询结果。

2026-10-12 用户人工审阅 CL-004 全部设计工件并以“任宇航”署名，确认可发布为 R0 设计工件。
该确认已记录在 `docs/security/CL-004/README.md`，发布范围是文档工件本身；不替代非作者正式评审、
外部权利/隐私/学科签审、真实安全/E2E/恢复验证，也不构成真实资料接入、公共发布或 R0→R1A 放行。
CL-004 的 Q01–Q09、正式验收和下游运行证据继续待补；本次仅更新文档状态与记忆，未提交、推送、
关闭远端 Issue 或修改业务代码、契约、迁移和环境变量。

2026-10-12 再次核对 CL-004 完成情况：本地四份设计工件和人工审阅记录已存在，
结论仍为“设计交付完成、获准作为 R0 设计工件发布；正式评审及综合验收未完成”。
只读查询 GitHub #4/#23/#24/#25，四卡均 Open、无 assignee；父卡无评论，
远端关闭条件仍要求实际负责人、非作者审核及综合评审/风险处理/签审记录。
Q01–Q09 继续按各自节点处理；下游业务安全/E2E/恢复验证不应全部前移为本轮
设计编制的完成条件，也不能因设计交付而宣称这些验证通过。
复核 API 模块、数据库 schema 和 workflow 仍为健康接口、jobs 表及健康工作流骨架。
当前分支仍为 `docs/cl-004-data-governance`，HEAD `82e863f`，39 个未跟踪文件，
既有改动保留；`git diff --check` 通过。本次未重跑完整代码门禁，未提交、推送或修改远端。

2026-10-12 用户明确 A 即任宇航，其他成员暂不考虑姓名，继续使用 B/C/D 等代号。
已同步 CL-004 入口的职责说明、Q01 和实施计划的角色约定。此确认只更新人员映射，
不新增正式评审/外部签审结论；其余姓名暂缺不阻断设计与选型。Q01 部分明确，
Q02–Q09 仍按后续任务节点决策，不要求现在一次性解决。

## 本次验证结果（2026-10-12）

- 最新 `pnpm verify`：退出码 0，格式、lint、类型检查、单测、OpenAPI 校验、
  Compose 配置校验及 API/Web 构建全部通过。
- 同日首次状态检查曾在 `biome format .` 因 CL-003 manifest 数组换行失败；
  后续按用户要求修复生成脚本及输出，以上通过结果来自修复后的完整门禁。
- 后续 CL-004 规划仅验证本地 Markdown 链接和文档空白/差异，未重跑代码测试。
  规划不改变此前代码验证结论，也未提供新的业务或安全验收证据。
- CL-004 实施为纯设计文档交付：本地链接、围栏/尾空白、资产/场景/Q 编号和后续
  路线图引用检查通过；root 与三个 agent 完成文档一致性核对及合成纸面推演。
  `git diff --check` 通过，没有重新运行 `pnpm verify` 或真正执行安全夹具/业务请求。
  最新代码门禁通过结果仍来自前述 CL-003 格式修复，不能用作 CL-004 安全或权利验收。
- 单测共 3 项：Web 1、API 1、Python activity 1；覆盖的是工程基线，不是业务或端到端验收。
- CL-003 生成脚本的 Ruff lint/格式检查通过；重建前后确认 5 份 PDF 的 SHA-256
  及生成脚本 SHA-256 与 manifest 一致，连续两次重建输出一致，PDF 字节保持不变。
  CL-002/CL-003 的 5 份 CSV 模板均只有表头、0 条数据行；结合研究报告和入口文档，
  仓库内仍无可复核的真实访谈或登录后竞品实测证据，不断言仓库外活动情况。
- 构建产物在临时空闲端口启动后，API `/v1/health` 返回 HTTP 200 和准确的健康响应，
  `/docs` 与 `/docs-json` 返回 HTTP 200；运行时 Swagger 仅含 `/v1/health`。
  Web 首页返回 HTTP 200 并包含项目基线标识。所有本次启动的临时进程已停止；
  这不是上传、解析或学习闭环的 E2E。
- 当前工具版本：Node.js 24.21.0、pnpm 12.4.2、uv 0.12.15；pytest 使用 Python 3.12.3。
- Docker socket 本次可访问（Docker 29.1.3、Compose 2.40.3）；
  `docker compose ps --all` 无 CanLearn 容器。默认 3000/3001 端口已有监听，
  但首页响应不含 CanLearn 基线标识、`/v1/health` 返回 404，不能据此确认本项目已启动。
  本次未启动基础设施、执行数据库迁移、验证 Temporal 连通性、接入 MinerU 或跑业务 E2E。

## Git 快照（2026-10-12）

- 当前工作分支 `docs/cl-004-data-governance`，从 CL-003 工作分支新建；HEAD 仍为 `82e863f`（`chore(repo): merge remote repository history`），此前未提交修改保留。
- origin：`git@github.com:cn-ryh/canlearn-v2.git`。
- `git ls-remote --heads origin` 确认远端只有 `main`，其 SHA 与本地 HEAD 相同；
  此前状态检查未 fetch；CL-004 实施只新建本地工作分支，没有提交或推送。
- 开始检查时 `.gitignore` 有 3 行未提交修改；`AGENTS.md`、本记忆、
  `docs/product/`、`docs/research/` 和 `docs/roadmap/` 共 34 个文件未跟踪。
  这些已有改动均保留；状态检查更新记忆，后续格式修复修改 CL-003 脚本、
  README、manifest，并同步记忆；CL-004 规划新增计划，实施新增四份设计文档，
  两份既有路线图更新入口，未跟踪文件共 39 个。
  `git diff --check` 通过。

## GitHub 远端快照（2026-10-12）

查询来源：`git ls-remote --heads origin`、`gh repo view`、GitHub branches/milestones/releases API、`gh run list`、`gh issue list` 和 `gh pr list`。

- 仓库：<https://github.com/cn-ryh/canlearn-v2>，Public，未归档；默认分支 `main`。
- 远端分支列表只有 `main`，SHA 为 `82e863f079935e8925b674c5c6d3c21909a12c91`；分支 API 返回 `protected: false`。
- 最近代码推送时间：2026-09-30 14:35:50 UTC。
- 当前 HEAD 的 CI 已完成并成功，创建于 2026-09-30 14:35:57 UTC：[CI 运行记录](https://github.com/cn-ryh/canlearn-v2/actions/runs/36730325893)。同一 HEAD 的 Dependency Graph 运行也成功；查询返回的两条运行均已完成，没有运行中的记录。
- Issue 总数 54（#1–#54），全部 Open，无负责人；本次查询无 Closed Issue。
- 里程碑 `R0 · 定义与基准` 为 Open，54 个未关闭、0 个已关闭，没有截止日期。
- PR 列表（所有状态）为空；Release 列表为空。路线图尚未体现在已关闭 Issue 或合并 PR 中。
- 本地产品/研究/路线图工件及记忆尚未提交、推送；远端检查没有修改 Issue、分支设置或其他 GitHub 数据。
- 相比 2026-10-03 快照，远端 HEAD、Issue 完成与指派状态、里程碑、PR、Release 和 CI
  查询结果未发生变化；没有复核每一项 Issue 的原生父子关联。
- 以上为查询时状态；后续开始相关任务时应重新检查，尤其是负责人、Issue 完成情况和 CI。

## 常用命令

- 安装：`pnpm install --frozen-lockfile`；在 `apps/workflow` 执行 `uv sync --frozen`。
- 本地准备：复制 `.env.example` 为 `.env`，`pnpm infra:up`，`pnpm --filter @canlearn/api db:migrate`。
- 启动：`pnpm dev`；Web 3000、API 3001、Temporal UI 8080。
- 质量门禁：`pnpm check`；构建：`pnpm build`；完整验证：`pnpm verify`。
