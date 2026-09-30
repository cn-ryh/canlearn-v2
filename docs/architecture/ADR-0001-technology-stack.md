# ADR-0001：CanLearn 基础技术栈

- 状态：已接受
- 决策日期：2026-09-30
- 适用范围：CanLearn MVP 及首个稳定候选版本

## 背景

CanLearn 已完成产品与逻辑架构规划，但此前尚未明确应用框架、主要运行时和数据基础设施。团队需要统一项目骨架、职责边界和接口形式，避免前端、主后端、AI 工作流与文档解析各自采用不兼容的实现。

## 决策

采用以下基础技术栈：

| 层次 | 技术 | 定位 |
| --- | --- | --- |
| Web 前端 | Next.js | 用户界面、服务端渲染与 Web 交互 |
| 主业务后端 | Node.js + TypeScript | 模块化单体、业务规则、权限、数据写入与 RESTful API |
| 工作流与 AI 工作者 | Python | 长任务编排、生成、校验、模型与 Python AI 生态集成 |
| 文档解析 | MinerU 微服务 | PDF 解析与结构化产物生成，通过 V1 HTTP API 接入 |
| 主数据库 | PostgreSQL | 权威业务数据、关系约束、事务、版本和审计 |
| 高速数据层 | Redis | 缓存、限流、短期协调、分布式锁及队列/任务通知 |
| API 风格 | RESTful API + OpenAPI | 前端与主后端以及同步服务调用的版本化契约 |

首轮项目初始化进一步确定：主后端采用 NestJS + Fastify，数据访问采用 Drizzle ORM，Python 持久化工作流采用 Temporal Python SDK，Node.js 工作区采用 pnpm，Python 依赖采用 uv。

## 边界与约束

1. Next.js 只访问 CanLearn 主后端 API，不直连 MinerU、PostgreSQL 或 Redis。
2. Node.js/TypeScript 主后端是业务规则和外部 API 的入口，负责授权、校验和事务边界。
3. Python 层执行长任务和 AI 工作流，但不得绕过主后端定义的权限、状态机、质量门禁和发布规则。
4. MinerU 作为独立微服务，由版本化 Adapter 隔离其接口和结果格式变化。
5. PostgreSQL 是业务事实的权威数据源。Redis 中的数据必须允许过期或重建，不得成为不可恢复业务事实的唯一副本。
6. 长耗时 REST 操作采用异步任务资源：提交接口返回 `202 Accepted` 和任务标识，客户端通过任务接口查询状态或接收后续通知。
7. 跨服务事件仍需定义事件 Schema；RESTful API 的选择不取消异步事件、幂等、重试和补偿要求。
8. 首版保持 Node.js 模块化单体，Python 工作者和 MinerU 独立部署；只有出现明确的负载、权限或发布边界时才继续拆分。

## 尚待决定

以下事项不属于本 ADR 的已定结论，需通过后续 ADR 或概念验证选择：

- Next.js、Node.js、TypeScript、Python、PostgreSQL、Redis 和 MinerU 的固定版本；
- 身份认证和授权实现；
- Redis 是否需要独立队列库；Temporal 是持久化工作流基线，Redis 不替代它；
- 对象存储、检索与向量索引实现；
- 身份认证方案、部署平台和可观测性组件；
- Node.js 与 Python 之间除 REST 外是否引入消息协议。

## 影响

- 团队可以分别建立 Web、主后端、工作流与解析服务骨架，并以 OpenAPI 和事件 Schema 并行开发。
- 系统跨越 TypeScript 与 Python 两种运行时，需要共享契约测试、统一追踪标识和清晰的数据所有权。
- PostgreSQL 与 Redis 的职责必须严格区分，以免缓存或队列故障造成业务事实丢失。
- 该决策确定技术方向，不代表组件已经实现、部署或通过性能与安全验收。
