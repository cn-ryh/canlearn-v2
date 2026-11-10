# CL-011b · 事件字典与隐私测试

状态：**分析事件设计稿；生产接入、自动化隐私测试、非作者审核与用户验收未完成** · 版本：1.0 · 2026-11-10

来源：CL-011b（GitHub #46）、[CL-011a 指标定义](activation-and-vlu-definitions.md)、[CL-004a 数据目录与生命周期](../../security/CL-004/data-inventory-and-lifecycle.md)、[CL-008b 事件与 Outbox](../../workflow/CL-008/events-and-outbox.md)。本文定义供实现评审的最小分析事件，不新增业务状态，也不把现有 `planned` 契约声明为已上线。除明确复用的取消、删除事件外，下列 `.v1` 名称均为**分析事件提案**，实现时须补封闭 Schema、正负夹具和消费者测试。

## 1. 共同口径

### 1.1 包络、时间与伪匿名标识

所有事件使用服务端 UTC/Z 时间，窗口沿用 CL-011a 的 `[start, end)`。公共包络只允许：

| 字段 | 必要性与规则 |
| --- | --- |
| `event_id` | 必填，随机 UUID；标识一次发布，重投保持不变，不能单独承担业务去重 |
| `event_type` / `schema_version` | 必填；类型名携带 `.v1`，版本为 `1`；封闭 Schema 不允许额外字段 |
| `occurred_at` | 必填，权威业务事实发生时间；不是客户端上报、看板刷新或重投时间 |
| `operation_key` | 必填，服务端在首次业务操作时生成的稳定 UUID；重试、ACK 丢失和双发沿用原值 |
| `aggregate_type` / `aggregate_id` / `aggregate_revision` | 必填；受控内部引用及单调修订，不使用文件名、对象路径或可解码内容 |
| `space_ref` | 必填，空间伪匿名引用；跨空间引用在消费前拒绝，不授权读取资源 |
| `subject_ref` | 用户学习事件必填；仅分析用途的稳定随机伪匿名 ID，与登录账户映射分库存放。系统-only 操作可为空，但派生用户指标时必须能回到一个且仅一个主体 |
| `subject_group` | 用户学习事件必填，取首次合格入口锁定的 `408`、`CET`、`其他`、`未知`；系统-only 操作可为空 |
| `actor_type` | 必填，仅 `user`、`system`、`reviewer`；不放姓名、邮箱、IP、设备指纹或会话 ID |
| `trace_id` | 必填，32 位小写十六进制；仅用于关联最小技术事件，不携带用户输入 |
| `payload` | 必填，仅第 2 节逐事件列出的字段；业务正文通过受限 API 按权限另查 |

`subject_ref` 不是邮箱、手机号、用户名或其普通哈希，也不能充当认证、授权或下载凭据。`subject_group` 仅把 CL-011a 的入口分组映射到分析载荷，不要求核心实体硬编码学科枚举。账户合并时保留受控映射并从合法事实重算；不得生成第二个全局首个 VLU。分析映射与分析事件分离访问，导出、日志和错误报告默认不包含映射。

**复用 CL-008 的例外：** `job.cancel_requested.v1`、`job.finalized.v1`、`resource.invalidated.v1` 保持既有封闭包络，不擅自增加字段。其 `space_id` 对应本文 `space_ref`，`operation_id` 对应 `operation_key`；没有 `operation_id` 的终态/失效事件以 `(event_type, aggregate_id, aggregate_revision, payload 的稳定业务标识)` 去重。`actor_ref` 经服务端受控映射为 `subject_ref` 和 `subject_group` 后才能进入用户级指标，系统主体不得计入；不得把 `actor_type` 等额外字段写入既有 v1。若未来统一包络，须先部署兼容消费者再升级版本。

### 1.2 去重、版本和重算

