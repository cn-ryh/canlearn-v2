# CL-008b：事件、Outbox 与消费去重

2026-10-13 · C→A 评审待补。只有四类域事件的提案，无生产 producer/consumer/broker。
Schema/目录/合成样例见 [contracts/events](../../../contracts/events/README.md)。

## 包络与语义

event_id 为稳定 UUID，event_type 带 `.v1`，schema_version=1；occurred_at 为 UTC/Z，
trace_id 为 32 位小写十六进制。aggregate_type/id/revision、space_id、actor_ref 与最小引用 payload 必填。
actor_ref 为内部伪匿名主体引用，不是邮箱/姓名，不能据此授予权限。自动操作使用受控服务主体引用。
UUID/Schema 格式通过不能证明同空间引用、合法用途或事件来自受信服务。

| event_type | 产生事务/用途 | 消费前复查 |
| --- | --- | --- |
| job.accepted.v1 | QUEUED＋输入快照＋请求去重；通知启动编排 | Job 当前状态/epoch/权限/来源、已有 workflow 映射 |
| job.finalized.v1 | 唯一终态＋可用结果引用；通知查询/刷新 | 事件是当时快照，当前费用/删除状态另查；不触发第二次扣费 |
| job.cancel_requested.v1 | CANCELLED＋epoch 提升；请求实际停止/清理 | 当前 epoch/取消记录；重复操作不再提升 epoch，不等同停止已确认 |
| resource.invalidated.v1 | 更正/撤回/删源/访问撤销；通知依赖与副本处理 | 当前来源修订/阻断/删除台账，不恢复旧索引或内容 |

同一取消事务可同时有 finalized/cancel_requested 两事件，聚合 revision 相同；
唯一性不能只取 aggregate_id＋revision，应按事件类型/操作键区分。
deleted 必须有 deletion_case_id 和正整数 watermark；其他失效原因这两项为 null。
删除 watermark 是该删除台账范围的顺序号，不能据此比较不相关空间的顺序；备份恢复需完整获准范围的最新台账。
失效事件仅给有限根引用（最多 32），闭包由 API 依赖表分批查，不能塞入整本文件或无限数组。

finalized 的 PARTIAL_READY 至少一个 result_ref；SUCCEEDED 可空（例如全空白页），FAILED 必须有 failure_code。
取消后的已接纳部分引用是否可读查当前 API；event.cost_state 只是产生时状态，后续 usage 对账不覆盖旧事件。
业务层核对 job_id=aggregate_id、快照/结果归属、终态与真实接纳事实、revision/epoch 单调性；
JSON Schema 不能比较两个 UUID 或证明数据库关系，须由 CL-105/114 实现负例。

所有对象拒绝额外字段，字符串仅限 UUID、固定枚举、UTC 时间/trace 格式。
事件/history 不含原文、模型完整输出、答案、上游完整错误、密钥、对象路径或带签名 URL；
consumer 用受限身份从 API 重新取得获准短期能力，不能把持久事件当 bearer token。
引用/伪匿名元数据也有权限与保留条件，Q02/Q09 未确定前不承诺无限期留存。

## 发布与消费事务

拟用业务 PostgreSQL 的 Outbox；不增加独立总线。最小持久记录：

| 记录 | 最小字段/约束 |
| --- | --- |
| Outbox | event_id PK、type/version、aggregate/space、payload、occurred_at、state(pending/claimed/sent/quarantined)、attempts、next_attempt_at、claim_token/lease、last_error_code |
| Inbox（DB 内效果） | UNIQUE(consumer_id,event_id)、type/version、handled_at；与领域效果同事务 |
| DispatchIntent（外部效果） | operation_id、event_id、job/workflow/epoch、state/intended_at/observed_at；不把意图当外部成功 |
| 清理/对账台账 | case/admission/目标引用、状态、回执、责任、截止；未知不能标 confirmed |

业务写入和 Outbox 在同一 SQL 事务：回滚两者都无；提交后 dispatcher 即使停机也可继续。
dispatcher 可用短事务 `FOR UPDATE SKIP LOCKED` 领取可投递行，生成 claim_token；
网络调用不持有长事务锁。确认已获目标持久回执后，以当前 claim_token 条件更新 sent。
租约过期旧 dispatcher 的回写拒绝；已发送而未确认/标记的行仍可能再次投递，consumer 必须去重。
领取跳过锁只用于队列表，不用于来源权限判断：
[PostgreSQL 17 SELECT](https://www.postgresql.org/docs/17/sql-select.html)明确其不能提供一般一致视图。
真实死锁/并发/重传测试由 CL-013/114 接续，内存模型不宣称证明 SQL 性质。

**DB 内消费者**：验证受信来源/Schema/space 后，同事务检查 Inbox、锁聚合当前版本、
执行领域变更并写 Inbox。提交前崩溃两者回滚，提交后 ACK 丢失重传无第二次效果。
不能先标消费成功再做效果；已处理但重复/过期事件也需可追踪判定。
consumer_id 表示同一逻辑消费者，滚动升级不要随便改名，否则旧事件会被当新输入。

**Temporal 启动/信号**不能与业务 DB Inbox 原子提交。先记录派发意图，再用固定 workflow_id
及显式拒绝重复策略尝试启动；冲突查询已有映射并校验同 Job/快照，成功后记回执。
服务接受但 ACK 丢失时核对现有 execution，禁止随机换 ID 再启动。
Temporal namespace 留存结束、history 不可查或结果未知时以业务事实/派发台账对账，
不依赖 Temporal 的留存期去重代替长期业务键。取消 signal 可重复携带 operation_id/epoch，
收到后查 API 权威状态，实际停止/usage 单独上报。具体传输、认证、超时策略由 CL-013 合成链路验证。

事件重放本身不直接扣费或调用模型；付费仍必须从 API 获唯一 admission 与预算预留。
数据库内去重不能保证外部调用恰好一次；外部幂等能力/停止/费用未知仍按 CL-008a 限制。
不同 event_id 但相同 publication/admission/receipt 的重放也被领域唯一键挡住，不单靠 event_id。
乱序完成与删除事件以当前 DB 阻断为准：旧 completed/accepted 不授权重建来源、触发付费或重开终态。

## 失败、版本升级与退出

投递暂时失败按有界退避和下次时间重试；达到配置的期限/次数进入 quarantined 并告警，
业务 Job 可查且保持原状态。人工重放使用同 event_id，仅改投递台账，不复制为新业务任务。
Schema 不识别/版本不支持、同 event_id 异 payload 或引用冲突立即隔离，不猜测/降级解析。

本稿 v1 为封闭 Schema；新增字段即使业务上可选，旧严格消费者仍会拒绝，必须创建 `.v2`/version=2。
迁移先部署支持 v1/v2 的消费者，再切 producer；回滚仅在旧消费者仍支持当前版本时允许。
同一业务操作的多版本事件需保留稳定 operation/publication 键；不把双发当两次费用或发布。
旧事件不原地改写，重放仍按原 Schema；未知版本隔离。版本退出需要在途/历史/恢复与保留策略盘点，
不能靠强行删除去重记录来清空队列。

本轮没有生产 DDL/dispatcher/清理 worker；后续实现按固定 schema_id 做离线验证，禁止运行时从网络
加载 `$ref`，也不使用目录提案域名作为可访问服务。事件回归已进入现有 API Vitest/CI 入口。
