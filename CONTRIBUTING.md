# CanLearn 贡献指南

## 仓库边界

CanLearn MVP 使用单一 Git monorepo。`apps/web`、`apps/api`、`apps/workflow` 和基础设施配置位于同一仓库，但分别构建和部署。MinerU 是外部独立微服务，通过版本化 Adapter 接入，不把 MinerU 上游源码复制进本仓库。

仓库边界和拆分条件见 [ADR-0002](docs/architecture/ADR-0002-repository-and-deployment-topology.md)。技术选型见 [ADR-0001](docs/architecture/ADR-0001-technology-stack.md)。

## 本地准备

需要 Node.js 24、pnpm 12、Python 3.12、uv 和 Docker Compose。

```bash
cp .env.example .env
pnpm install --frozen-lockfile
cd apps/workflow && uv sync --frozen && cd ../..
```

## 日常命令

```bash
pnpm check       # 格式、静态检查、类型、测试、契约和 Compose
pnpm build       # 构建 Web 和 API
pnpm verify      # 合并前完整检查
pnpm dev         # 启动 Web、API 和 Python worker
```

提交前会通过 Husky 执行暂存区检查；推送前会执行 `pnpm verify`。提交信息使用 Conventional Commits，例如：

```text
feat(api): create document parse job
fix(workflow): make retry idempotent
docs(repo): record repository boundary
```

## 变更规则

- API、事件 Schema、数据库迁移、环境变量和部署配置必须同步更新对应文档和契约。
- 长耗时操作使用异步任务资源，不能让 HTTP 请求持续等待工作流完成。
- PostgreSQL 保存业务事实；Redis 只保存可重建状态、缓存、限流和短期协调数据。
- 前端只访问 CanLearn API，不直连 PostgreSQL、Redis 或 MinerU。
- Python worker 不绕过主 API 的权限、状态机、配额和发布门禁。
- 不提交密钥、真实用户数据、受限资料、构建产物或本地环境文件。

Pull Request 请使用仓库模板，说明变更、验证命令、风险和回滚方式。高风险改动包括权限、删除、数据迁移、工作流状态机、费用账本和公共内容发布。
