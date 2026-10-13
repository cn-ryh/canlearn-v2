# CL-006 · 跨学科数据模型与写入所有权

2026-10-13 · R0设计与合成场景验证包；未实施数据库迁移或业务端点。
对应父项#6、子项#30–#32；A=任宇航，B复核。非作者人工复核待补，不以脚本代签。

依据：[P0范围](../../product/CL-001a-scope-boundaries.md)、
[数据目录](../../security/CL-004/data-inventory-and-lifecycle.md)、
[权限与用途](../../security/CL-004/permissions-and-content-rights.md)、
[CL-005选型](../CL-005/README.md)。现有数据库只有
[jobs骨架](../../../apps/api/src/database/schema.ts)，下面的实体、约束和事务均为拟实施设计。

| 子项 | 工件 | 当前交付 | 留待验收 |
| --- | --- | --- | --- |
| CL-006a | [概念模型与字段字典](conceptual-model.md) | 空间、通用学科、目标、共享容量与版本ERD | B非作者复核、后续schema/权限实现 |
| CL-006b | [版本关系与失效传播](versions-and-invalidation.md) | 原件到证据/计划依赖图、引用坐标、更正/撤回/删除区别 | 真实并发/存储/备份清理、Q04签审 |
| CL-006c | [写入所有权与迁移](ownership-and-migrations.md) | 模块写入矩阵、接纳事务、jobs增量演化和恢复前提 | B以冲突/删除案例人工复核、实际迁移回滚 |

[原创合成样例](examples.json)与[可执行场景检查](validate_examples.py)展示跨目标容量只扣一次、
私有/公共用途交集、来源修订冲突、删除闭包及旧恢复点不直接开放等约束。
[结果](example-results.json)是纯内存设计演练，不能证明SQL事务、权限实现、物理删除或备份恢复通过。

```bash
python3 docs/architecture/CL-006/validate_examples.py \
  --output /tmp/cl006-examples.json
```

CL-007接续REST接口/错误/幂等，CL-008接续Job状态机、事件/Outbox与取消/删除原子协调；
这些接口与事件在本包只确定所需语义，不提前改正式契约。CL-009准备合法样本与引用真值。
2026-10-13[CL-007](../../api/CL-007/README.md)已交付规划OpenAPI与健康接口真实HTTP/Swagger门禁；
上述数据模型没有因此实施为业务schema或运行接口。
CL-006设计包可供评审，父卡及子卡尚未综合验收或关闭。