1. **技术去重**：消费唯一键为 `(consumer_id, event_id)`；同一业务操作换 `event_id` 重发时，再以 `(event_type, operation_key)` 拒绝第二次效果。同键异载荷、版本不识别或空间冲突进入隔离，不猜测合并。
2. **业务去重**：技术去重不等于 VLU 去重。VLU 唯一键固定为 `subject_ref + task_ref + task_version_ref + assessment_ref + assessment_version_ref`，且同一任务最多一个 VLU；还须比较权威库中的规范化检验内容，阻止换 ID、换皮或拆任务刷数。
3. **版本**：新增或改变字段即升级 `.v2` 和 `schema_version=2`，消费者先兼容双版本；业务操作的 `operation_key` 不变。未知版本隔离，禁止运行时联网取 Schema。
4. **归属**：VLU 只使用退出检验形成可信结果的 `validated_at`；上传、解析、生成、任务完成和恢复打开页面均不代替 VLU。
5. **乱序/迟到**：以当前权威权限、内容质量、来源有效性和删除水位复核。迟到合法事件进入下一次全量或受影响分区重算；不覆盖已发布快照，另发带输入水位和原因的新快照。
6. **取消/删除**：先应用权威阻断和删除水位，再处理晚到事件。晚到完成不得复活内容、重开任务或增加 VLU；清理回执未知时不能写成全链路完成。

### 1.3 最小化与留存原则

- 禁止原文、题干/答案/讲解全文、完整或节选对话、模型完整输入输出、原始作答、文件内容、对象键、完整上游错误及可定位个人的自由文本。
- 禁止密码、Cookie、访问/刷新令牌、API 密钥、签名或临时下载 URL。导出事件只记导出 ID、快照水位、状态和到期时间；下载能力由 API 临时重新授权。
- `source_version_refs`、`skill_refs`、`source_block_refs` 等数组只允许有界内部引用，单个事件最多 32 项；`source_block_ref` 必须指向来源版本内的区块/引用记录，不携带正文、坐标全文或对象路径。更多依赖由权威依赖表分批提供，不把整份 manifest 塞入事件。
- 计数、状态、质量等级和受控错误码使用枚举或整数。`failure_code` 只取登记值，不放供应商响应、SQL、堆栈或路径。
- 明细事件仅保留完成排障、申诉和指标重算所需的最短期限；具体期限、访问者和删除方式由 CL-004 的 Q02/Q05/Q09 批准，未批准前不得承诺无限期留存。Temporal/Outbox 副本同受其窗口约束。
- 删除时同步清理或去关联分析明细及外部分析副本，按删除台账重放恢复；只有登记了依据、字段和期限的最小审计例外可保留。Q04 未定前，不擅自永久保留个人学习事实。
- 长期报表只保留不可回识别个人的聚合；小样本抑制阈值和重识别评审须在发布前登记。删除后的新快照不得继续暴露已删主体的可识别行。

## 2. 事件字典

下表“必要字段”均位于 `payload`，公共包络不重复列出。`outcome` 只表示该业务步骤结果，不直接表示学习有效。所有引用均沿用 `*_ref` 伪匿名内部 ID，版本引用不可省略为 `current`。

### 2.1 上传、解析与内容生成

| 事件名 | 触发事实 | 必要字段 | 去重及指标边界 |
| --- | --- | --- | --- |
| `source.uploaded.v1` | API 完成准入并登记一个来源版本 | `source_ref`、`source_version_ref`、`rights_revision`、`source_kind` | 键为该来源版本的 `operation_key`；上传本身不是合格入口 |
| `parse.started.v1` | API 接纳解析 Job 输入快照 | `job_ref`、`parse_run_ref`、`source_version_ref`、`parser_config_ref`、`requested_page_count` | 同一 run 重试沿用操作键；不进入 WAL/VLU |
| `parse.completed.v1` | 解析终态及可用章节经 API 接纳 | `job_ref`、`parse_run_ref`、`source_version_ref`、`outcome(succeeded/partial_ready/failed)`、`accepted_page_count`、`usable_section_count`、`failure_code(nullable)` | 同一 run 只接纳一个终态；仅私有来源首次准入且 `usable_section_count>0` 时，以本事件时间形成候选 `entry_at`，仍须复核来源有效 |
| `generation.started.v1` | API 接纳生成 Job 及锁定依赖 | `job_ref`、`generation_run_ref`、`source_version_refs`、`generation_config_ref` | 同一 run 去重；模型或 worker 不能自行发布此事实 |
| `generation.completed.v1` | 生成候选及校验结论经 API 接纳 | `job_ref`、`generation_run_ref`、`content_revision_ref`、`outcome(succeeded/failed)`、`candidate_count`、`quality_state`、`failure_code(nullable)` | 候选数不等于 VLU；草稿、失败或仅基础校验不能冒充正式诊断内容 |

