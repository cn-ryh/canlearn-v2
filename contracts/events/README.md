# Event contracts

2026-10-13：CL-008 提案交付四类封闭 JSON Schema 2020-12，
[catalog.json](catalog.json) 的生产实现全部标 `planned`；当日尚无实际事件传输。

2026-10-14：[CL-013a](../../docs/integration/CL-013a/README.md)在默认关闭的本地合成范围中
实现 accepted/finalized/cancel_requested 三类 producer、PostgreSQL smoke_outbox 与 API→Temporal dispatcher，
真实持久事件经过同一封闭Schema检查。resource.invalidated、生产授权/总线/完整Inbox仍未实现。

| 类型 | Schema |
| --- | --- |
| Job受理 | [job.accepted.v1](v1/job.accepted.v1.schema.json) |
| Job终态 | [job.finalized.v1](v1/job.finalized.v1.schema.json) |
| 取消执行请求 | [job.cancel_requested.v1](v1/job.cancel_requested.v1.schema.json) |
| 资源更正/撤回/删除/撤权 | [resource.invalidated.v1](v1/resource.invalidated.v1.schema.json) |

包络有事件ID/类型/版本、UTC发生时间、trace、空间/伪匿名主体及聚合版本；载荷仅最小受控引用。
[fixtures/examples.json](fixtures/examples.json) 包含7个正例和19个破坏性负例，
由 API [事件契约测试](../../apps/api/src/contracts/events.contract.test.ts) 接入现有 `pnpm verify`/CI。
结构校验不证明引用同空间、授权或实际投递成功。

业务写入＋Outbox 同事务、DB消费者效果＋Inbox 同事务；Temporal 启动/信号与数据库不能原子提交，
使用稳定workflow/操作键及对账，不承诺外部付费执行恰好一次。
封闭v1改变字段需新版本及消费者先行兼容；未知版本隔离，禁止网络加载Schema。
详细语义与升级/失败规则见 [CL-008b](../../docs/workflow/CL-008/events-and-outbox.md)，
取消/删源及恢复例见 [CL-008](../../docs/workflow/CL-008/README.md)。
沿用 Temporal 和 PostgreSQL Outbox；生产方案与本地合成表分别记录，不新增通用事件总线。
