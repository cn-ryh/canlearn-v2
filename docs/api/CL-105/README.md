# CL-105 · 持久化解析任务（本地隔离切片）

2026-11-11 · 只交付**默认关闭、仅回环、仅合成夹具**的本地切片；
生产 `POST /v1/documents/{id}/parse-jobs`、`GET /v1/jobs/{id}`、
`POST /v1/jobs/{id}/cancel` 仍为 `planned`。[CL-105 条目](../../roadmap/CanLearn_V2.1_Issue_Backlog.md)
在 R1A 尚未建 Issue，本包**不等于 CL-105 完成**。

## 为什么不能直接把 planned 改成 implemented

[CL-007c 准入规则](../CL-007/drift-and-admission.md)规定：新接口从 planned 改 implemented 前，
必须同时具备真实控制器/DTO、会话与验证邮箱、Origin/CSRF、服务端空间归属与越域 404、
幂等与并发、版本/取消/晚到回执、真实 HTTP 与负例证据，以及迁移/部署兼容记录。
这些前提的载体是 CL-101（会话与资源权限）、CL-103（不可变原件与权限域）、
CL-104（上传会话），本轮均未实现；生产契约内部也还没有 `/v1/documents/...` 的真实表与
`/v1/jobs/...` 的业务读写路径。只改标签会让一份规划契约冒充运行能力，
`health.contract.test.ts` 的"误升级 planned"负例也会立即失败。

因此本切片按 CL-007 的既有做法走**独立契约 + 独立路径 + 独立开关**，
不改 `contracts/openapi/canlearn.v1.yaml` 一个字节，也不把任何生产操作改标 `implemented`。

## 范围

| 维度 | 本切片 | 生产端点（仍 planned） |
| --- | --- | --- |
| 契约 | 独立 [canlearn.local.v1.json](../../../contracts/openapi/canlearn.local.v1.json)，`x-runtime-scope: local-isolated-only` | [canlearn.v1.yaml](../../../contracts/openapi/canlearn.v1.yaml) 27 个操作不变 |
| 路径 | `/v1/local/parse-jobs`、`/v1/local/jobs/{jobId}`、`/v1/local/jobs/{jobId}/cancel` | `/v1/documents/{id}/parse-jobs`、`/v1/jobs/{id}` |
| 开关 | `CANLEARN_LOCAL_PARSE_ENABLED === "true"` 才装配模块；关闭时三条路径均为 404，Swagger 只有 `/v1/health` | 无开关，始终存在 |
| 访问控制 | 复用 `SmokeGuard`：仅回环、变更请求需 `X-Smoke-Client: 1` 与可信 Origin | 会话 + CSRF + 服务端资源授权 |
| 输入 | 客户端给的 documentId/versionId 只是**不透明引用**，`document_version_id` 不建外键、不做归属校验 | API 从会话与 DB 解析归属、版本、用途、删除状态 |
| 结果 | 固定合成夹具的逐页状态，不访问网络、不调 MinerU、不建对象 | 真实 PDF/解析适配器/对象存储/费用台账 |
| 派发 | 不写 `workflow_id`，不派发 Temporal；解析"结果"由夹具直接落库 | `cl-job/<job_id>` + Temporal + worker 回执 |

关闭开关时模块完全不进 DI 容器（`createAppModule()` 里按 `process.env` 判断），
所以生产镜像即使带着代码也没有这些路由，不存在"忘记关"的运行面暴露。
`main.ts` 在任一本地开关开启时强制只监听 `127.0.0.1`，与 CL-013a 合成运行面一致。

## 数据与迁移

新增一张表 `local_parse_jobs`（迁移 `0003_real_zarda`），仅追加、不修改既有迁移：

| 列 | 类型/默认 | 说明 |
| --- | --- | --- |
| `job_id` | uuid PK，FK → `jobs.id` | 复用既有 `jobs` 七状态与主键 |
| `request_key` | text UNIQUE NOT NULL | `Idempotency-Key`，请求作用域固定为本地合成域 |
| `request_hash` | text NOT NULL | 语义载荷指纹；同键异指纹 → 409 |
| `snapshot_id` | uuid NOT NULL | 首次受理锁定的不可变快照标识（非生产 `JobInputSnapshot`） |
| `trace_id` | text NOT NULL | 32 位十六进制，与 smoke 风格一致 |
| `document_id` / `version_id` | uuid NOT NULL | 客户端引用，**故意不建外键**：生产文档/版本表尚不存在 |
| `profile_id` | text NOT NULL | 固定 `local-synthetic-v1`，客户端不能选解析器 |
| `fixture` | text NOT NULL | `success/partial/blank/fail/pending` 五档合成夹具 |
| `requested_pages` | jsonb NOT NULL | 请求页集合，作为分母；不因失败页缩小 |
| `page_results` | jsonb NULL | 逐页 `success/blank/failed/missing`；未回执为 NULL |
| `revision` / `epoch` | integer 默认 1 | 与 CL-008 的 revision/准入代同名同义 |
| `failure_code` | text NULL | 仅 FAILED 时 `PERMANENT_ERROR` |
| `termination_state` | text 默认 `not_requested` | `not_requested/requested/confirmed` |

