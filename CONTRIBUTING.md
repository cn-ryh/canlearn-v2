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
- REST契约的规划操作标`x-implementation-status: planned`；真实控制器接入后按
  [CL-007准入规则](docs/api/CL-007/drift-and-admission.md)升级为implemented，并补HTTP/Swagger及权限/故障证据。
  现有API测试只对implemented集合做运行时对齐，规划schema/样例验证不能宣称业务功能通过。
- [CL-008事件](contracts/events/README.md)均为planned；修改封闭Schema需按版本策略升级并维护正负夹具。
  事件结构与纯内存状态设计回归随`pnpm verify`执行，不能代替真实SQL/Temporal/费用或删除验证。
- [CL-013a](docs/integration/CL-013a/README.md)提供默认关闭的本地合成路由与真实SQL/Temporal烟测。
  合成OpenAPI独立声明运行范围，生产规划端点不因此升级。CI在`pnpm verify`后执行
  `pnpm smoke:test --skip-build`；禁止将合成停止/重试证据外推到付费调用、GPU或生产权限。
- [CL-013b/c](docs/integration/CL-013bc/README.md)将完整公共响应/错误 Schema、实际事件破坏探针、
  迁移升级/失败回滚接入 CI；`pnpm verify`另检查版本、既有迁移不可变和 schema 漂移。
  `pnpm security:scan`扫描历史/当前文件密钥、全部锁定依赖及镜像；密钥与依赖 HIGH/CRITICAL 阻断。
  镜像现为有期限的报告模式，不能据此声明安全通过；规则、职责和精确人工例外见门禁包。

Pull Request 请使用仓库模板，说明变更、验证命令、风险和回滚方式。高风险改动包括权限、删除、数据迁移、工作流状态机、费用账本和公共内容发布。