### 2.2 任务、退出检验与恢复

| 事件名 | 触发事实 | 必要字段 | 去重及指标边界 |
| --- | --- | --- | --- |
| `task.started.v1` | 用户主动开始具体任务版本 | `task_ref`、`task_version_ref`、`entry_kind(private_source/public_unit)`、`source_version_refs` | 业务键为任务版本首次主动开始；独立 `subject_ref` 进入该 UTC 周 WAL。公共单元首次实际进入可形成候选 `entry_at`；自动打开不算 |
| `task.completed.v1` | 用户提交要求的学习产出，API 记录任务完成 | `task_ref`、`task_version_ref`、`completion_kind(submitted/recalled)` | 每任务版本一个首次完成；完成仍不等于 VLU，必须有合格退出检验 |
| `task.interrupted.v1` | 已有至少一个 VLU 的用户暂停/异常离开未完成任务 | `interruption_ref`、`task_ref`、`task_version_ref`、`interrupted_at`、`reason_code(user_pause/session_exit/inactive_30m)` | 同任务 24 小时内重复离线合并，取最早时间；纯解析/生成等待、未开始或已完成不算 |
| `task.resumed.v1` | 用户在中断后重新进入原任务 | `interruption_ref`、`task_ref`、`task_version_ref` | 每中断只保留首次恢复打开；只作辅助漏斗，72 小时主指标必须由新 VLU 判定 |
| `exit_assessment.submitted.v1` | 用户在看答案前提交真实作答/回忆 | `attempt_ref`、`task_ref`、`task_version_ref`、`assessment_ref`、`assessment_version_ref`、`response_ref`、`submitted_at`、`hint_level`、`answer_exposed` | `attempt_ref` 去重；`response_ref` 只供受限复核，不含作答内容。先曝光答案的记录不得成为有效 VLU |
| `exit_assessment.validated.v1` | 评分、来源/技能及质量门禁复核完成 | `attempt_ref`、`task_ref`、`task_version_ref`、`assessment_ref`、`assessment_version_ref`、`grade_version_ref`、`validated_at`、`result_code(correct/partial/incorrect/unjudgeable)`、`quality_state`、`content_state`、`source_version_refs`、`source_block_refs`、`skill_refs`、`eligibility(valid/ineligible/indeterminate)`、`exclusion_code(nullable)`、`vlu_ref(nullable)`、`origin_vlu_ref(nullable)` | 同一 `attempt_ref + grade_version_ref` 去重；只有 `valid` 且权威复核通过才按 VLU 业务键计入。答错/部分正确可有效；`origin_vlu_ref` 仅用于同技能不同规范化内容的新题延迟检验 |

VLU 的 `vlu_ref` 是计算结果引用，不是可信性的替代证明。消费者必须从保留的作答、判分、提示/曝光、来源定位、技能映射和内容状态重算 `eligibility`；缺任一必要证据即标 `indeterminate` 或 `ineligible`，披露数量，不能默认成功。

### 2.3 计划提案、确认与撤销

| 事件名 | 触发事实 | 必要字段 | 去重及指标边界 |
| --- | --- | --- | --- |
| `plan.proposed.v1` | API 接纳一个计划提案版本 | `plan_ref`、`plan_version_ref`、`base_plan_version_ref(nullable)`、`evidence_revision`、`task_occurrence_count` | 每提案版本去重；模型只提建议，不直接改计划，不计 WAL/VLU |
| `plan.confirmed.v1` | 用户确认指定提案版本 | `plan_ref`、`plan_version_ref`、`base_plan_version_ref` | 键为计划版本首次确认；基版本冲突须拒绝而非覆盖 |
| `plan.reverted.v1` | 用户撤销提案或回到指定版本 | `plan_ref`、`plan_version_ref`、`target_plan_version_ref(nullable)`、`reason_code` | 每次撤销操作去重；只改变未来安排，不删除既有作答和 VLU |
| `plan.cancelled.v1` | 用户取消尚未确认的计划提案 | `plan_ref`、`plan_version_ref`、`reason_code` | 每提案版本一次；与 Job 取消分开，不暗示上游计算已停止 |