`jobs` 表原样复用：`kind='local_parse'`、`status` 走既有 `job_status` 枚举、`input/output` 保存最小载荷。
没有新增 SQL 枚举，没有改既有列，符合 [CL-006c 追加式迁移](../../architecture/CL-006/ownership-and-migrations.md)
与 `scripts/quality_policy.py` 的保守门禁。

## 三个端点

| 操作 | HTTP | 行为 |
| --- | --- | --- |
| `createLocalParseJob` | `POST /v1/local/parse-jobs` → 202 | 返回 `Location: /v1/local/jobs/{id}` 与强 `ETag`；同键同载荷重放返回同一 Job 并带 `Idempotency-Replayed: true`；同键异载荷 409；页范围二选一，歧义/缺失 422 |
| `getLocalParseJob` | `GET /v1/local/jobs/{jobId}` → 200 | `Cache-Control: no-store` + 强 `ETag`；未知 ID 404；ID 形状错误 400 |
| `cancelLocalParseJob` | `POST /v1/local/jobs/{jobId}/cancel` → 200 | 活跃 Job 同事务置 `CANCELLED`、`epoch+1`、`termination_state=requested`；已终态原样返回、不写历史 |

另有**内部**晚到回执 transport `POST /v1/internal/local-parse/jobs/{jobId}/admit`（`@ApiExcludeController` +
回环 + `CANLEARN_SMOKE_TOKEN`），仅用于验证"取消 vs 晚到结果"的同一行锁语义，不进入公开契约与 Swagger。
它与 CL-013a 的 `/v1/internal/smoke` 同属私有 transport，不是生产 API。

### 行为矩阵

| 场景 | 结果 |
| --- | --- |
| 同 `Idempotency-Key` + 同载荷 | 复用同一 Job，`202`，`Idempotency-Replayed: true`，`revision` 不变 |
| 同 `Idempotency-Key` + 不同载荷 | `409 IDEMPOTENCY_KEY_REUSED`，不新建 Job |
| 并发同键首请求 | 事务级 advisory lock 串行化：1 个真创建 + 3 个重放，只有一个 Job 行 |
| 只给 `all: true` | 请求页 = 1..6 |
| 只给 `pages: [...]` | 请求页 = 给定集合，保持顺序；分母即该集合 |
| `all` 与 `pages` 同给 / 都不给 / 页重复 | `422`（语义错误，不是结构 400） |
| 非法 fixture / profile / 页越界 / 额外字段 | `400`，落在 service 之前 |
| 缺 `X-Smoke-Client` / 非回环 / 不可信 Origin | `403` |
| `fixture=success` | `SUCCEEDED`，6 页 `success` |
| `fixture=blank` | `SUCCEEDED`，6 页 `blank`（可学习范围为 0） |
| `fixture=fail` | `FAILED`，`failureCode=PERMANENT_ERROR`，6 页 `failed` |
| `fixture=partial`（全页） | `PARTIAL_READY`，`success/failed/success/missing/failed/success` |
| `fixture=partial` + `pages=[1,2]` | `PARTIAL_READY`，只回报页 1/2，分母仍是 2 |
| `fixture=pending` | `QUEUED` + `pageResults: null`，等待取消或内部回执 |
| 取消活跃 Job | `CANCELLED`、`epoch+1`、`terminationState=requested`、`revision+1` |
| 再次取消 / 取消终态 | 原样返回，`epoch`/`revision`/`ETag` 均不变 |
| 内部回执（snapshot+epoch 匹配、页集合等于请求集合） | 一次接纳，写入逐页结果与终态，`revision+1` |
| 回执页越界/缺页/超出请求范围 | `409 LOCAL_PARSE_MANIFEST_REJECTED`，不补造 |
| 取消先提交 → 晚到回执 | `409 LOCAL_PARSE_JOB_TERMINAL`，`pageResults` 保持 NULL，终态仍 `CANCELLED` |
| 回执先提交 → 随后取消 | 保持已接纳 `PARTIAL_READY/SUCCEEDED`，取消不改已有事实 |
| 回执重复提交 | `409 LOCAL_PARSE_RESULT_ALREADY_ACCEPTED`，不产生第二份结果 |

