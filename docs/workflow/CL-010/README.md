# CL-010：固定 MinerU 候选与真实 V1 恢复探针

2026-10-14（UTC）· [CL-010a #42](https://github.com/cn-ryh/canlearn-v2/issues/42)、
[CL-010b #43](https://github.com/cn-ryh/canlearn-v2/issues/43)。使用仓库原创 PDF，真人标注延期。
本次实际运行独立 MinerU 4.0.7 的 Flash/CPU 和 Basic/4070 V1 服务；Basic 进一步接入主 API、
PostgreSQL 与 Temporal。26 项集成检查通过，包含 300 页解析、worker 强停恢复、上游索引丢失、
创建成功但响应丢失和取消后的旧回执围栏。许可签审、生产部署与 CL-010c 的真实质量验收继续保留。

## 实现与边界

[`MineruClient`](../../../apps/workflow/src/canlearn_workflow/mineru.py)通过现有 httpx 访问独立服务，
不在主 worker 安装 MinerU/模型或复制上游源码。只允许 HTTPS 或回环 HTTP；拒绝带凭据/查询的基础地址、
跨源上传、重定向与上游提供的敏感请求头。固定输入 SHA、5 MiB 上传、1 MiB JSON、32 MiB 单产物上限，
三类下载核对字节数及 SHA 后原子落盘；失败移除未完成文件。所有 POST 不自动重试。

[`MineruProbeWorkflow`](../../../apps/workflow/src/canlearn_workflow/mineru_probe.py)仅携带 Job/snapshot/epoch/trace，
heartbeat 和 history 不放密钥或文档正文。API 是业务库唯一写者，新迁移
[`0002`](../../../apps/api/drizzle/0002_rich_lake.sql)增加独立 `mineru_probe_jobs` 映射，不改既有迁移或七状态枚举。
请求键、不可变输入快照、CAS revision、上游 file/job ID、回执哈希与停止状态持久化；最多 10 个活动探针 Job。
解析完成只写产物引用和一基物理页索引，不进入公共知识库或教材发布。

两个开关 `CANLEARN_SMOKE_ENABLED`、`CANLEARN_MINERU_PROBE_ENABLED` 必须同时为 true；
否则 API 路由和 worker 注册均不存在，默认启动不读取原创夹具文件。私有路由只在回环监听，
需要随机 `x-smoke-token`，不进入公共 Swagger。固定夹具仅接受 `reading`、`stack`、`volume300`，
对应 [manifest](../../../contracts/fixtures/mineru-probe.v1.json)；没有真实用户上传入口。

| 私有操作（前缀 `/v1/internal/mineru-probe/jobs`） | 控制 |
| --- | --- |
| POST 创建、GET `/:id` | 同键同输入返回原 Job；语义冲突 409；容量满 503 |
| POST `/:id/start`、`/:id/checkpoint` | 快照/epoch 围栏、revision CAS、映射不可覆盖 |
| POST `/:id/finish` | 固定版本/三类格式/唯一有效页索引；同回执无第二次效果，终态冲突 409 |
| POST `/:id/cancel`、`/:id/stopped` | 先原子逻辑取消及 epoch++；停止仅 `logical_acknowledged` 或 `unknown` |
| POST `/:id/resume` | 仅 RUNNING/poll_timeout 且已知上游 ID；新 epoch 查询原任务 |

这是默认关闭的工程探针。工作流由评测脚本在 SQL 提交后显式启动，尚无生产 Outbox 自动派发/启动对账；
未实现生产用户授权、COS 私有产物、正式上传额度或计费 admission。27 条生产业务操作和四类事件保持 planned。
不能将本探针的内部凭据或本地下载路径当作生产权限/存储方案。

## 实际 V1 协议与恢复

运行路径为 POST `/v1/uploads` → PUT 返回的同源 upload_url → POST complete →
POST `/v1/parse/jobs` → GET 原 job → GET `/v1/files/:id` 元数据及 download。
上传缓存命中 completed 时无需重复 PUT。创建显式设置 `tier`、`page_range: 1-N` 和
`markdown`/`middle_json`/`structured_content`，不依赖 CLI 默认页数。
[实际 Basic 响应](basic-response.json)记录 `parser_version: 4.0.7`、`page_range: 1-2`，
[请求形状示例](http-request-example.json)按已运行客户端和该响应重建，不是原始网络抓包；凭据头省略。
`model_used` 为 null，不能由此推断返回了模型 ID。服务另有可选格式字段，Adapter 只取三类目标产物。
真实 Middle JSON 是 `docvortex.middle` / schema 2.0，`pages[].page_idx` 为零基；
Adapter 校验 producer/版本/范围后转换为一基物理索引，未据此计算正文、公式或 bbox 质量分数。

| 故障 | 实际结果与恢复规则 |
| --- | --- |
| 已知任务轮询超时/断联 | 保留 RUNNING、输入快照和上游 ID；显式 resume 用新 epoch 继续 GET，不重建 |
| worker SIGKILL | Temporal heartbeat 超时后重试，已持久映射查询原任务；实际 300 页任务成功 |
| MinerU 进程重启 | 原 V1 job GET 404；平台保留映射并标 FAILED/UPSTREAM_LOST，不声称上游索引持久化 |
| 上游创建成功、ACK 丢失 | 先持久化 create_pending，再 POST；记 FAILED/CREATE_UNKNOWN，同键不重做或发布 |
| 创建期间 worker 失联 | 已有 create_pending 按创建结果未知处理，即使可能尚未 POST，也不自动重建 |
| 取消与迟到回执 | API 原子 CANCELLED/epoch++；实际排队任务收到取消，受控旧 epoch 回执 409，无结果发布 |

取消实测选择了真正 queued 的上游任务，不证明 running GPU 计算已物理停止。
创建 ACK 丢失使用回环故障中继：真实上游 POST 已成功，故意丢回复；上游随后真实 completed，
平台保留未知且没有结果。401 和旧 `/file_parse` 404 另有[实测](http-negative-results.json)。
22 项 MockTransport 单测是有界协议故障覆盖，6 项私有 API HTTP 测试检查凭据/DTO/Swagger边界，
与真实 MinerU 的 26 项检查分开计数。

## 复现与回退

版本、许可、模型与独立依赖环境见[候选核验](version-and-license.md)。先运行 `pnpm verify`；
真实 GPU 探针需要专用评测实例，不能重启已有业务 MinerU。服务启动必须有 `if __name__ == "__main__"`
保护，以避免 DocVortex 多进程重复执行启动脚本。本轮使用 `create_app(upload_dir=..., tier="basic",
no_advanced=True, image_analysis=False, concurrency=1, api_key=...)`，uvicorn 仅监听回环。
Basic 复用固定模型缓存，`MINERU_MODEL_SOURCE=local`、`HF_HUB_OFFLINE=1`，没有外部模型 API/Cloud 请求。
SSH 转发将远端回环暴露为本机回环；主机、账号、密钥与连接配置全部放仓库外 0700/0600 私有文件。
生产南京—宁波 HTTPS/mTLS、来源 ACL 与公网故障尚未验证。

私有 control JSON 由操作者提供三项明确 argv 数组（不执行 shell 字符串）：

```json
{
  "gpu_sample": ["python3", "/private/isolated-control.py", "gpu"],
  "restart_upstream": ["python3", "/private/isolated-control.py", "restart"],
  "provenance": ["python3", "/private/isolated-control.py", "provenance"]
}
```

`gpu_sample` 输出 `used_mib`/`free_mib`/`utilization_percent`；`restart_upstream` 只停止本次隔离 PID 组，
重新启动后确认 health 就绪再返回 JSON；`provenance` 返回 integration-results 中所示版本、源码/模型核验字段。
这些是受信任的操作者控制钩子，不接收网页或上游输入。评测前 free≥4096 MiB；远端另有每秒 guard，
free<768 MiB 时只停止本次进程组。需要保留其他 GPU 服务和用户环境，不能用 pkill/全机重启替代。

```bash
python3 scripts/mineru_probe_run.py \
  --base-url http://127.0.0.1:18091 \
  --api-key-file /private/mineru-api-key \
  --control-spec /private/mineru-control.json \
  --artifact-dir /tmp/canlearn-mineru-probe-artifacts \
  --record /tmp/canlearn-mineru-integration.json --skip-build
```

该入口读取私有 key 文件，复用 CL-013 隔离项目，自动迁移/启动 API 与 worker，并在 finally 停止本地进程/容器；
不修改用户 `.env`，不丢弃卷。隔离上游及 SSH/guard 由其操作者随后停止。不得对已有共享实例运行 restart 测试。
首次本轮启动因缺少 main 保护触发多进程连接失败，修正并真实复验后才记录通过；重启后立即访问尚未就绪的
health 也曾失败，最终控制钩子等待就绪。这些启动问题不计作解析质量结果。

回退先停止新派发，逻辑取消探针并保留映射/未知记录，再停 worker、关闭双开关。保留 0002 表及迁移账本，
旧应用可以忽略新增表；不自动执行 DROP 或回退迁移。仅操作者可清理自己的临时产物和隔离卷。
CREATE_UNKNOWN 需人工核查上游记录后决定是否开新任务，不能修改原输入或将失败任务自动复活。

## 可复核证据与接续

- [26 项真实集成](integration-results.json)、[2 项真实 HTTP 负例](http-negative-results.json)、
  [3 类 Flash/Basic 产物 SHA](output-record.json)，[原始下载示例](outputs/basic/reading.middle_json)。
  Flash 只做原创两页直接 V1 下载，不构成与 Basic 的正式档位质量比较。
- [35 项合成回归](synthetic-regression-results.json)、[7 项真实迁移回归](migration-regression-results.json)。
- [最终密钥/依赖/镜像扫描](security-summary.json)、[2 项受控扫描负例](security-probes.json)。
- [源码/工件绑定](validation-record.json)、[镜像 CRITICAL 初步核对](image-critical-triage.md)。
- GPU guard 461 次采样，整卡峰值 3583 MiB、最低空闲 8294 MiB，未触发停止；
  [清理后](cleanup-results.json)2518 MiB 使用/9359 MiB 空闲，与评测前相同。本次自有服务/转发/guard 已停止。

CL-010a/b 保留 Open 待评审，外部权利签审和部署镜像摘要待补；CL-009 四卡仍缺真实合法样本/独立双标，
CL-010c 仍缺多类别留出集、档位质量/产物兼容与成本结论。真实网络、active GPU 物理停止、生产派发对账、
私有对象存储、正文/公式规范化和长期容量由后续工程与 R0 评审接续，本次不构成真实用户放行。