### 2.4 取消、导出与删除

| 事件名 | 触发事实 | 必要字段 | 去重及指标边界 |
| --- | --- | --- | --- |
| **`job.cancel_requested.v1`（复用 CL-008）** | API 记录取消并提升 Job epoch | `job_id`、`operation_id`、`admission_epoch`、`reason_code`、`termination_state` | `operation_id` 即本文 `operation_key` 的既有表示；重复请求不再提升 epoch，也不等同物理停止 |
| **`job.finalized.v1`（复用 CL-008）** | Job 到达唯一终态 | 沿用既有封闭 Schema；取消终态与 `SUCCEEDED/FAILED` 分层统计 | 只反映 Job；不能据此恢复已删除资源或新增学习指标 |
| `export.requested.v1` | API 授权并接纳本人导出请求 | `export_ref`、`snapshot_watermark`、`export_kind`、`expires_at` | 每导出请求去重；不含包路径、URL 或文件清单正文 |
| `export.completed.v1` | 导出包可交付或失败/过期 | `export_ref`、`snapshot_watermark`、`outcome(ready/failed/expired/cancelled)`、`failure_code(nullable)` | 每导出仅一个当前终态；删除或撤权后须重查，旧快照不能解除阻断 |
| **`resource.invalidated.v1`（复用 CL-008）** | 更正、撤回、删除或撤权被权威记录 | 沿用既有封闭 Schema；删除必须有 `deletion_case_id` 和正整数 `deletion_watermark` | 以删除案例、资源修订及水位去重；`corrected` 不自动抹掉历史作答，`deleted` 触发指标重算 |
| `deletion.reconciled.v1` | 一个删除案例的副本核对状态变化 | `deletion_case_id`、`deletion_watermark`、`state(in_progress/completed/blocked)`、`confirmed_copy_count`、`pending_copy_count`、`unknown_copy_count` | 同案例同水位取最新权威状态；只有待处理及未知均为 0 才可称所列范围完成，不包含任何副本位置或内容 |

## 3. 合成事件样例与业务去重

以下 ID 均为易读合成别名，不是生产数据；实现夹具须替换为符合 Schema 的 UUID。每条样例默认带第 1.1 节公共包络，表内只展示辨识语义所需字段。`S-U1` 是伪匿名主体，不是账户名。

### 3.1 重复同一作答

| 顺序 | 事件及最小差异 | 判定 |
| --- | --- | --- |
| 1 | `task.started.v1`：`subject_ref=S-U1`、`task_ref=T1`、`task_version_ref=TV1` | U1 进入所在周 WAL 一次 |
| 2 | `exit_assessment.validated.v1` 的两次技术重投：相同 `event_id=E10`、`operation_key=OP10`、`attempt_ref=AT1` | 只消费一次 |
| 3 | 同一操作换 `event_id=E11`，但 `operation_key=OP10` 不变 | 仍只消费一次；若载荷不同则隔离 |
| 4 | 用户再次提交同一题：`event_id=E12`、`operation_key=OP12`、`attempt_ref=AT2`，其余仍为 `T1/TV1/A1/AV1` | 可保存第二次作答事实，但 VLU 业务键相同，新增 VLU 为 0 |
| 5 | 首次有效检验：`assessment_ref=A1`、`assessment_version_ref=AV1`、`validated_at=2026-01-03T10:00:00Z`、`eligibility=valid`、`vlu_ref=V1` | 首次形成 V1；后续重放、复评或重复作答均不增加 VLU |

### 3.2 修改题目版本

