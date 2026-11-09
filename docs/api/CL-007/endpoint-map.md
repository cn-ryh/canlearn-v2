# CL-007b · 规划端点与接纳规则

2026-10-13 · 除健康接口外均未实现；OpenAPI字段为提案，不新增真实服务/数据库状态。
路径参数为不透明UUID，pdf_page_index从1计，印刷页码独立字符串。
变更端点均带会话、CSRF与Idempotency-Key；强条件目标及特殊接纳规则如下。

| 路径/方法 | 成功响应 / 目标条件 | 业务门禁 |
| --- | --- | --- |
| GET /v1/health | 200，已实现 | 无会话，校验service/status固定值；仅进程状态 |
| GET/POST /v1/documents | 200列表 / 201上传 | space_id过滤不授予权；API接收PDF与声明，服务端验证完整性/类型/大小/页数/用途；声明不等于权利签审 |
| GET/DELETE /v1/documents/{documentId} | 200 / 202；DELETE匹配Document ETag | 删除先阻断访问/新准入，再异步清理；同键只回本人可见删除Job |
| POST /v1/documents/{documentId}/versions | 201；匹配Document ETag | 新SourceVersion替代current，旧依赖失效；不覆写旧原件/作答 |
| GET /v1/documents/{documentId}/versions/{versionId} | 200 | 核父子关系，旧版仅获准历史用途，不能用于新生成 |
| GET .../versions/{versionId}/pages | 200分页 | 全请求页状态可见；失败/缺页不能消失或自动补造 |
| GET/PATCH .../pages/{pageIndex} | 200；PATCH匹配PageResult ETag | 文本纠错产生新ContentRevision，base_parse_run_id须同源；旧索引/题待复核 |
| POST /v1/parse-jobs | 202 | 明确all或显式页集合，拒越界页；approved parse_profile_id不允许任意URL/外部解析降级 |
| GET /v1/jobs、GET /v1/jobs/{jobId} | 200 | 列表归当前账户；结果引用当前授权/版本，不返回原始workflow载荷 |
| POST /v1/jobs/{jobId}/cancel | 202，已终态可200；无强制If-Match | 原子停新步骤准入，晚到结果不复活；上游在途费用仍跟踪 |
| POST /v1/jobs/{jobId}/retries | 202新Job；匹配Job ETag | 只有明确可重试失败，输入快照/来源仍有效、预算重准入；未知上游结果409禁止重跑 |
| POST /v1/exercise-jobs | 202 | current来源/修订同授权域、用途交集、显式题型/count；供应商未准入拒真实资料，practice不自动获得诊断资格 |
| POST /v1/explanation-jobs | 202 | 最小有效证据与topic，证据不足明确失败/待处理，不生成伪引用 |
| GET /v1/questions/{questionVersionId}、GET /v1/explanations/{explanationVersionId} | 200 | 必须为获准可读版本，candidate仅可审阅，practice/diagnostic用途分别核；答案/量规ID不是正文公开资格 |
| POST /v1/attempts | 202评分Job，accepted_resource_id为Attempt ID | 记录原作答，服务器锁题/答案/量规版本、选项与题型；不接受客户端分数/技能证据/曝光标签作为事实 |
| GET /v1/attempts/{attemptId} | 200 | recorded/grading与graded区分；原作答版本不覆写，复评分产生新版本；反馈与引用再核用途 |
| POST /v1/plan-patches | 202提案Job | 载荷base_plan/capacity/goal/evidence快照不一致409；提案不改变已确认计划或容量事实 |
| GET /v1/plan-patches/{patchId}、GET /v1/plans/{planId} | 200 | 显示差异/冲突及当前版本；总容量按occurrence跨目标只扣一次 |
| POST /v1/plans/{planId}/confirmations | 201新PlanVersion；匹配当前Plan ETag | patch归同账户/计划、全部基版本仍匹配、容量/来源/完成事实在同一事务复查 |
| POST /v1/plans/{planId}/reversions | 201新PlanVersion；匹配当前Plan ETag | 只反向调整仍允许的未来安排，保留已完成/作答/后续证据；旧来源不可回滚成可用 |
| POST /v1/export-jobs | 202 | 授权资源版本快照、用途逐项核，初期仅document/attempt/plan；不导出他人、候选未发布或删除内容 |
| GET /v1/exports/{exportId}/content | 200/206；非法范围416 | 当前Job结果接纳与读取/来源授权；API流式读取，私有no-store，单Range/Content-Range |

请求`VersionRef`包含resource_type/resource_id/version_id，仅是引用；API确认真实类型、父子/版本和归属。
Job kind及文档/页/练习状态枚举都是契约词，不把它们写成现有DB表/状态迁移已实施。

## schema之外的硬规则

UUID/schema校验不能证明空间归属。多来源必须核授权/用途交集、删除/撤回与修订；
bbox还要核x1<x2、y1<y2及所指页/区域，SHA由服务端校验，parse_profile_id锁获准版本。
单选题要求2–10个不重复可见选项，其他题型options为空；回答类型/choice_id必须属于锁定题版本。
这些关系由业务门禁验证，样例/schema通过不代替DB权限或逻辑校验。
Question/Explanation的candidate可读只表示获准审阅，不能提交学习诊断或公开发布。

学习答案曝光由服务端读/展示记录核验，客户端不能伪造“未看答案”。答案查看的专门业务契约、
鉴权原生注册/邮件回调、目标/学科包CRUD及公共编辑/发布端点由各功能卡补齐，
本稿先覆盖路线图指定R1A/R1B关键长任务、版本/作答/确认与删除接口，不宣称完整MVP API。

分页20/100、生成单次count上限50、选项上限10与数组/文本限制为初始契约限额提案，
不是实测并发/内容质量保证；A结合CL-013容量与预算定运行限额，运行限额可更小但不能悄悄放大契约。
首轮上传页/大小限制与处理期限尚未冻结，具体配置须在真实上传前确定；不把300页性能夹具变成用户额度。
计划容量、费用Decimal、JSON最小载荷与迁移参考[CL-006](../../architecture/CL-006/README.md)。

## 示例与负例

[contract-examples.json](contract-examples.json)只保存原创合成引用/字段，不含真实原件或凭据。
正例覆盖显式全页解析、必要来源练习、记录作答、计划提案/确认与错误回执；
负例包含未知字段/伪造分数、空页/重复页、不合法题型/count与无版本输入。
每个验证结果分开标schema_only，不能将合成DTO校验写成业务访问控制/任务实际运行通过。
