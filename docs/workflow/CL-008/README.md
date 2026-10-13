# CL-008：Job、事件与故障恢复设计

2026-10-13（Asia/Shanghai）· R0 可评审提案，**未获非作者综合验收**。
A = 任宇航；a 为 A→B、b 为 C→A、c 为 A→C，B/C 仍为角色代号，未补造实际审核记录。
承接 [CL-006c](../../architecture/CL-006/ownership-and-migrations.md) 和
[CL-007](../../api/CL-007/README.md)，对应 [#8](https://github.com/cn-ryh/canlearn-v2/issues/8)
及 [#36](https://github.com/cn-ryh/canlearn-v2/issues/36)–[#38](https://github.com/cn-ryh/canlearn-v2/issues/38)。

| 子项 | 可复核产出 | 尚未证明 |
| --- | --- | --- |
| a | [七状态、快照、步骤准入与 ID 映射](job-state-and-admission.md) | 真 SQL 并发锁、业务鉴权、Temporal 重启/重放 |
| b | [Outbox/Inbox 与版本升级](events-and-outbox.md)、[四类事件 Schema](../../../contracts/events/README.md)及 26 个结构正负例 | 真实投递、原子事务、供应商幂等/停止/账单 |
| c | [失败注入/恢复矩阵](failure-and-recovery.md)、[34 个合成场景](scenarios.json)和[结果](example-results.json) | 物理清理、旧备份真实恢复、对象/进程/外部副本状态 |

所有事件目录项标 `planned`。现有应用仍只有健康 API 与 HealthCheckWorkflow；
未新增 Job 业务路由、生产工作流、Outbox 表、数据库迁移、事件总线或运行环境配置。
PARTIAL_READY 的终态语义及下述协议为冻结候选，需 B/C 评审后作为实现依据。

## 复现与门禁

```bash
uv run --project apps/workflow ruff format docs/workflow/CL-008/job_model.py
python3 docs/workflow/CL-008/job_model.py
pnpm exec biome format --write docs/workflow/CL-008/example-results.json
pnpm --filter @canlearn/api exec vitest run src/contracts/events.contract.test.ts
cd apps/workflow && uv run pytest tests/test_cl008_reference.py -q
```

Python 脚本仅用标准库，在独立内存中执行动作并核对人工编写的期望：终态、可读页、接纳次数、
外部调用次数、已知费用、未知费用状态、删除阻断及消费去重。`known_charge_units` 是合成整数记账单位，
**不是人民币成本或完整账单**；为 0 且 cost_state 为 unknown 时仍须对账。
模型用顺序动作表示竞态的不同先后顺序，用复制/回滚表示事务边界；不证明实际锁和进程停止。
重建前在仓库根执行上面的Ruff命令，使用与提交钩子相同的配置上下文，再生成源摘要；
禁止在归档后切换格式配置改变源码而留下旧摘要。

现有 `pnpm verify` 自动接续 API 的 Ajv JSON Schema 2020-12 门禁及 workflow 的设计回归测试。
35 项 Python 检查为 34 场景＋结果/源 SHA 一致性；事件检查为 4 Schema、26 正负例与 3 状态/目录/覆盖检查。
事件正文/URL/凭据额外字段、缺空间/版本/删除水位、空部分结果等负例应拒绝；
Schema 结构通过不代表资源引用确属同空间，语义授权必须在 API 实现测试中验证。
核验范围和摘要见 [validation-record.json](validation-record.json)。

## 接续与退出

下一可独立推进的是 CL-013a 的**合成最小 job 纵向链路**：在现有工程中实现/验证 API→
业务数据库→Temporal→worker 的受控桩，随后 CL-013b 加真实故障/契约门禁。
CL-010 的真实复杂解析质量与 CL-009 合法样本/双标继续关联，不用 300 页简单合成资料代替。
真实资料、付费生产执行与 R0 放行仍受 CL-005/009/010/014 条件限制。
本包的验收缺口与执行卡一一列在失败矩阵；不因设计模型通过关闭 #8/#36–#38。