| 场景 | 输入 | 判定 |
| --- | --- | --- |
| 同任务仅修改题目 | T1/TV1 中 A1 从 AV1 改为实质修订的 AV2，并通过质量门禁 | 新作答可保留，但同一任务最多一个 VLU，V1 不重复计数；原作答不被覆写 |
| 换皮并新建任务 | 新 T2/TV2、A2/AV1，但规范化检验内容与 A1/AV1 相同 | 即使业务键表面不同，也由规范化内容比较挡住，不新增 VLU |
| 新任务使用实质新版本 | 新 T2/TV2、A1/AV2；AV2 是实质内容变化且重新通过质量门禁，来源/技能/作答/评分均有效 | 可在新任务形成一个新 VLU；仅改 ID、措辞或格式不满足此前提 |
| 修改后旧版待复核 | 权威库将 AV1 标为 `needs_review` | 不自动把历史正确改为错误，也不继续用于新诊断；复核若撤销质量资格，再按失效规则重算 |

### 3.3 删除后的聚合重算

本例只删除 U1 的来源 S1；U1 另有仍有效的公共入口，故合格入口分母保留。此假设不预设 Q04 对一般个人历史事实的保留结论。

| 时点 | 保留的合法事实 | 7 日首个 VLU 激活 | 当周 WVLU |
| --- | --- | --- | --- |
| 删除前 | U1、U2 均在成熟入口后 7 日内各一个有效 VLU；U3 已成熟入口且当周开始真实任务但无 VLU；三人当周均开始任务 | `2/3 = 66.67%` | `VLU_total=2`、`WAL=3`、`2/3 = 0.67` |
| S1 删除及依赖闭包生效后 | U1 的 V1 依赖 S1，重算为无效；U1 公共入口仍有效，但原开始任务及 VLU 不保留；U2、U3 不变 | `1/3 = 33.33%` | `VLU_total=1`、`WAL=2`、`1/2 = 0.50` |

重算以删除水位为输入边界，使用相同事件集合重复执行结果一致；原快照保留并标“已被修订”，新快照记录删除案例、水位、分子、分母和排除数。若账户删除或获批规则要求同时移除 U1 的入口事实，则激活改为 `1/2`，不能一面删除分子、一面把同一主体留在分母。窗口尚未成熟的记录仍标“观察中”，不得借删除提前记为失败。

### 3.4 恢复与延迟检验

- U1 于 `2026-01-10T10:00:00Z` 产生首个合格中断，`task.resumed.v1` 于 10:30 到达但没有新 VLU，此时尚不能计恢复。
- U1 于 `2026-01-12T09:00:00Z` 在另一真实任务形成新 VLU，落入 `[01-10 10:00, 01-13 10:00)`，恢复分子加 1；同一中断后续 VLU 不重复加。恰逢 01-13 10:00 不计主窗口。
- 若统计截止时只有 U1、U2 的首个中断均满 72 小时，U2 无新 VLU，则用户级恢复率为 `1/2`；恢复打开页面的次数不是分母，也不能把 U2 改为观察中。
- 若原 VLU 为 `2026-01-03T10:00:00Z`，上述新 VLU 使用同技能不同规范化内容并带 `origin_vlu_ref=V1`，且落在 7—14 天窗口，可计一次延迟触达；若只是 A1 同题重复，则恢复与延迟触达均不能由它刷数。

W1/W4 继续按 CL-011a 的首激活周和自然周计算，分母只含对应窗口已完整结束的已激活用户；不能改用上传人数、任务完成人数或恢复观察人数。

## 4. 隐私与重算测试设计

以下是实现时必须自动化的验收用例，当前仅完成纸面设计，**未执行生产事件测试**。封闭 Schema 拒绝额外字段之外，还要递归检查允许列表、枚举、引用归属和跨事件语义。

