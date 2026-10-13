# CL-007a · API通用约定

2026-10-13 · 规划契约；下列业务规则尚未在运行时实现。健康响应仍为独立简单对象。

## 身份与资源权限

使用ADR-0003确认的服务端会话，邮箱未验证不开放资料/模型任务。浏览器经同源受控API，
规划Cookie为Secure/HttpOnly、Path=/的__Host前缀命名，具体Better Auth配置在接入时绑定。
变更请求校验可信Origin和X-CSRF-Token；CORS不是授权或CSRF替代。
私有响应Cache-Control:no-store，日志/错误/history不保存Cookie、令牌、原文、完整作答或模型输出。

API从当前会话与DB解析账户/空间/资源权限，客户端space_id只作过滤或目标选择，不授予访问。
文档-版本-页、题-答案-量规、计划-提案均核父子关系、用途与当前撤销/删除状态。
相同名称/哈希不跨私有空间合并；公共发布与候选编辑域分开。公开版本不自动授予公开再分发或模型外发。
内部worker使用单独受限服务授权，不能伪装浏览器会话调用公共变更端点或直接写业务DB。

身份先检查，再判资源；无会话401。未验证邮箱403 EMAIL_UNVERIFIED。
外人私有资源与不存在资源均404 NOT_FOUND，不泄露拥有者、版本、哈希或删除状态。
403只用于已可见资源上的操作/用途禁止；410只向仍获准读取该最小墓碑的原请求人提供。
列表过滤和游标重放同样查当前权威授权，不能把全库结果交前端过滤。

## 错误与重试

业务错误统一`{error:{code,message,request_id,retryable,field_errors?}}`，只保存预定义简短消息与
JSON Pointer/错误类别，禁止回显坏值、错误正文、上游地址/请求键/密钥。
Job.failure用同一最小结构。request_id由服务端产生或验证受控格式，不直接信任/反射任意外部字符串。
本轮没有把这个格式扩展到Nest默认404或健康接口的运行时错误，规划路由仍不存在。

| HTTP / code | 客户端动作与是否可自动重试 |
| --- | --- |
| 400 INVALID_INPUT / 422 INVALID_INPUT | 修改结构/语义输入，不原样重试；文件类型/页范围/题型与实际资源另核 |
| 401 UNAUTHENTICATED | 重新登录后重查权限；不自动开启付费任务 |
| 403 EMAIL_UNVERIFIED/FORBIDDEN/PROVIDER_NOT_ADMITTED | 完成验证/用途准入；不改供应商或放宽权限 |
| 404 NOT_FOUND / 410 RESOURCE_GONE | 停止相应访问/任务，不以换空间/缓存绕过 |
| 409 IDEMPOTENCY_KEY_REUSED | 同键载荷/条件不同，拒绝；用户明确新操作后用新键 |
| 409 IDEMPOTENCY_IN_PROGRESS | 同键有已准入操作，按既有Job/status_url查询；不换键重复创建 |
| 409 VERSION_CONFLICT/QUALITY_NOT_READY/INSUFFICIENT_EVIDENCE | 刷新来源/计划或等待复核；不盲修复/付费重试 |
| 409 BUDGET_EXHAUSTED/QUOTA_EXCEEDED | 等配额/用户预算决策；不是网络重试 |
| 409 JOB_NOT_RETRYABLE/UPSTREAM_OUTCOME_UNKNOWN | 禁止自动重跑；未知回执保留待对账，取消不抹费用 |
| 428 PRECONDITION_REQUIRED / 412 PRECONDITION_FAILED | 先读取ETag，或刷新差异后再明确提交 |
| 429 QUOTA_EXCEEDED / 503 TEMPORARILY_UNAVAILABLE | 仅在retryable=true时按Retry-After秒数有界重试同键；已受理任务先查询 |
| 416 RANGE_NOT_SATISFIABLE | 读取当前授权对象信息后修正单范围，不绕过删除状态 |

同一code的retryable依具体原因决定，如永久配额与短期限流不同；响应须包含明确布尔值。
前端不得仅凭状态码自动重发变更。上游200、model.completed或worker完成不等于业务接纳。

## 幂等与版本条件

变更端点要求16–128字符随机Idempotency-Key，作用域为账户＋operationId＋已授权资源域。
规范化载荷摘要包括源版本/页集合、用途、If-Match等有业务意义条件；file内容用服务端校验SHA绑定，
不存原始键到普通日志，也不通过客户端哈希授予所有权。输入规范化算法版本随幂等记录保存。
同键同载荷已受理返回同一Job/资源及Idempotency-Replayed:true，不重复预留/外发；
同键不同载荷/条件409。并发首次准入必须以DB唯一键/事务协调，Redis锁不替代。

重放之前仍检查当前身份/资源用途/删除状态；不能因旧响应缓存存在把已删内容返回。
删除已受理后的同键可返回本人可见最小删除Job，不返回原文/旧文件下载资格。
幂等记录/请求键有效期由Q02/CL-008结合在途/未知费用和删除对账决定，未默认24小时或承诺端到端恰好一次。
未知上游调用不因记录到期就获准新键重跑；用户再次点击“重试”也要重查当前来源及对账状态。

更新版本/纠错/删除/重试/计划确认与撤销使用目标资源的强ETag与If-Match。
本项目规划只接受读取到的单个强标签，弱标签或通配符不能作为覆盖冲突的手段。
缺失条件返回428，标签不匹配返回412；载荷内的多来源/容量/证据快照失效用409。
检查与发布/预算写入共事务锁/修订条件，避免检查后删除仍发布。
取消不要求客户端新ETag，以避免陈旧显示阻碍终止；API仍在权威Job锁内执行取消/准入代更新。
同键重放可按已受理记录返回结果，但必须先复查权限/撤回/删除，不能再次执行旧If-Match对应的写入。

HTTP条件与受理语义对照：[RFC9110 If-Match](https://httpwg.org/specs/rfc9110.html#field.if-match)、
[202](https://httpwg.org/specs/rfc9110.html#status.202)与
[RFC6585的428/429](https://www.rfc-editor.org/rfc/rfc6585.html)。具体项目策略仍为本稿提案。

## 异步、部分成功与分页

解析/生成/评分/计划提案/导出/删除返回202，包含JobAccepted、Location和status_url；
202仅表示受理，最终状态通过本人有权查看的GET /v1/jobs/{jobId}查询。
不把HTTP200流式片段直接发布给学习路径，不在Task/history/错误保存原文或带签名访问链接。
Job保持现有七状态；WAITING_REVIEW/PARTIAL_READY表示复核/子范围，不等于全部成功。
usable_result_refs只列已接纳且当前仍有权可读的版本；FAILED/CANCELLED/删源后晚到结果拒收。
页覆盖分母为所有请求页，success/blank/failed/missing分开记录；具体状态转换由CL-008定稿。
Job接受取消与已完成任务竞态在该稿只写接纳约束，不声称上游取消/退款或恰好一次已验证。

列表用limit默认20、上限100和不透明cursor；游标绑定账户、权限域、过滤/排序/快照，
跨账户/过滤重放拒绝，过期刷新列表。权限撤销/删源仍逐项复查，不能靠旧游标读到旧对象。
导出经API当前授权读取，支持单个Range并在续读/在途策略中核删除；不下发永久COS密钥/任意URL。
下载残余、额度/期限与真实存储验证仍按Q02/Q07/CL-013接续。
