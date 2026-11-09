# 项目记忆入口

开始处理本仓库任务时，先阅读 `docs/PROJECT_MEMORY.md`，再根据任务阅读
`README.md`、`CONTRIBUTING.md`、相关 ADR 和产品/路线图文档。

- 项目记忆是带日期的状态快照；代码和实际验证结果优先，规划不代表实现。
- 完成影响架构、功能进度或验证状态的工作后，同步更新项目记忆，并注明日期和证据。
- 保留用户已有的未提交修改；不要自动提交或推送。
- 遵循现有 monorepo 和服务边界，不重复初始化工程。
- 不将密钥、真实用户数据、受限资料或本地环境文件写入记忆。
- Docker Hub 镜像使用 `jjs7iczbx3i38wpthb.xuanyuan.run`，GHCR 使用
  `jjs7iczbx3i38wpthb-ghcr.xuanyuan.run`；保留原命名空间、固定标签/摘要，不自动改全局 Docker daemon 配置。