| ID | 构造输入 | 预期结果 |
| --- | --- | --- |
| P01 正文与作答泄漏 | 在任意包络、payload、引用或错误对象加入 `text`、`question`、`answer`、`dialogue`、`response_text`、`model_output` | Schema/语义校验拒绝并隔离；日志只记受控错误码，不回显泄漏值 |
| P02 凭据与 URL | 加入 `token`、`cookie`、`api_key`、`signature`、`signed_url`，或把签名参数藏入任意字符串/嵌套数组 | 拒绝；trace、错误和导出回执均不保存 URL 或凭据值 |
| P03 直接身份与设备信息 | 放入邮箱、手机号、姓名、IP、User-Agent、设备指纹，或用其普通哈希充当 `subject_ref` | 拒绝；伪匿名映射不出现在分析载荷中 |
| P04 未知字段/版本 | 增字段、改枚举、伪造 `.v9`、同 `event_id` 不同载荷 | 不降级猜测；隔离并告警，不产生第二次业务效果 |
| P05 重放去重 | 同 event 重投、同 operation 换 event 重发、消费者 ACK 丢失后重试 | 消费效果和指标均只计一次；同键异载荷单独隔离 |
| P06 VLU 刷数 | 重放第 3.1 节并加入同题拆任务、复制 ID、换皮、先曝光答案 | 首次合格记录至多一个 VLU；其余不增加激活、WVLU、留存、恢复或延迟触达 |
| P07 题目版本 | 执行第 3.2 节四种情况 | 同任务不重复；换皮被规范化内容键拦截；只有新任务的实质新版本且全部门禁通过才可新增 |
| P08 时间边界 | 构造恰好 7 日、72 小时、14 天及周末边界的 `validated_at` | 按左闭右开排除恰逢 `end` 的记录；未成熟窗口不进分母 |
| P09 分母一致性 | 混合上传、解析、生成、任务开始/完成、恢复打开及 VLU 事件 | WAL 只含主动开始者；激活、W1/W4、恢复和延迟各用 CL-011a 指定分母，不能互换 |
| P10 删除与晚到乱序 | 先删除再收到旧 completed/validated，重复删除回执，按第 3.3 节重算两次 | 晚到事件不复活 VLU；分子分母同步重算；两次输出相同，快照及修订原因可追踪 |
| P11 跨空间与越权 | 主体、来源、题目、技能或删除水位来自不同空间；伪造 actor/subject 请求导出 | 在产生效果前拒绝；事件引用和 `trace_id` 均不授予读取或下载权限 |
| P12 导出与删除竞态 | 导出请求后来源删除，再收到 ready/下载回调；旧签名 URL 尚未过期 | 不再交付被删内容；只记录导出状态和受限失败码，按 CL-004 Q07 披露残余，不虚假宣称即时撤销全部旧 URL |
| P13 留存与恢复 | 到期明细、外部副本、Outbox/Temporal 副本及旧备份恢复 | 按获批窗口清理；恢复先应用独立最新删除水位，无法证明时保持隔离 |
| P14 聚合再识别 | 小组、唯一组合筛选、删除前后两份快照对比 | 达到登记阈值才发布并评估差分泄漏；必要时抑制，不发布可识别个人行 |
| P15 属性/模糊测试 | 随机嵌套、Unicode 混淆字段、超长数组/字符串、重复引用、非法时间及随机事件顺序 | 有界资源内安全拒绝；合法排列与重放得到同一业务聚合，无崩溃或正文落日志 |

每次实现验证须保存 Schema/夹具版本、命令、预期/实际、失败与回退结果。结构校验通过只证明形状，不证明授权、真实投递、跨存储删除或供应商清理完成。

## 5. 验收、风险与回退

- 本文用合成事件覆盖重复作答、题目版本变化、删除重算及恢复/延迟边界；没有真实用户事件，未给出激活、W4、恢复或延迟检验的实测值。
- 未决项为 Q02/Q04/Q05/Q07/Q09 的留存、个人事实、外部副本、旧下载凭据和编排历史规则，以及规范化检验内容键的跨学科实现。未决前不得通过放宽 VLU 条件或长期保留原文绕过。
- 上线顺序应为：冻结 Schema 与允许列表→双版本消费者→合成隐私/重放/乱序测试→小范围接入→对账及删除演练。发现泄漏时先停止对应 producer/外发并隔离事件，保留最小受控证据，按数据事件流程处置；不能用删除日志代替补救。
- 回退可切回上一兼容消费者并停止新 producer，但不得删除去重键、篡改旧事件或恢复已删内容。已有发布报表保留快照，以修订版注明原因和输入水位。
- 本卡为纯文档交付，无代码、配置或正式事件契约改动，运行 `pnpm verify` 不适用；实际负责人、非作者审核人和验收人仍待按 Issue 记录确认，本文不代替外部隐私、权利或教学签审。
