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

## 质量检查

```bash
pnpm check   # 格式、静态检查、类型、单元测试、契约和 Compose
pnpm build   # 所有可构建工作区
pnpm verify  # 完整合并前门禁：check + build
```

TypeScript/JavaScript 使用 Biome，不重复引入 ESLint；Python 使用 Ruff 与 mypy。安装依赖后，Husky 会自动启用暂存区检查、提交信息检查和推送前完整验证。

MVP 不拆分多个 Git 仓库，也不做跨地域主动-主动部署。各应用保持独立部署边界；生产数据库优先采用同地域多可用区托管能力。