## 与 CL-008 的对应

- **七状态**：直接复用既有 `job_status`；终态集合 `SUCCEEDED/PARTIAL_READY/FAILED/CANCELLED`
  在 [local-parse.domain.ts](../../../apps/api/src/local-parse/local-parse.domain.ts) 里显式定义，不含新枚举。
- **PARTIAL_READY 语义**：只有"有可用页 + 有失败/缺页"才成立，表示本次有界尝试已结束；
  不是"后台还在重试"。全 blank 记 `SUCCEEDED` 但可学习页为 0；全失败记 `FAILED`。
- **幂等**：请求作用域固定为本地合成域（无账户），语义指纹覆盖文档/版本/来源修订/档位/夹具/页集合；
  用 `pg_advisory_xact_lock` + `UNIQUE(request_key)`，并发只有一个赢家。
- **取消原子性**：取消与内部回执都 `SELECT ... FOR UPDATE` 同一 `jobs` 行并改同一 `local_parse_jobs` 行，
  所以"取消先提交则晚到拒收 / 回执先提交则取消不改事实"是数据库层面成立的，不是进程内猜测。
  但 `termination_state=confirmed`（物理停止回执）本轮**没有**实现，只有 `requested`。
- **晚到结果**：`acceptanceDecision` 先核 snapshot/epoch 围栏，再核终态，最后核页集合；
  任一不满足即 409，绝不复活已取消 Job。

## 本轮**未**覆盖（不能据此宣称 CL-105 完成）

1. 真实文档/版本表与归属校验（CL-103/CL-104）：本表的 `document_id/version_id` 只是客户端引用。
2. 会话、邮箱验证、Origin/CSRF、越域 404、角色负例（CL-101）。
3. 真实 MinerU 适配器与解析质量（CL-106/CL-010）；本切片零网络调用。
4. Temporal 真实派发、worker 回执、重启恢复（CL-114）；`workflow_id` 故意为空。
5. 费用台账、预算准入、未知成本对账（CL-115）。
6. 物理停止确认（`termination_state=confirmed`）、对象存储暂存/正式产物与清理。
7. 生产契约上任何 `planned → implemented` 的迁移；本包完全不碰生产契约。

## 复现与门禁

```bash
pnpm --filter @canlearn/api db:generate   # 生成 0003_real_zarda + snapshot
pnpm quality:check                        # 追加式迁移 + 精确依赖 + schema 漂移
pnpm --filter @canlearn/api test          # 域逻辑 + 真实 HTTP/Swagger 契约（默认跳过 DB）
pnpm --filter @canlearn/api typecheck
pnpm contracts:check                      # 三份契约的 Redocly lint
pnpm --filter @canlearn/api build
```

真实 PostgreSQL 行为（并发同键、取消/回执竞态、重启后查询）需显式指向一次性实例：

```bash
docker run -d --rm --name cl105-test-pg -e POSTGRES_DB=canlearn \
  -e POSTGRES_USER=canlearn -e POSTGRES_PASSWORD=canlearn_local \
  -p 127.0.0.1:15434:5432 postgres:17-alpine
CANLEARN_LOCAL_PARSE_TEST_DATABASE_URL=postgresql://canlearn:canlearn_local@127.0.0.1:15434/canlearn \
  pnpm --filter @canlearn/api exec vitest run src/local-parse/local-parse.db.test.ts
```

该套件会先 `drop schema public cascade` 再迁移，**只能**指向一次性实例。
`pnpm verify` 的默认 API 测试不连接数据库，所以这 10 项默认跳过（输出里显示 `10 skipped`）。
本轮实际执行的命令、退出码与测试分布见 [validation-record.json](validation-record.json)。

## 与 Issue 的关系

CL-105 在 R1A，尚未建 Issue。本包只交付本地隔离的行为/契约证据，
**不得**用它关闭 CL-105、CL-101、CL-114 或任何 R1A 卡片；
生产端点仍受 [CL-007 准入清单](../CL-007/drift-and-admission.md)全部条件约束。
