# CL-007 · REST通用契约与漂移检查

2026-10-13 · B主责、A审阅、C验证；设计/门禁交付，人工评审待补。
只有GET /v1/health已实现，其他业务端点在[OpenAPI](../../../contracts/openapi/canlearn.v1.yaml)
统一标`x-implementation-status: planned`与“[规划]”，没有接入认证、解析、模型或业务数据库写入。

依据：[CL-005身份/供应商/部署](../../architecture/CL-005/decision-closeout.md)、
[CL-006模型与写入](../../architecture/CL-006/README.md)、
[P0旅程](../../product/CL-001b-user-journeys.md)、
[权限矩阵](../../security/CL-004/permissions-and-content-rights.md)。

| 子项 | 工件与本轮证据 | 当前边界 |
| --- | --- | --- |
| CL-007a #33 | [通用约定](common-conventions.md)：会话/授权、错误、幂等、版本、分页与异步结果 | 文档设计，未实施业务鉴权/CSRF/幂等/预算 |
| CL-007b #34 | [端点与接纳规则](endpoint-map.md)、OpenAPI中的R1A/R1B规划端点、[合成样例](contract-examples.json) | schema/样例校验不代表业务请求运行成功 |
| CL-007c #35 | [漂移与准入规则](drift-and-admission.md)、[真实HTTP/Swagger测试](../../../apps/api/src/health/health.contract.test.ts)、[核验记录](validation-record.json) | 真实运行范围仅健康接口；规划路由当前404，负向改动能使门禁失败 |

手写OpenAPI是完整业务提案；运行时/docs与/docs-json只展示已实现控制器，两者不能全量比较。
测试只对手写标implemented的端点比较路径/方法、operationId、会话声明、响应码和200 JSON schema，
用真实Nest/Fastify inject验证响应；未登记的运行时路由、误升级planned或schema漂移都会失败。

```bash
pnpm contracts:check
pnpm --filter @canlearn/api test
pnpm verify
```

这些检查已进入现有pnpm check→test:unit→API Vitest→CI pnpm verify，不新增平行门禁或服务。
所有规划端点接入时须满足[准入清单](drift-and-admission.md)，不能只改标签就称已完成。
CL-008接续Job七状态/取消删除/Outbox及跨副本恢复；CL-013接续真实数据库/worker/外部接入。
CL-005/006非作者评审及供应商/样本条件仍未豁免，正式卡/Issue尚未验收关闭。
