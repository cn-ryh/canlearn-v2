# CL-106 · 固定版本 MinerU V1 Adapter 设计契约（草案）

2026-11-11 · 本文件是**设计契约草案**，不是实现交付，也没有新增代码、端点、表或迁移。
它把 [CL-010 探针](../../workflow/CL-010/README.md) 已经跑通的 `MineruClient` 与
[CL-105 本地任务模型](../CL-105/README.md) 之间的缺口写成可评审的契约：能力清单、失败分类、
字段映射、准入证据与未决项。R1A 仍处
[No-Go（CL-014b）](../../security/CL-014/r0-r1a-gate-decision.md#1-决定)，本草案只在隔离研发范围内有效。

## 1. 状态与范围声明

| 项 | 状态 |
| --- | --- |
| 本文件性质 | 设计契约草案；供评审与后续实现卡拆分，非验收记录 |
| 新增代码 / 端点 / 表 / 迁移 | 无 |
| 生产契约变更 | 无；本文件未改动 `contracts/openapi/` 下任何契约，也未改动任何迁移 |
| 阶段门 | R1A [No-Go](../../security/CL-014/r0-r1a-gate-decision.md#1-决定)，仅允许隔离研发 |
| 档位结论 | 未下；归 [#44](https://github.com/cn-ryh/canlearn-v2/issues/44)，本文件不替它决定 |
| 真实质量结论 | 未下；`real_human_quality_verified: false`（[CL-010 集成记录](../../workflow/CL-010/integration-results.json)） |
| Issue | CL-106 在 R1A 尚未创建 Issue；本草案不构成任何卡片的关闭依据 |

三条不能越过的界线：

1. **CL-010 探针跑通 ≠ 业务 Adapter 可用。** 26 项集成检查覆盖的是"固定原创夹具 + 连续页范围 +
   `basic` 经 API/Job/Temporal 的完整链路 + 回环网络"；`flash` 另有两页直接下载，不在这 26 项内，
   也不构成档位比较。探针证明的是该范围内的协议与恢复行为（第 2 节逐条对比）。
2. **Adapter 是内部组件。** 它没有公共端点，因此**不触发**任何 `planned → implemented` 迁移，
   也不能拿来给 CL-105/CL-107 的业务端点做准入结论（第 8 节）。
3. **未知即未知。** CL-010 实测出的"创建成功但 ACK 丢失"必须延续为业务语义：
   创建结果未知时**不得自动重建**（第 4.4 节、第 6 节 F04）。

## 2. CL-010 已证明什么，CL-106 还差什么

左列只写 CL-010 的**实际执行**范围；右列只写 Adapter 成为业务组件所需的增量。两列不对等，
不可用左列推断右列。

| 维度 | CL-010 已证明（探针范围） | CL-106 还需要的（业务 Adapter） |
| --- | --- | --- |
| 输入来源 | 固定夹具注册表 `contracts/fixtures/mineru-probe.v1.json` 的三个条目（`reading`/`stack`/`volume300`），按 `fixtureId + sha256 + pages` 三重匹配（[实现与边界](../../workflow/CL-010/README.md#实现与边界)） | 动态文档版本：由 API 解析 `document_id`/`version_id` 归属与版本，worker 只拿受控引用（依赖 CL-103、CL-104） |
| 页范围 | 连续 `page_range: 1-N`；客户端入口只接受整数页数并拼成 `1-{pages}`（[`MineruClient.create_job`](../../../apps/workflow/src/canlearn_workflow/mineru.py)） | 显式页范围，含非连续页集合；CL-105 的 `requestedPages` 已是集合语义，当前客户端**不支持**（缺口 G2） |
| 档位 | 只实测 `flash`、`basic`；服务启动参数含 `no_advanced=True`（[复现与回退](../../workflow/CL-010/README.md#复现与回退)） | 档位由获准 profile 决定，默认值与可用集合待 #44（第 7 节） |
| 失败分类 | 19 个 `MINERU_*` 错误码 + 4 个探针 `failure_code`（`UPSTREAM_LOST`/`CREATE_UNKNOWN`/`UPSTREAM_FAILED`/`PROTOCOL_INVALID`），落在 `mineru_probe_jobs.phase` 与 `failure_code` | 需映射到 `jobs` 七状态 + 可重试/永久/未知三分类 + 业务 `failure_code`（第 4、6 节） |
| 产物落地 | 本地目录（`CANLEARN_MINERU_PROBE_ARTIFACT_DIR`，默认 `/tmp/...`），文件权限 0600，校验字节数与 SHA-256 | 对象存储暂存 + 权威接纳 + 正式/清理对账（依赖 CL-103 与 CL-005a 桶决策） |
| 费用 | 无账本、无单价、无 usage 回执 | CL-115 预算准入与用量回执；Adapter 需产出可去重的供应商回执引用 |
| 归属与权限 | 回环 + `X-Smoke-Client` + `CANLEARN_SMOKE_TOKEN`，无真实用户、无空间归属 | 会话/空间/用途解析由 API 负责（CL-101/CL-103）；Adapter 不持有业务写权限 |
| 幂等 | 探针请求键 + 输入快照 + CAS revision（`mineru_probe_jobs`） | 业务幂等键 = 权限域 + 输入版本 + 参数 + 请求键（[CL-008a](../../workflow/CL-008/job-state-and-admission.md#业务标识与幂等)） |
| 取消 | 逻辑取消 + epoch 围栏；实测对象是**真正排队中**的上游任务 | `termination_state=confirmed` 的物理停止回执，当前无任何证据（第 6 节 F09） |
| 派发 | 评测脚本在 SQL 提交后显式 `start_workflow`，无 Outbox 自动派发 | 生产派发/启动对账（CL-114）；`workflow_id = cl-job/<job_id>` |
| 持久化表 | `mineru_probe_jobs`（`request_key` 为 uuid、`phase` 为探针专用）；探针作用域，不可当业务表复用 | 业务 Job 行 + 上游映射（job/file/产物回执/hash），见第 5 节 |
| 容量 | 最多 10 个活动探针 Job | 并发与 GPU 租约未定（第 10 节 U2） |

## 3. 职责边界

三方，缺一不可，且**写入权只有一方**。

| 角色 | 可以做 | 不可以做 | 依据 |
| --- | --- | --- | --- |
| 主 API（唯一业务事实写入者） | 受理与快照、幂等映射、发布/接纳、终态与 Outbox、费用台账、取消与删除水位 | — | [CL-006c 写入矩阵](../../architecture/CL-006/ownership-and-migrations.md#写入矩阵) |
| Python worker（Adapter 宿主） | 执行外部调用、上报候选产物 manifest 与最小回执、申请下一步骤 | 不写业务 PostgreSQL；不自行判定发布资格；不持有永久全库凭据 | 同上；[CL-008a](../../workflow/CL-008/job-state-and-admission.md#权威事务与外部执行) |
| MinerU 上游 | 返回任务状态与产物字节 | 无权威：其内部索引、`status`、`model_used` 都不构成平台事实 | [CL-010 实际 V1 协议](../../workflow/CL-010/README.md#实际-v1-协议与恢复) |

CL-006c 中与本卡直接对应的两行：

> | 文档/解析/标准块/索引代 | Document API | 指定临时命名空间写候选与逐页manifest | 当前来源/删除条件＋接纳元数据＋active代切换＋Outbox |
> | Job/步骤/费用/取消 | Job / Usage API | 上报步骤与usage，申请下一步骤 | 步骤准入＋预算预留＋当前取消/删除条件；接纳usage去重 |

以及约束句："Python worker只持受限服务身份、Temporal存储权限和限定临时对象能力；无业务PostgreSQL写账号。"

因此 Adapter 的产出形态必须固定为：**候选引用 + 逐页状态 + 产物回执（字节数/SHA-256）**，
由 API 在同一事务里决定是否接纳。Adapter 不得自己把"上游说 completed"写成"平台 SUCCEEDED"。

## 4. Adapter 能力清单

### 4.1 能力总览与实测覆盖

"实测"列只表示 CL-010 在 2026-10-14 用真实 4.0.7 服务跑过，不表示 Adapter 就绪。

| 能力 | 客户端入口 | CL-010 实测 | 证据 |
| --- | --- | --- | --- |
| 能力探测 | `MineruClient.health` | 是（校验 `version == "4.0.7"`、`sources` 含 `file_id`、三类 `output_formats`） | [integration-results.json](../../workflow/CL-010/integration-results.json) 第 1 项、`health` 字段 |
| 上传 | `MineruClient.upload`（POST `/v1/uploads` → PUT → POST complete） | 是 | 同上；[请求样例](../../workflow/CL-010/http-request-example.json) |
| 提交 | `MineruClient.create_job`（POST `/v1/parse/jobs`，期望 202） | 是 | [basic-response.json](../../workflow/CL-010/basic-response.json) |
| 轮询 | `MineruClient.get_job` / `wait` | 是 | 同上；超时项见 F06 |
| 下载 | `MineruClient.download`（先元数据后 `/content`） | 是，三类产物均有字节数与 SHA | [output-record.json](../../workflow/CL-010/output-record.json) |
| 取消 | `MineruClient.cancel`（DELETE） | 是，仅排队中任务 | [integration-results.json](../../workflow/CL-010/integration-results.json)（"cancellation target is actually queued upstream"） |
| 页索引校验 | `page_indices`（`docvortex.middle` / schema 2.0 / 零基 → 一基） | 是，1–300 页唯一完整 | 同上；[CL-008 对照](../../workflow/CL-008/job-state-and-admission.md#七状态与可达转换) |

### 4.2 逐能力的输入、输出、失败分类与幂等语义

**A. 能力探测**

- 输入：基础地址（仅 HTTPS 或回环）、凭据。
- 输出：`status`/`version`/`features.sources`/`features.output_formats`。
- 失败分类：结构或版本不符 → `MINERU_CAPABILITY_MISMATCH`，**永久**（不可重试，需换部署或改期望）；
  连不上 → `MINERU_TRANSPORT_UNKNOWN`，**可重试**。
- 幂等：只读，可任意重放。

**B. 上传**

- 输入：PDF 路径 + 期望 SHA-256；上限 5 MiB、需 `0 < size`。
- 输出：`file-*` 标识。
- 失败分类：体积/摘要不符 → `MINERU_FIXTURE_TOO_LARGE` / `MINERU_FIXTURE_HASH_MISMATCH`，**永久**；
  传输报错 → `MINERU_TRANSPORT_UNKNOWN`，**可重试**；重定向或跨源 URL → `MINERU_TRANSFER_REJECTED`，
  **永久**；返回 `purpose`/`bytes`/`sha256sum` 不一致 → `MINERU_FILE_INTEGRITY_MISMATCH`，**永久**。
- 幂等：以 `sha256sum` 为语义键。CL-010 单测覆盖了"上传对象状态已是 `completed` 时只发一次 POST、不再 PUT/complete"。

**C. 提交**

- 输入：`file_id`、页数（当前为 `1-N`）、`tier`（当前仅 `flash`/`basic`）、`ocr_mode=auto`、
  三类 `output_formats`。
- 输出：`job_*` + 单文件 `status`，DTO 结构经白名单校验。
- 失败分类：结构非法 → `MINERU_PROTOCOL_INVALID`，**永久**；4xx 拒绝 → `MINERU_HTTP_REJECTED`，**永久**
  （但当前探针把创建阶段的任意 `MineruError` 都记为 `CREATE_UNKNOWN`，见缺口 G1）；
  超时/断流 → `MINERU_TRANSPORT_UNKNOWN`，**结果未知**。
- 幂等：**无上游幂等键**。单次提交，`POST` 永不自动重试；重试只能是"先查到已有 job，否则新建"。

**D. 轮询**

- 输入：`job_*`；预算 `0 < seconds ≤ 600`、`0 ≤ interval ≤ 5`。
- 输出：终态之一 `completed`/`partial`/`failed`/`canceled`。
- 失败分类：404 → `MINERU_RESOURCE_LOST`，按 `UPSTREAM_LOST` 处理（**永久**，不重建）；
  非法载荷 → `MINERU_PROTOCOL_INVALID`（**永久**）；预算耗尽 → `MINERU_POLL_TIMEOUT`（**可重试**，
  保留原上游 ID）；传输报错 → `MINERU_TRANSPORT_UNKNOWN`（**可重试**，转 `POLL_TIMEOUT` 语义）。
- 幂等：只读 GET；超时**不取消、不重建**上游任务。

**E. 下载**

- 输入：产物 `file-*` + 格式（`markdown`/`middle_json`/`structured_content`）。
- 输出：`Artifact(format, file_id, bytes, sha256)` 回执。
- 失败分类：格式不在白名单 → `MINERU_OUTPUT_FORMAT_INVALID`（**永久**）；元数据不符/字节数或摘要
  不一致/超 32 MiB → `MINERU_FILE_INTEGRITY_MISMATCH`（**永久**，需人工核查上游）；非 200 →
  `MINERU_DOWNLOAD_REJECTED`（**可重试**）；传输报错 → `MINERU_TRANSPORT_UNKNOWN`（**可重试**）。
- 幂等：GET 可重放；写入走 `.part` 临时文件，失败即删除，不留半成品。

**F. 取消**

- 输入：`job_*`。
- 输出：`status=canceled` 的**逻辑**确认。
- 失败分类：返回体不含 `job_*` 或状态不是 `canceled` → `MINERU_PROTOCOL_INVALID`；上游不可达 →
  `MINERU_TRANSPORT_UNKNOWN`：探针记停止状态 `unknown`（探针枚举是 `logical_acknowledged`/`unknown`），
  CL-105 契约侧只有 `not_requested`/`requested`/`confirmed`，两者都**不是**"已停止"或"免费用"。
- 幂等：重复 DELETE 可重放；但**逻辑取消 ≠ 物理 GPU 停止**（[CL-010](../../workflow/CL-010/README.md#实际-v1-协议与恢复)）。

**G. 产物结构校验**

- 输入：`middle_json` 文件 + 期望页数。
- 输出：一基物理页索引列表。
- 失败分类：producer/版本不符 → `MINERU_ARTIFACT_SCHEMA_MISMATCH`；页索引越界/重复/缺失 →
  `MINERU_PAGE_COVERAGE_INVALID`。两者均为**永久**（不补造、不猜页）。
- 幂等：只读。

### 4.3 三类失败分类（本卡的核心分类）

| 类别 | 定义 | 现有错误码/信号 | 平台处置 | 自动重试 |
| --- | --- | --- | --- | --- |
| 可重试 | 调用未产生副作用，或状态可重新查询 | `MINERU_TRANSPORT_UNKNOWN`（读取阶段）、`MINERU_POLL_TIMEOUT`、`MINERU_DOWNLOAD_REJECTED` | 保留快照与上游 ID，按有界退避重试 | 是，且有总截止 |
| 永久失败 | 重放相同输入只会同样失败 | `MINERU_CAPABILITY_MISMATCH`、`MINERU_PROTOCOL_INVALID`、`MINERU_FILE_INTEGRITY_MISMATCH`、`MINERU_PAGE_COVERAGE_INVALID`、`MINERU_RESOURCE_LOST`、`MINERU_HTTP_REJECTED`(4xx) | `FAILED` + `retryable=false`，不自动重开 | 否 |
| 结果未知 | 无法判断上游是否已执行/是否仍持有结果 | 创建阶段的 `MINERU_TRANSPORT_UNKNOWN`、创建期间进程失联、取消后的停止状态 | `FAILED` + `CREATE_UNKNOWN`，保留证据待人工对账 | **否** |

### 4.4 "创建未知不得自动重建"的来由

CL-010 用回环故障中继做了真实实验：上游 POST **已经成功**，只把回复丢掉。结果是
上游随后真实完成，而平台保留 `FAILED`/`CREATE_UNKNOWN`、`upstream_job_id: null`，没有结果发布，
也没有自动重发（[integration-results.json](../../workflow/CL-010/integration-results.json) 中
"successful real upstream POST with lost ACK becomes CREATE_UNKNOWN"、
"unknown creation is never automatically retried or falsely published"、
"lost-ACK upstream computation actually completed while platform withheld result" 三项）。

对应代码约束：创建前先落 `create_pending`，再 POST；重试只允许走"查询已存在任务"这一条路径
（[mineru_probe.py](../../../apps/workflow/src/canlearn_workflow/mineru_probe.py)）。
CL-008 的口径相同：付费创建默认单次提交，未知需人工/供应商对账
（[CL-008a](../../workflow/CL-008/job-state-and-admission.md#temporal-与需要对账的状态)）。

## 5. 与 CL-105 本地任务模型的对接映射

CL-105 的 `local_parse_jobs` 是**合成切片**：`document_id`/`version_id` 是客户端给的不透明引用、
不建外键，`profile_id` 只有 `local-synthetic-v1`，`fixture` 是从五个合成档里选
（[数据与迁移](../CL-105/README.md#数据与迁移)）。下面是逐字段的替换关系。

| CL-105 现状 | 字段/约束 | CL-106 接真实解析时替换为 | 依赖 |
| --- | --- | --- | --- |
| `job_id` → `jobs.id` | uuid PK，复用七状态 | 不变；Adapter 只在该行上做回执 | CL-008a |
| `request_key` / `request_hash` | 唯一键 + 语义指纹，作用域固定为本地合成域 | 幂等作用域改为"已认证 actor + 空间 + operation + 目标资源" | CL-101、CL-114 |
| `snapshot_id` | 首次受理锁定，不覆盖 | 不变；快照需含真实 source/content/rights/access revision | CL-103 |
| `document_id` / `version_id` | 不透明引用，**故意不建外键** | 真实不可变版本引用 + 归属校验 + 越域 404 | CL-103、CL-104 |
| `profile_id` | 单值枚举 `local-synthetic-v1` | 获准 profile（锁定解析器版本/档位/页范围上限） | #44、OQ-08 |
| `fixture` | `success/partial/blank/fail/pending` | 删除该列语义；真实输入由版本 + 页范围决定 | — |
| `requested_pages` | 页集合，1..6，去重 | 真实页集合，上限待 OQ-01；仍需"分母 = 请求页数" | OQ-01、#44 |
| `page_results` | 逐页 `success/blank/failed/missing` | 保留；由 Adapter 从真实产物推导，**不得**由模型补页 | CL-107、CL-108 |
| `revision` / `epoch` | CAS + 取消围栏 | 保留；Adapter 回执必须带 snapshot + epoch | CL-008a |
| `failure_code` | 只有 `PERMANENT_ERROR` | 需扩展：`UPSTREAM_LOST`/`CREATE_UNKNOWN`/`UPSTREAM_FAILED`/`PROTOCOL_INVALID` + 可重试标志 | 本卡（第 6 节） |
| `termination_state` | `not_requested/requested/confirmed`，只到 `requested` | `confirmed` 需物理停止证据，当前**无来源** | CL-005/CL-010 |
| `workflow_id`（`jobs` 表） | 本切片故意为空 | 固定 `cl-job/<job_id>`，由 dispatcher 启动 | CL-114 |
| `jobs.input/output` | 合成载荷 | 引用化载荷；不含正文/凭据/签名 URL | CL-008a |
| —（无对应列） | — | 上游映射：`upstream_job_id`、`file_id`、产物回执（format/fileId/bytes/sha256）、parser 版本 | 本卡 |
| —（无对应表） | — | 费用/usage 回执 | CL-115 |

两条必须写死的迁移纪律：

1. `local_parse_jobs` 与 `mineru_probe_jobs` 都**不是**业务表。前者是合成切片，后者的
   `request_key` 是 uuid、`phase` 是探针专用枚举；直接拿来当业务上游映射会同时破坏幂等域与状态语义。
2. 真实接线的字段扩展走**追加式迁移**（CL-006c M1），不改既有迁移、不改七状态枚举
   （[jobs骨架的增量演化](../../architecture/CL-006/ownership-and-migrations.md#jobs骨架的增量演化)）。

## 6. 失败与恢复矩阵

每行都必须能回答四件事：怎么检测、平台记什么、是否自动重试、证据出自哪里。
"未实测"行不写期望值，只写当前代码的实际行为与待定项。

| # | 场景 | 检测方式 | 平台状态 | 自动重试 | 证据出处 |
| --- | --- | --- | --- | --- | --- |
| F01 | 上游 401（未认证上传/轮询） | 期望 200 得到 401 → `MINERU_HTTP_REJECTED` | 上传/轮询阶段：探针统一落 `failed` + `PROTOCOL_INVALID`，原始码被折叠；创建阶段则落 `CREATE_UNKNOWN`。目标语义应为 `FAILED`，`retryable=false`（凭据/配置问题） | 否 | [http-negative-results.json](../../workflow/CL-010/http-negative-results.json)（直接 HTTP 负例，未经过 activity 处理器） |
| F02 | 旧 3.x 接口 404（`/file_parse`） | 期望端点返回 404 | 若作为「资源不存在」进入客户端，会落 `failed`/`PROTOCOL_INVALID`（探针把除 `UPSTREAM_LOST` 外的错误折叠成这一个码）；本质是用错 API 代际，**不得**回退到 3.x | 否 | 同上（"legacy file_parse absent", 404） |
| F03 | 上游重启后旧 V1 job 404 | `get_job` 404 → `MINERU_RESOURCE_LOST` 且已有 `upstreamJobId` | `FAILED` + `UPSTREAM_LOST`；保留映射与快照，**不重建** | 否 | [integration-results.json](../../workflow/CL-010/integration-results.json) 两项："actual MinerU restart loses old V1 resource index"、"platform retains mapping/snapshot and reports UPSTREAM_LOST without recreate" |
| F04 | 创建 ACK 丢失 | 创建前落 `create_pending`；POST 抛传输错误 | `FAILED` + `CREATE_UNKNOWN`；`upstream_job_id` 为空；不发布 | **否**（第 4.4 节） | 同上，三项 lost-ACK 检查 |
| F05 | 部分页失败 | 上游 `status=partial`，或单文件状态非 `completed` | 目标语义：`PARTIAL_READY` + 逐页状态；**当前实现会判 `PROTOCOL_INVALID`**（缺口 G4） | 否（只允许新子 Job） | [CL-008a](../../workflow/CL-008/job-state-and-admission.md#七状态与可达转换)；CL-010 **未**做真实 partial 样本 |
| F06 | 轮询超时 | 预算耗尽 → `MINERU_POLL_TIMEOUT` | 保持 `RUNNING` 与原上游 ID；显式 resume 用新 epoch 继续 GET | 是（受总截止约束） | integration-results："bounded poll timeout returns without recreating/canceling upstream"、"timed-out Job remains RUNNING with its durable upstream ID"、"explicit resume keeps input snapshot and upstream ID" |
| F07 | 限流（429） | 当前**无专门分支**：非预期、非 404 一律 `MINERU_HTTP_REJECTED` → 探针记 `PROTOCOL_INVALID` | 未定；现状会误判为永久失败 | 否（现状） | 代码阅读：[`mineru.py`](../../../apps/workflow/src/canlearn_workflow/mineru.py) `json()`；**未实测** |
| F08 | 进程重启后查询原任务 | worker SIGKILL → Temporal heartbeat 超时后重试；从持久映射读 `upstreamJobId` 再 GET | 恢复为 `RUNNING`→终态；不新建解析 | 是（activity 级，最多 2 次尝试） | integration-results："SIGKILL worker resumes original upstream task without new parse creation"；探针 workflow 超时参数见 [`mineru_probe.py`](../../../apps/workflow/src/canlearn_workflow/mineru_probe.py) |
| F09 | 取消后的物理停止 | 只能观测到上游 `status=canceled` 的**逻辑**确认 | `CANCELLED` + `termination_state=requested`；探针侧停止状态只能是 `logical_acknowledged`/`unknown`；`confirmed` **无来源** | 不适用 | integration-results 末字段 `physical_active_job_stop_verified: false`；[CL-010](../../workflow/CL-010/README.md#实际-v1-协议与恢复) 明示"不证明 running GPU 计算已物理停止" |
| F10 | 取消先提交 → 晚到结果 | API 行锁 + snapshot/epoch 围栏 | 晚到回执 409，`pageResults` 保持 NULL，终态仍 `CANCELLED` | 否 | [CL-105 行为矩阵](../CL-105/README.md#行为矩阵)；CL-010："controlled late old-epoch receipt is fenced after cancellation" |
| F11 | 产物损坏 / 超大 / 重定向 | 字节数或 SHA 不符、>32 MiB、跨源 URL | `FAILED`，`MINERU_FILE_INTEGRITY_MISMATCH` 或 `MINERU_TRANSFER_REJECTED`；`.part` 临时文件删除 | 否：按当前代码这两类都是永久，需人工核查上游 | [`test_mineru.py`](../../../apps/workflow/tests/test_mineru.py)（digest/redirect/oversized 三例） |
| F12 | 能力/版本不符 | `health` 的 version/features 校验失败 | `FAILED` + `MINERU_CAPABILITY_MISMATCH`；不派发 | 否 | [`mineru.py`](../../../apps/workflow/src/canlearn_workflow/mineru.py) `health()` |

已知分类缺口（本草案要求在实现卡中闭合，不在此处假装修好）：

- **G1**：创建阶段任何 `MineruError` 都被记成 `CREATE_UNKNOWN`，包括 401 这类"明确被拒"的情况
  （[`mineru_probe.py`](../../../apps/workflow/src/canlearn_workflow/mineru_probe.py) 的 `except MineruError` 分支）。
  这在未知侧偏保守，但会把"确定被拒"混进人工对账队列；Adapter 需按错误码区分"确定被拒（永久）"与"结果未知"。
- **G2**：`create_job` 只接受整数页数并拼 `1-N`，无法表达 CL-105 已支持的页集合。
- **G3**：429/5xx 无独立分类，全部折叠进 `MINERU_HTTP_REJECTED`；而探针 activity 又把除
  `MINERU_RESOURCE_LOST`、带上游 ID 的 `MINERU_TRANSPORT_UNKNOWN` 之外的码统一写成 `PROTOCOL_INVALID`。
- **G4**：`partial` 被当作可结束状态，但紧随其后的校验要求单文件 `status == "completed"`，
  因此真实部分失败会被判协议错误；CL-008a 的 `PARTIAL_READY` 在 Adapter 侧没有映射路径。
- **G5**：`termination_state=confirmed` 没有任何数据来源。

## 7. 档位与页范围

**本文件不对 #44 下结论。**

- 只有两个档位在代码与实测中出现过：`flash`、`basic`。探针 DTO 的枚举就是 `["flash","basic"]`。
- 实测覆盖面：`basic` 跑过 2 页（经主 API/Job/Temporal）与 300 页；`flash` 只在
  CPU 独立环境做过两页直接 V1 下载。CL-010 明确写"Flash 只做原创两页直接 V1 下载，
  不构成与 Basic 的正式档位质量比较"（[可复核证据与接续](../../workflow/CL-010/README.md#可复核证据与接续)）。
- 服务启动参数含 `no_advanced=True`（[复现与回退](../../workflow/CL-010/README.md#复现与回退)），
  因此 `standard`/`advanced` 在本仓库**没有任何实测或枚举证据**：四档里只有 `flash`/`basic` 有据。
- 页范围：实测为 `1-2`（`basic-response.json` 的 `page_range`）与 `1-300`；都是连续区间。

由此，Adapter 的契约约束只能是：

> Adapter 必须支持**显式**传入档位与页范围，不得依赖上游/CLI 默认值；具体哪些档位可用、
> 各档位的成本与质量、页范围授权上限，全部待 #44。

`basic-response.json` 另有两条对 Adapter 有用的实测事实：`model_used` 为 `null`（不能据此记录
"实际使用了哪个模型"），以及上游 `output_files` 还包含 `html`/`latex`/`docx`/`zip` 等可选格式，
Adapter 只取三类目标产物。

## 8. 契约准入映射

Adapter 无公共端点，因此**不触发** [CL-007c 六条准入](../../api/CL-007/drift-and-admission.md#ci与增量准入)
中的任何一条升级。它是其中两条的**证据来源**：

| 准入条件 | Adapter 提供什么证据 | 还差什么 |
| --- | --- | --- |
| 条件 4：Job 202 / 查询 / 部分可用与取消删除、当前版本接纳、暂存/正式产物与清理 | 真实上游的 `job_*` 生命周期、逐页页索引、三类产物回执（bytes+SHA）、上游重启后的对账、取消围栏 | 条件 4 的"部分可用"需要真实 partial 样本（G4）；"暂存/正式产物与清理"需 CL-103/CL-107 与对象存储决策，本卡单独不闭合 |
| 条件 6：原件/供应商/范围获准、迁移/部署兼容与人工审阅记录 | 固定版本 4.0.7 的能力探测（版本/来源/格式三重校验）、显式 `tier` 与 `page_range`、许可与版本快照 | 许可签审与部署镜像摘要（CL-010a，外部责任人）；#44 的档位/页范围授权；真实网络与供应商准入 |

间接贡献但**不构成验收**：条件 5（真实 HTTP 与错误测试）——Adapter 侧已有真实 401 与旧接口 404
两类负例，但那是上游接口的负例，不是 CanLearn 端点的响应契约验证。

条件 1/2/3 与 Adapter 无关：没有控制器/DTO、没有会话与空间归属、幂等与版本冲突由 API 层承担。

## 9. No-Go 下的可推进边界

措辞与 [R1A 拆分 CL-106 节](../../roadmap/CanLearn_V2.1_R1A_Issue_Split.md#cl-106-r1ap0workflow-接入固定版本-mineru-v1-adapter)
一致，不扩大范围。

| 可在隔离研发下完成 | 必须等外部条件 |
| --- | --- |
| Adapter 客户端（上传/提交/轮询/下载 + 能力探测）的扩展：页集合、429/5xx 分类、partial 映射 | 许可与部署镜像签审（CL-010a 外部权利责任人） |
| 故障分类与恢复路径（第 6 节 F01–F12）的合成注入 | #44 的真实档位/页范围授权 |
| 夹具回放：固定版本 4.0.7 的契约夹具与能力探测回归 | 真实网络与供应商准入（外部签审，G-供应商） |
| 固定版本 4.0.7 的版本硬校验与换版本阻断 | 合法样本 [#39](https://github.com/cn-ryh/canlearn-v2/issues/39)–[#41](https://github.com/cn-ryh/canlearn-v2/issues/41)（真实文件与真实产物质量评测） |
| 仓库原创 PDF 上的行为验证（含 4.0.7 的 `no_advanced=True` 服务形态） | — |

"必须等外部条件"一列中的 #39–#41 出自拆分文档
[第 8 节外部阻塞清单](../../roadmap/CanLearn_V2.1_R1A_Issue_Split.md#8-上游依赖与外部阻塞清单)
（"阻断 CL-104/106/107/108 的真实文件与真实产物质量部分"），并非 CL-106 节的额外加码；
[#40](https://github.com/cn-ryh/canlearn-v2/issues/40) 负责样本准入与分层，本卡不引用其数值。

**不得**以"探针跑通"宣称生产可用；也不得把隔离环境的 4.0.7 结论外推到未测档位或真实资料。

## 10. 未决项

| # | 未决项 | 当前事实 | 出处 | 触发节点 |
| --- | --- | --- | --- | --- |
| U1 | Adapter 是否常驻（worker 内进程 vs 独立服务） | CL-010 的形态是"独立服务 + httpx 调用，不在 worker 安装模型" | [CL-010 实现与边界](../../workflow/CL-010/README.md#实现与边界) | CL-106 首个真实接入设计评审 |
| U2 | 并发与 GPU 租约 | 4070 重任务使用单一受限执行器，解析与文档 embedding 串行，跨 worker 共享资源准入；不能靠"两个 worker 各自并发 1"实现互斥 | [CL-005 结论](../../architecture/CL-005/decision-closeout.md)；[CL-008c F24](../../workflow/CL-008/failure-and-recovery.md) | #44 / CL-114 |
| U3 | 产物放对象存储还是本地暂存 | 探针写本地目录（0600），无对象存储、无清理台账 | [CL-010](../../workflow/CL-010/README.md#实现与边界)；[CL-006c](../../architecture/CL-006/ownership-and-migrations.md#接纳与费用语义) | CL-103 首个真实对象 |
| U4 | 失败重试次数上限 | 探针 activity `maximum_attempts=2`；创建 POST 从不重试 | [`mineru_probe.py`](../../../apps/workflow/src/canlearn_workflow/mineru_probe.py) | CL-114 / CL-115 |
| U5 | 超时值 | 客户端 `timeout=10s`；轮询上限 600s；activity `start_to_close=720s`、`schedule_to_close=1500s`、`heartbeat=15s` | [`mineru.py`](../../../apps/workflow/src/canlearn_workflow/mineru.py)、[`mineru_probe.py`](../../../apps/workflow/src/canlearn_workflow/mineru_probe.py) | CL-105/CL-114 定案（结合容量） |
| U6 | `tier` 默认值 | 无默认；探针 DTO 必填且只允许 `flash`/`basic` | [`mineru-probe.dto.ts`](../../../apps/api/src/mineru-probe/mineru-probe.dto.ts) | #44 |
| U7 | 上游版本升级策略 | 版本硬校验为 `4.0.7`；换版本无迁移/回归流程 | [`mineru.py`](../../../apps/workflow/src/canlearn_workflow/mineru.py) `health()`；[CL-010a](../../workflow/CL-010/version-and-license.md) | CL-010a 签审 / 换版本时 |
| U8 | 429/5xx 的分类与退避 | 无独立分支，全部 `MINERU_HTTP_REJECTED`（缺口 G3） | 代码阅读；**未实测** | CL-106 实现首个失败分类用例前 |
| U9 | 页范围形态（连续 1-N vs 任意集合） | 客户端只支持连续区间；CL-105 已用集合语义 | 第 2 节；[CL-105 行为矩阵](../CL-105/README.md#行为矩阵) | CL-106 实现首个真实页范围用例前 |
| U10 | 真实 partial 到 `PARTIAL_READY` 的映射 | 当前会判 `PROTOCOL_INVALID`（缺口 G4）；无真实样本 | 第 6 节 F05 | #44 / CL-108 |
| U11 | **失败码命名冲突（本轮已裁决）** | CL-008a 规定超时/上游索引丢失记 FAILED + `UPSTREAM_OUTCOME_UNKNOWN`（内部事件 `failure_code=UPSTREAM_UNKNOWN`）；CL-010 探针实测写的是 `UPSTREAM_LOST` | [CL-008a 七状态与可达转换](../../workflow/CL-008/job-state-and-admission.md)（权威契约，已随 CL-008 关闭）；[CL-010 实测](../../workflow/CL-010/README.md#实际-v1-协议与恢复)；本节 F03 | 裁决结论见下方"命名裁决" |

### 命名裁决（2026-11-11）

两处命名不应并列存在，必须指定一个权威来源：

- **业务 `failure_code` 以 CL-008a 为准**：`UPSTREAM_OUTCOME_UNKNOWN` 是对外/事件级语义，
  内部 `failure_code` 用 `UPSTREAM_UNKNOWN`。CL-008a 是已关闭的设计契约，且 CL-006c/CL-007c
  的错误码表引用同一口径。
- **`UPSTREAM_LOST` 降级为探针内部描述**：CL-010 的 `mineru_probe_jobs.failure_code` 是隔离探针
  的本地记录，不改写历史证据，但它**不是**业务错误码，不得直接搬进 `jobs.failure_code`。
- **实现要求**：CL-106 接真实解析时，`get_job` 404 / 索引丢失 → 业务 `UPSTREAM_UNKNOWN`
  （事件 `UPSTREAM_OUTCOME_UNKNOWN`），`retryable=false`，保留映射与快照、不重建。
  这与 CL-010 探针的可观察行为一致（探针也"不重建、保留映射"），差异仅在命名层。
- **证据保留**：CL-010 的 `integration-results.json` 与 README 原文不改，另在
  [CL-010 README 第 55 行](../../workflow/CL-010/README.md#实际-v1-协议与恢复) 记录的是当时实测值。
  后续如在 CL-010 相关文档补注，应写"实测记录名，业务命名为 UPSTREAM_UNKNOWN"而不改写历史。

## 本轮验证边界

本文件为**纯文档**变更：没有运行 MinerU、没有 GPU、没有新增代码、没有改契约或迁移，也没有运行
`pnpm verify`（并行开发中的 `apps/web` 与 `apps/api/src/local-parse` 会影响结果）。
实际执行的核查（文件阅读、链接目标检查、JSON 格式校验、`git diff --check`）与其结果见
[validation-record.json](validation-record.json)。

## 与既有文档的关系

- **不替代 [CL-010](../../workflow/CL-010/README.md)**：CL-010 是探针的实测证据包（26 项集成、
  2 项真实负例、35 项合成回归、产物 SHA），本文件只在它的边界上画增量，不重复它的记录，
  也不把它的检查数当作 Adapter 的检查数。
- **不替代 [CL-105](../CL-105/README.md)**：CL-105 是本地任务切片（合成夹具、默认关闭、仅回环），
  定义的是 Job 侧字段与行为；本文件写的是这些字段接真实解析时要换成什么。
- **不替代 [CL-008](../../workflow/CL-008/README.md)**：七状态、取消/晚到、Outbox 与步骤准入
  以 CL-008a/b/c 为准；本文件不新增状态、不重新定义 `PARTIAL_READY`。
- **不替代 [CL-006c](../../architecture/CL-006/ownership-and-migrations.md)**：写入所有权与
  追加式迁移纪律以它为准。
- **不替代 [CL-007c](../../api/CL-007/drift-and-admission.md)**：六条准入条件与"不得只改标签"的规则
  以它为准；本文件第 8 节只是把 Adapter 的证据对到其中两条。
- **不改变阶段决定**：[CL-014b](../../security/CL-014/r0-r1a-gate-decision.md#1-决定) 的 No-Go
  继续有效，本草案不构成任何解除条件已满足的声明。
