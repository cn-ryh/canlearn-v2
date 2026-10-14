# CL-005 · 技术选型与决策入口

状态：**隔离组件、CL-005b补测及CL-005c四个别名合成核验已推进；业务接入、真实样本/供应商条件与正式验收待完成。** · 2026-10-13

对应父项 [#5](https://github.com/cn-ryh/canlearn-v2/issues/5) 和子项 #26–#29。
A = 任宇航；B/C/D 及其他审核角色暂用代号。工作分支 `docs/cl-005-technical-decisions`。
CL-004 已按用户的 R0 设计验收决定关闭四卡，遗留条件仍从
[数据治理入口](../../security/CL-004/README.md) 承接。

## 已确认输入与待确认条件

| 输入 | 状态及依据 |
| --- | --- |
| 服务主要地域 | 用户确认中国大陆优先；具体数据及供应商处理地域仍待核验 |
| 增量月预算 | 用户确认 ¥300/月，不包含已有服务器、云存储和一台 4070 GPU 服务器 |
| 可复用 CPU 主机 | 南京腾讯云 4 核 8G、按流量计费、200M 带宽上限；宁波小厂开发机 16 核 32G。实际网络与负载待核验 |
| GPU 与存储 | 腾讯云 COS 南京；宁波 4070 主机 24 核 48G，用户确认可长期持续运行。COS 配置/版本/删除、GPU 显存/磁盘及连接能力未测 |
| 邮件服务 | 用户选择腾讯云 SES，企业资质已有；发件域名 no-reply.hangxiaonet.com、地址 canlearn@no-reply.hangxiaonet.com。用户报告模板已审核，验证224682、找回224683；地域/审核版本待补，身份/价格/送达待核验 |
| 首轮人数/并发 | 用户确认 10 人以内内部测试；同时任务数仍待容量测试与限额决定 |
| 模型入口 | 聚合平台给定别名DeepSeek/GLM及新增MiniMax/Step已用官方SDK合成调用，GLM明确失败排除；用户提供四模型输入/输出报价及MiniMax/Step缓存报价。平台无公开文档，主体/实际上游/版本/处理条件和账单未核验，不推定官方模型标识或政策 |
| 登录入口 | 邮箱/密码＋必填邀请码＋邮箱验证；码不绑定邮箱，任意有效未用码可注册，一码一次、7天有效。验证链接1小时、找回30分钟；未验证邮箱不开放资料空间 |
| 站点 | cl.hangxiaonet.com，用户确认已备案且可配置 DNS；未核验当前解析/TLS/部署 |
| 公网连接 | 用户确认固定公网 IP、UDP 被封，选择南京 CPU worker＋宁波受限解析，公网 TCP HTTPS/mTLS，来源 IP 限制 |
| 镜像入口 | 用户指定 Docker Hub 为 jjs7iczbx3i38wpthb.xuanyuan.run，GHCR 为 jjs7iczbx3i38wpthb-ghcr.xuanyuan.run；已同步项目配置/说明 |
| 检索与测算 | 用户选择本地多语言 embedding 优先；10人以内、每人5份20–100页，另加300页观察样本，不要求必定解析成功；不是已冻结上传限制 |

地域优先与预算是已确认约束，本文的技术路线仍为建议。已有资源不等于容量、可靠性、删除能力或供应商用途已获准。

## 第一轮建议

| 子项 | 对应提案 | 推荐方向及理由 | 仍需决定/核验 |
| --- | --- | --- | --- |
| CL-005a / #26 | [ADR-0003](../ADR-0003-identity-and-private-storage.md) | 邮箱/密码＋服务端必验邀请码＋邮箱验证；Better Auth 1.7.7 隔离兼容性已通过；腾讯云 SES、南京 COS 私有桶 | 应用正式接入、SES 身份/模板/实际送达、COS 版本/删除/访问能力 |
| CL-005b / #27 | [ADR-0004](../ADR-0004-retrieval-and-index-boundaries.md) | BGE-M3＋512token/batch4为内部推荐；长块/干扰/无答案已测，300页Basic档位GPU共用已观察 | CL-009真实质量/分块、南京CPU容量、Standard/VLM、主库扩展迁移 |
| CL-005c / #28 | [ADR-0005](../ADR-0005-model-gateway-and-provider-boundaries.md) | 固定官方SDK，关闭自动重试；GLM明确FAILED排除，DeepSeek合成基线、Step仅流式候选；MiniMax引用未达门禁暂不选入 | 正式任务质量、参数实际应用、上游/路由、地域/留存/训练/分包及账单 |
| CL-005d / #29 | [ADR-0006](../ADR-0006-deployment-and-async-coordination.md) | 南京业务面/Temporal/CPU worker，宁波解析；TCP HTTPS/mTLS 已确认，本地握手核验通过；暂不新增独立队列库 | 实际链路/代理/ACL、工作流存储/留存、容量、备份与回滚 |

优先减少新增服务和重复队列，将 ¥300 用于有明确收益的模型调用、必要网络/备份及余量。
不因为已有 4070 就默认解析、embedding 和生成模型可以同时稳定运行；模型质量不以便宜代替验收。
建议先以 16 核 32G 开发机验证完整链路；腾讯云 4 核 8G 是后续受控内部测试部署候选，
需测 PostgreSQL/Temporal/worker 的内存与 CPU 竞争后决定是否同机部署或拆分。
200M 是带宽上限而非已支付流量；上传、预览、下载/导出和跨主机传输按实际计费路径估算。
用户已确认南京业务事实/对象/Temporal/CPU worker，宁波开发机做开发，宁波 GPU 提供受限解析。
这是 ADR-0002 单地域假设的**内部测试跨地域计算补充**，已同步 ADR-0002/0006。
UDP 被封，选用公网 TCP 443、HTTPS/mTLS 与固定来源 IP 限制；实际链路/负载、资料用途和正式生产条件仍需核验。

## 第二轮具体工件

- [已执行的兼容性与传输验证](validation-record.md)：认证/SDK 9 组检查、本地 mTLS 4 条检查及镜像入口证据。
- [部署与服务接入清单](deployment-and-service-readiness.md)：已确认拓扑、SES/COS/网络核验顺序及下游任务。
- [SES 邮件模板](email-templates/README.md)：邮箱验证和密码找回 HTML/Text、合成预览与创建请求体；用户报告已审核，具体交接信息见模板审核记录，真实发送未验证。
- [检索与 embedding 核验](retrieval/README.md)：10项控制、4070长块/批量、干扰/无答案、CPU查询、300页MinerU Basic串行/并发；真实业务与复杂样本尚未验收。
- [模型网关与官方SDK核验](model-gateway/README.md)：Responses合成协议、消息兼容差异、48项本地故障注入、实际错误/用量和用户报价，16K参数矩阵；真实资料路径保持禁用。
- [MiniMax/Step补充比较与GLM失败记录](model-gateway/candidate-evaluation.md)：40次同矩阵调用，Step流式18/18、MiniMax1/18；两模型非流式无最终文本，费用按用户报价估算。
- [选型收敛与下游交接](decision-closeout.md)：a/b/c/d的内部路线、失败/退出、负责人和验收节点；实际业务/部署与非作者评审待完成。
- [合成业务链与结构对照](model-gateway/business-chain-evaluation.md)：生成/跨别名校验/一次修复、无答案、48题与断流；提示/验收局限及首轮失败分别留档。
- [CL-006数据模型](../CL-006/README.md)：概念模型、版本/删除传播、写入和迁移设计及合成场景演练。
- [CL-009样本准备](../../benchmarks/CL-009/README.md)：既有原创夹具登记、外部样本准入/分层、逐页与引用协议；真实合法样本仍为0。

## 增量成本模型

下表是第一轮**建议分配**，没有用户确认、供应商报价或负载测算，不是支出授权。

| 预算用途 | 建议月上限 | 必须计入的项目 |
| --- | --- | --- |
| 模型 API | ¥180 | 输入/输出 token、embedding、独立校验、失败重试和取消前已准入调用 |
| 网络/对象操作 | ¥40 | 已有资源的增量外网流量、对象请求、存储超额等；不能因资源已有而默认免费 |
| 额外备份/运行配套 | ¥30 | 超出已有资源的备份、日志或邮件等费用；是否足够待报价 |
| 余量 | ¥50 | 价格变化、超额及不可预期的必要费用 |
| 合计 | **¥300** | 优先使用已有资源，但另记其电力、运维和原有固定成本，不混为完整总成本 |

成本公式：月增量 = 模型调用＋额外算力＋新增存储/流量/请求＋备份/配套。
模型每任务成本必须覆盖生成、校验和最多允许的修复轮次；供应商未知时不填造单价或任务次数。
先测一个合法合成任务的实际成本，再以人数、每人任务量和缓存命中率推算，而不是从 ¥180 倒推出可承诺题量。
预算告警/停止阈值与并发上限由 A 决定，CL-008/115/205 接续实现；费用对账未确定时不能承诺绝不超支。

## 决策顺序与记录

1. A 补充资源名称、规格、地域及登录需求，确认人数/并发测算场景。
2. 先定 a/d 中影响整体部署与身份的方案，b/c 可在边界确定后继续比较。
3. 根据官方资料及可访问的既有环境核验能力；初期只用合成资料做隔离验证。
4. 各 ADR 记录最终选择、被否决候选、成本、失败模式、迁移/回滚、责任与最迟决定节点。
5. 用户确认后更新决策状态；相关非作者复核、外部签审与实际验证分别据实记录。
6. 汇总子项证据与剩余限制后验收父项；本轮启动不关闭 CL-005。

| 决策 | 当前结论 | 主责/复核 | 最迟节点 |
| --- | --- | --- | --- |
| D01 服务地域与增量预算 | 大陆优先、¥300/月，已由用户确认 | A（任宇航） | 已明确；实际服务地域仍需逐项核验 |
| D02 登录及认证组件 | 邮箱/邀请码规则、验证期限、腾讯云 SES 已确认；Better Auth 1.7.7 隔离核验通过，仓库未安装/接入 | A / B | CL-007/101 正式身份契约与实现前 |
| D03 私有存储/下载与删除 | 已确认资源为南京 COS；建议私有桶经 API 授权读取，配置与能力未验收 | A / B | CL-103/110/116/117 及真实资料接入前 |
| D04 检索/embedding | 本地多语言优先已确认；控制原型和BGE-M3/E5合成烟测通过，正式模型/索引配置待定 | A / B，C 验证 | CL-006/109 相关模型/实现定稿前 |
| D05 主模型/外发处理 | 聚合合成核验：GLM失败排除、DeepSeek基线、Step仅流式候选、MiniMax暂不选入；真实资料未准入 | A / C，相关外部责任人 | 实际外发及对应功能前 |
| D06 部署/编排/恢复 | 南京 CPU worker＋宁波受限 GPU、公网 HTTPS/mTLS 路线已确认；保留 Temporal，不新增队列库，实际部署/恢复待验证 | A / B，C 验证 | CL-008/013、相应恢复承诺与真实环境接入前 |

## 当前证据与限制

实际代码仍为 API 健康接口、jobs 表、Web 基线首页及 Temporal 健康工作流。
Compose 使用 PostgreSQL 17、Redis AOF 和 Temporal auto-setup，这是开发配置。
仓库未安装认证/向量/存储/模型依赖，未改业务代码、契约或迁移。候选仅在临时目录安装与验证。
按用户镜像要求修改了 Compose 入口和 .env.example，同步运行说明；其他服务部署配置未实施，未接入实际私有资源。

本轮公开资料初查于 2026-10-12：

- [Better Auth username 文档](https://www.better-auth.com/docs/plugins/username)：用户名插件扩展 email/password 登录，不证明注册可以完全没有邮箱字段，也不证明兼容当前 NestJS/Fastify/Drizzle 固定版本；保留为认证组件候选。
- [Better Auth email/password](https://www.better-auth.com/docs/authentication/email-password)、[Fastify 集成](https://www.better-auth.com/docs/integrations/fastify)和 [Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)：已读取官方说明，可作为候选兼容性核验入口；不代表邀请码及现有固定版本已验证。
- [pgvector 官方 README](https://github.com/pgvector/pgvector)：默认精确搜索；近似索引与条件过滤可能导致返回数量不足，迭代扫描等需按固定版本验证。具体扩展版本未选择。
- [Temporal self-hosted defaults](https://docs.temporal.io/self-hosted-guide/defaults)：历史有大小/事件数限制；不因此推定业务原文留存或删除规则已经满足。
- [OpenAI Responses create 官方参考](https://developers.openai.com/api/reference/resources/responses/methods/create)：作为聚合入口的协议对照，覆盖输入/输出、status、SSE、usage 和 store；不证明聚合平台实现或采用官方存储政策。Adapter 具体负例见 ADR-0005。

以上为公开文档阅读，不是兼容性、性能、许可证、供应商准入或实际部署验收。
第二轮新增实际隔离兼容性核验单独见验证记录，不改变外部条件或业务运行未验收的状态。
CL-010 接续 MinerU 当前候选版本、许可证、模型依赖及解析评测，不沿用旧“Latest”快照作为最终部署选择。

依据：[ADR-0001](../ADR-0001-technology-stack.md)、[ADR-0002](../ADR-0002-repository-and-deployment-topology.md)、
[CL-004](../../security/CL-004/README.md)、[R0 拆分](../../roadmap/CanLearn_V2.1_R0_Issue_Split.md)。
