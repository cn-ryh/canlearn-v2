# CanLearn

CanLearn 是面向自主学习者的资料驱动学习平台。本仓库采用单一 Git monorepo，包含可独立部署的 Web、主业务 API、Python 工作流和基础设施配置。

## 技术栈

- Web：Next.js + React + TypeScript
- API：Node.js + NestJS + Fastify + TypeScript
- 数据访问：Drizzle ORM + PostgreSQL
- 工作流：Python + Temporal Python SDK
- 缓存与协调：Redis
- 文档解析：独立 MinerU 微服务，通过 Adapter 接入
- 接口：RESTful API + OpenAPI；异步流程使用版本化事件 Schema

详细决策见 [ADR-0001](docs/architecture/ADR-0001-technology-stack.md) 和 [ADR-0002](docs/architecture/ADR-0002-repository-and-deployment-topology.md)。研发、提交、测试和合并规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

R0当前设计与证据入口：[CL-005选型交接](docs/architecture/CL-005/decision-closeout.md)、
[CL-006数据模型](docs/architecture/CL-006/README.md)、[CL-009样本准备](docs/benchmarks/CL-009/README.md)。
设计/隔离实测与真实业务实现、外部签审及部署验收分别记录。
REST契约与真实健康接口门禁见[CL-007](docs/api/CL-007/README.md)；OpenAPI中的其余业务操作均为规划。
Job七状态、事件/Outbox提案与34个可执行故障设计场景见[CL-008](docs/workflow/CL-008/README.md)；
事件Schema和设计回归接入现有门禁。
[CL-013a 合成 Job](docs/integration/CL-013a/README.md)已补默认关闭的本地 Web/API/PostgreSQL/Temporal 链路、
取消/回执/SQL 回滚与重启验证；生产资源授权、真实解析/模型和完整删除恢复仍待后续验收。

## 仓库结构

```text
apps/
  api/          Node.js/TypeScript 主业务后端
  web/          Next.js Web
  workflow/     Python/Temporal 工作流与 AI 工作者
contracts/
  events/       跨服务事件契约
  openapi/      对外 RESTful API 契约
docs/           产品、协作与架构决策文档
infra/          本地及部署基础设施配置
packages/
  config/       跨 TypeScript 项目的共享配置
compose.yaml    PostgreSQL、Redis、Temporal 本地环境
```

## 本地启动

需要 Node.js 24、pnpm 12、Python 3.12、uv 和 Docker Compose。

```bash
cp .env.example .env
pnpm install --frozen-lockfile
cd apps/workflow && uv sync --frozen && cd ../..
docker compose up -d postgres redis temporal temporal-ui
pnpm --filter @canlearn/api db:migrate
pnpm dev
```

默认地址：

- Web：<http://localhost:3000>
- API：<http://localhost:3001/v1/health>
- OpenAPI UI：<http://localhost:3001/docs>
- Temporal UI：<http://localhost:8080>

MinerU 不随默认 Compose 启动，因为其镜像、模型、解析档位和 GPU 配置需要按目标环境固定。通过 `MINERU_BASE_URL` 接入经过验收的实例。

Docker Hub 镜像默认从 `jjs7iczbx3i38wpthb.xuanyuan.run` 拉取，可通过
`CANLEARN_DOCKERHUB_REGISTRY` 覆盖前缀（直接访问上游时设为 `docker.io`）。
官方基础镜像保留 `library/`，例如 `/library/postgres:17-alpine`；其他镜像保留其命名空间。
后续 GHCR 镜像使用 `jjs7iczbx3i38wpthb-ghcr.xuanyuan.run/<owner>/<image>:<tag>`。
当前 Compose 没有 GHCR 镜像；镜像入口设置不代表对应标签已拉取或部署验证。

## 质量检查

```bash
pnpm check   # 格式、静态检查、类型、单元测试、契约和 Compose
pnpm build   # 所有可构建工作区
pnpm verify  # 完整合并前门禁：check + build
pnpm smoke:test --skip-build # 真实隔离基础设施的合成 Job 集成验证
```

TypeScript/JavaScript 使用 Biome，不重复引入 ESLint；Python 使用 Ruff 与 mypy。安装依赖后，Husky 会自动启用暂存区检查、提交信息检查和推送前完整验证。

MVP 不拆分多个 Git 仓库，也不做跨地域主动-主动部署。各应用保持独立部署边界；生产数据库优先采用同地域多可用区托管能力。
