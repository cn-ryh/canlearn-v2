# CL-007c · 运行时漂移与新端点准入

2026-10-13 · 实施范围：健康接口声明与真实HTTP/Swagger门禁；业务端点均未实施。

## 双来源与测试范围

手写[OpenAPI](../../../contracts/openapi/canlearn.v1.yaml)为完整规划契约，
Nest[运行时Swagger](../../../apps/api/src/application.ts)来自已安装控制器，只列实际路由。
健康返回值不变，响应声明补齐对象类型、必需字段、additionalProperties:false及单值enum，
operationId/security与implemented标记对齐。版本/ValidationPipe/helmet/CORS/Swagger共享启动配置，
测试创建同一应用但不listen公网/回环端口，用Fastify inject执行真实请求。

测试不是直接调用HealthController函数，也不把规划OpenAPI整份挂到/docs冒充运行能力。
只对手写标implemented的业务路由与运行时路径集合一致性、ID、security、响应码及200 JSON schema核对，
同时验证实际HTTP200/Content-Type/JSON响应。未知/缺失实现标记、漏登记运行路由、误升级planned、
响应字段改值/缺失/额外、手写schema变化均可让门禁失败。
所有planned路由做当前404核验，防止一份规划契约被误当实现；未来准入改标后自动进入实现集合。
Swagger UI等技术路由不计作业务规划操作；业务鉴权/并发/幂等/取消/删除测试待实际控制器接入。

schema编译与合成DTO正负例由Ajv8.20.0/ajv-formats3.0.1、YAML2.9.1验证，均为API devDependencies。
二进制format在schema检查中只表示字符串，PDF/文件字节/大小/内容安全仍由真实实现检验。
不新增生产SDK或基础设施依赖，测试代码不进入应用构建。

## CI与增量准入

现有CI运行pnpm verify，已包含API Vitest；本轮测试自动进入同一入口。
实际GitHub CI运行要在用户明确提交/推送后核验，本轮只记录本地结果。
手写规范Redocly lint继续保留，JSON Schema与真实HTTP/Swagger对齐同时通过才可认为已实现接口有契约证据。

新接口从planned改implemented前至少完成：

1. 实际控制器/DTO、稳定operationId与Swagger声明；所有引用/HTTP响应/错误与手写契约一致。
2. 会话、验证邮箱、Origin/CSRF、服务端空间归属/父子/用途、越域404与角色负例；schema通过不算此验收。
3. 幂等同键/异载荷/并发、If-Match/版本冲突及晚到回执；预算准入和未知成本不重复付费。
4. Job 202/查询/部分可用与取消删除、当前版本接纳、暂存/正式产物与清理；由CL-008/相应卡验证。
5. 真实HTTP响应验证与对应请求/错误测试；以当前控制器为范围，补齐该端点的非200 schema验证与请求参数/DTO对齐。
6. 原件/供应商/范围获准、迁移/部署兼容与人工审阅记录；未具备时保留合成研发范围。

当前响应schema对齐检查针对唯一已实现的200 JSON健康端点；未来端点含其他媒体/错误/参数时须
扩展方法，不能将“已有比较器通过”误写成所有请求/错误/Range/安全条件完整覆盖。

官方方法对照：[Nest测试/Fastify inject](https://docs.nestjs.com/fundamentals/testing)、
[Swagger createDocument](https://docs.nestjs.com/openapi/introduction)。实际证据见
[核验记录](validation-record.json)；人工非作者评审与业务运行验收分别接续。
