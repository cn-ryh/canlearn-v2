# CL-013a：合成 Job 最小纵向链路

2026-10-14（UTC）· 对应 [#50](https://github.com/cn-ryh/canlearn-v2/issues/50)，父卡
[#13](https://github.com/cn-ryh/canlearn-v2/issues/13)。B→C 非作者审核与实际验收待补。

本包实现 Web → API → PostgreSQL Job/Outbox → Temporal → Python worker → API 接纳回执 → Web 查询。
Web、HTTP、数据库事务和 Temporal 是真实运行；worker 只对固定的原创三页夹具模拟页状态。
无上传、MinerU、模型、GPU、腾讯云或付费调用，不表示真实资料质量、安全鉴权或 R0 已放行。
承接 [CL-005d](../../architecture/ADR-0006-deployment-and-async-coordination.md)、
[CL-008a](../../workflow/CL-008/job-state-and-admission.md)，生产设计的审核条件继续保留。

## 从干净检出复现

需要 Node 24、pnpm 12、Python 3.12、uv、可访问本机 socket 的 Docker，以及支持 `!override`
的 Compose 2.24.4+。使用仓库锁文件，不必复制或修改 `.env`。

```bash
pnpm install --frozen-lockfile
uv sync --project apps/workflow --frozen
pnpm smoke:up
```

访问 <http://127.0.0.1:3310/smoke>，选择全部成功、部分可用、全空白或永久失败，然后创建任务。
页面显示 Job/trace/workflow/snapshot ID、当前状态、页清单、失败代码及停止回执。
“同键重发”返回同 Job；先改变参数再同键重发应报告冲突。记录 Job ID 可在重启后粘贴查询。
取消 10 秒模拟任务应先显示 CANCELLED，随后停止回执由 requested 变为 confirmed。

脚本使用 [现有 Compose](../../../compose.yaml) 和
[隔离端口覆盖](../../../compose.smoke.yaml)，项目名固定为 `canlearn-cl013`；主项目卷不受影响。
PostgreSQL/Temporal/UI 为 15433/17234/18081，API/Web 为 3311/3310，均仅绑定回环地址。
启动先运行 Drizzle 增量迁移，再启动编译后的 API/Web、Python worker 和独立 dispatcher。
默认镜像保留仓库入口、命名空间与固定标签，未修改 daemon；实际拉取摘要见验证记录。

运行状态、PID、日志和随机内部 token 保存于 `/tmp/canlearn-cl013-<uid>/`，权限为 0700/0600。
可在首次启动前设置 `CANLEARN_SMOKE_RUNTIME_DIR` 为一个独立目录；后续操作必须使用同一目录。
这些文件只留在本地，不提交；浏览器不接收 token，token 不进入 NEXT_PUBLIC、事件或 workflow history。
`runtime.json` 被当作私有配置使用，不输出其内容。脚本显式覆盖本轮参数，并让 Compose 使用空 env 文件，
不会读取仓库 `.env`；主库 URL 不被复用。

```bash
python3 scripts/smoke_runtime.py status
python3 scripts/smoke_runtime.py restart worker
python3 scripts/smoke_runtime.py restart
pnpm smoke:down
pnpm smoke:up
```

down 停止本轮进程和 Compose 服务，保留隔离数据库卷。再次 up 后，已创建的 Job、请求键、快照、结果
和 Temporal 历史应保留。用下面命令删除**这个隔离项目**的数据卷；该操作只用于丢弃合成测试数据。

```bash
python3 scripts/smoke_runtime.py clean
```

## 契约与真实写入边界

默认不开启 `CANLEARN_SMOKE_ENABLED`，API 无合成及内部路由，Web 页面/代理返回 404，worker 仅注册健康工作流。
显式启用时，API 进程强制监听 127.0.0.1，guard 拒绝非回环请求；内部路由另需随机 service token。
Web 代理限制同源变更、固定目的地和三条公共操作，不转发内部 token或允许任意 URL/路由。
固定本地主体/空间只服务于原创夹具，不能替代生产会话、邮箱验证、资源归属、用途和删除授权。

| 公共操作 | HTTP | 边界 |
| --- | --- | --- |
| 创建 | POST `/v1/smoke/jobs` → 202 | `mode` 与 0–15000ms 延迟，UUID v4 Idempotency-Key、X-Smoke-Client: 1；任意正文额外字段拒收 |
| 查询 | GET `/v1/smoke/jobs/{id}` → 200 | 仅 `synthetic_parse`，未知 Job 404，含派发状态 |
| 取消 | POST `/v1/smoke/jobs/{id}/cancel` → 200 | 活跃 Job 原子 CANCELLED/epoch 提升；重复取消及已终态不改历史 |

独立 [合成 OpenAPI](../../../contracts/openapi/canlearn.smoke.v1.json) 标明 local-synthetic-only，
启用时与运行时 Swagger 对齐。生产 [OpenAPI](../../../contracts/openapi/canlearn.v1.yaml) 的
27 个规划操作继续 planned；没有把合成控制器装进生产业务资源入口。

内部 transport 在 `/v1/internal/smoke`，所有操作受 token 与回环限制：

| 操作 | 载荷/效果 |
| --- | --- |
| GET `jobs/{id}` | 当前 Job/输入参数与 run 映射，不返回实际资料 |
| POST `jobs/{id}/start` | snapshotId、epoch；原子 QUEUED→RUNNING，终态不重新准入 |
| POST `jobs/{id}/finish` | snapshotId、epoch、三页 manifest；复核固定真值，结果＋终态＋finalized Outbox 同事务 |
| POST `jobs/{id}/stopped` | 本次合成 activity 已退出后确认取消；不是外部 GPU/供应商停止证据 |
| POST `jobs/{id}/abandon` | snapshotId、epoch；合成 activity 有界失败后结束活跃 Job，不重开终态 |
| POST `outbox/claim` | 短事务 SKIP LOCKED，10 秒 lease与新 claim token，网络期间不持锁 |
| POST `outbox/{id}/ack` | claimToken、启动时的 runId；Temporal Run ID 接受 SDK 的 UUID 版本，陈旧 lease 拒绝 |
| POST `outbox/{id}/fail` | claimToken；延迟重传，十次失败隔离；Job 仍可查询 |
| POST `outbox/{id}/replay` | 仅隔离事件恢复为 pending；保留 event_id/attempts，不授权新 Workflow |

权威写入仍只有 API。`smoke_jobs` 保存请求键/指纹、不可变快照、trace、epoch、revision、唯一接纳摘要、
Temporal run 映射与停止子状态；`smoke_outbox` 保存事件、派发意图/lease/回执状态。
既有 jobs 七状态未新增枚举。此合成链覆盖 QUEUED/RUNNING 及四个终态；WAITING_REVIEW 保留为设计，未实现审校功能。
初始活跃任务限额 10 仅为本地保护，不是生产容量承诺。

同键请求通过 SQL 事务锁和 UNIQUE 限制去重，异参数返回 409。取消和接纳锁同一 Job/元数据行，
取消先提交则旧 epoch/晚到结果拒收；完成先提交则保持原成功/部分/失败终态。
终态、结果与事件在一个事务中；SQL 故障不会留下可读结果或孤立完成事件。
三种页成功/部分/空白/失败结果严格按固定 manifest 判断：全空白可 SUCCEEDED，学习可用页数为 0。

## 派发、重启与故障边界

dispatcher 通过 API 领取 Outbox，不持业务 DB 凭据。首次受理用固定 `cl-job/<job_id>`、
`REJECT_DUPLICATE` 启动 Temporal；重领只查询既有 execution，并解码原始引用快照比对后确认同一个 run。
已启动但 ACK 丢失可对账；重领却找不到历史则保持未知/隔离，不能随机换 ID 或重新创建。
取消 signal 可重传，worker 仍从 API 查权威状态。finalized 事件仅被合成观察者确认，不触发收费或第二次处理。
生产四类事件仍为 planned；其中三类已有本地合成 producer/dispatcher，resource.invalidated 未实现。
这不等同完整 Inbox/生产事件总线，也不保证外部恰好一次执行。

合成 activity heartbeat 3 秒、单次 30 秒、总体 90 秒、最多 3 次尝试；worker 被杀后 Temporal 可从原 Job 重做
免费的确定性模拟。生产付费/解析调用仍需 CL-008 admission、预算、上游幂等和停止/费用对账，不可复用该重试策略。
停止 confirmed 仅指本次 activity 的模拟计算结束。服务长期不可用而终态回调无法提交时，DB/Temporal 需人工对账；
未实现生产 watchdog、物理删除、旧备份恢复、供应商停费、GPU 租约、真实权限撤销或审校等待。

派发隔离后先核对 API 与 Temporal 的固定 ID/快照/历史，修复故障，再用持同一私有 token 的内部 replay 接口恢复
原事件；缺历史时仍会隔离，不能把“未查到”视作“从未执行”。日志只记录固定错误代码及合成引用。

## 自动验证与回退

```bash
pnpm verify
pnpm smoke:test --skip-build
```

smoke:test 启动真实隔离栈，依次检查 Web 提交、并发同键、异载荷、DTO/Origin/内部鉴权、四种页结果、
重复/冲突回执、取消/停止/晚到、worker SIGKILL/heartbeat 重试、真实 history replay、API 重启、
启动 ACK 丢失/陈旧 claim、SQL 事务回滚、完成与取消并发、全栈停止再启动、真实事件 Schema 和唯一受理事件。
最后自动停止服务并保留合成卷；`--keep` 仅用于继续本机查看。
结果默认写私有 runtime 下的 integration-results.json，仅包含合成 ID 与断言，不含 token/原文。
本轮公开归档见 [validation-record.json](validation-record.json) 与 [integration-results.json](integration-results.json)。
现有 CI 在 pnpm verify 后运行同一 smoke:test。CI 成功只证明这一合成范围，CL-013b/c 的全面门禁继续待验收。

另有7项真实 Chromium 页面交互检查及[桌面成功](screenshots/success-desktop.png)、
[390px移动端部分结果](screenshots/partial-mobile.png)截图。Playwright只安装在仓库外的临时目录，
未增加项目依赖；可在已启动合成栈时按固定版本重跑（可选，不在 CI 自动安装浏览器）：

```bash
npm install --prefix /tmp/canlearn-cl013-browser --no-package-lock playwright@1.56.1
PLAYWRIGHT_BROWSERS_PATH=/tmp/canlearn-cl013-browser/browsers node /tmp/canlearn-cl013-browser/node_modules/playwright/cli.js install chromium --only-shell
PLAYWRIGHT_BROWSERS_PATH=/tmp/canlearn-cl013-browser/browsers node scripts/smoke_browser.cjs
```

页面检查覆盖按钮提交/同键重发、部分页显示、移动端无横向溢出、取消/停止确认、手动刷新和无pageerror；
记录见[browser-results.json](screenshots/browser-results.json)。截图和公开记录仅包含原创合成数据。

回退顺序：先关闭合成入口并停止 dispatcher/worker，保留隔离 Job/Outbox 对账记录，回退应用代码。
增量迁移只新增两个 smoke 表；不回滚既有 jobs 枚举或删除事实。丢弃隔离试验用 clean，不能把它用于业务库。
若对持久数据库手动撤销迁移，必须先备份、确认无在途任务，先删除 smoke_outbox，再 smoke_jobs；
禁止自动修改迁移账本或声称旧应用回退已经撤销数据库变更。

实现与检查依据：[Temporal Python SDK](https://python.temporal.io/temporalio.client.Client.html)、
[Worker/replay](https://python.temporal.io/temporalio.worker.Worker.html)、
[PostgreSQL 17 行锁](https://www.postgresql.org/docs/17/sql-select.html)。
