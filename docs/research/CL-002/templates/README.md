# 空白台账使用说明

将本目录模板复制到 `research-private/CL-002/` 后填写。仓库副本保持空白。
推荐会话 ID 形如 `S-001`，参与者 ID 形如 `P-001`，私下联系映射单独保存；编号不包含姓名、学号或联系方式。会话文件以对应 ID 命名。

## 招募台账

`recruitment.csv` 每人一行。`primary_group` 为 408 / CET / other；`subject` 记录真实学科，`level` 可填 CET4/CET6 等，避免将这些写成核心业务枚举。

- `screening_status`：pending / eligible / ineligible。
- `consent_status`：pending / granted / declined / withdrawn；`consent_version` 和 `consent_evidence_ref` 指向私下说明/凭据，不存签名或正文。
- `material_permission_status`：pending / approved_for_session / unavailable。approved_for_session 只允许核验过的会话用途，不表示可再分发。
- `followup_consent`：yes / no / unknown；`received_evidence`：yes / no。
- `status`：invited / screened / consented / scheduled / completed / declined / withdrawn / no_show；`updated_at` 使用 ISO 日期时间。
- 完成会话须能定位 `session_id` 和记录；排除/撤回写 `exclusion_reason`，不删掉导致样本偏差的统计痕迹，但具体保留须遵守事先约定的退出/删除安排。

实际进度以具有复核证据的完成会话统计；同一人跨组不重复计数，其他学科学科数单独统计。每周重新计算目标、实际、缺口，不能沿用报告初始的 0。

## 操作台账

`operations.csv` 每会话每步骤一行，`step` 对应脚本的六步。`mode` 为 manual / paper / prototype / live_system；`outcome` 为 independent / assisted / failed / declined / unavailable。等待、提示和人工介入分别记录。

`evidence_ref` 只引用私下 ID，不含签名 URL 或文件内容。描述失败时使用最少必要文字，补充记录保存在对应会话文件；未执行的步骤也写 unavailable 和原因。

## 工时与成本

`effort-and-cost.csv` 每执行人每次活动一行；`activity` 可为 preparation / parsing / source_check / explanation / exercise_validation / plan_proposal / moderation / followup / retry。`attempt` 从 1 递增，失败重试也记录。

人工工时求和 `active_minutes`；`waiting_minutes` 独立汇总。一次并行会话的墙钟时间不能通过累加多人的工时得出，操作耗时与人力表也不能重复相加。

金额与币种一起填写，仅记录有凭据的实付/已知服务消耗；未知留空，并在 notes 标明未知，实际为零才填 0。免费服务写 0 和依据；不同币种不直接相加。人工折算成本另列费率和币种假设，不伪装成实付。

所有完成的记录都只在约定的私下存储中使用。对外只能发布经复核、不能识别个人的汇总；不将 CSV 或会话原文推送到公开仓库。
