# Event contracts

异步事件 Schema 将存放在此目录。事件必须包含稳定的事件类型、Schema 版本、事件 ID、发生时间、追踪 ID、租户边界和业务对象版本。

在第一个真实跨服务事件出现前不提前设计通用事件总线。Python 工作流通过 Temporal 管理持久化执行，领域事件通过 PostgreSQL Outbox 可靠发布。
