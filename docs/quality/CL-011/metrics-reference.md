# CL-011c · 指标参考实现与口径对照

状态：**隔离研发的参考实现；不是生产指标管线，未接真实用户事件** · 版本：1.0 · 2026-11-11

来源：[CL-011a 激活、VLU 与恢复指标定义](activation-and-vlu-definitions.md)（下称“定义稿”）、[CL-011b 事件字典与隐私测试](event-dictionary-and-privacy-tests.md)（下称“事件字典”）。

> **这张卡在做什么：** 把定义稿的指标口径写成可执行、可逐条验证的纯函数，用于在隔离环境里先固定计算规则，再谈接真实事件。它**不产生任何实测指标**，也不改变定义稿。
>
> **不是什么：** 不是生产指标管线，不读写数据库，不接事件投递，不处理权限，不做删除水位，不接真实用户数据，不验证学习效果。

## 1. 交付物

| 文件 | 作用 |
| --- | --- |
| `apps/api/src/metrics/vlu-reference.ts` | 纯函数实现：VLU 判定、去重、WVLU、7 日激活、W1/W4 留存、72 小时恢复、延迟检验、删除后重算 |
| `apps/api/src/metrics/vlu-reference.test.ts` | 59 个 Vitest 用例，每个用例标题以定义稿条款编号开头 |
| `docs/quality/CL-011/metrics-reference.md` | 本文件：条款 → 函数 → 用例对照，以及未决项 |
| `docs/quality/CL-011/metrics-validation.json` | 本轮实际执行的命令、用例数、源码 SHA 与 `not_accepted` |

实现不引入新依赖，不修改既有文件，不改任何 Schema、契约、迁移或生产代码路径。`apps/api/src/metrics/` 目前没有任何模块引用它，因此不会进入运行时。

## 2. 设计边界

1. **输入是“事实”，不是原始事件。** 事件 → 事实的投影（公共包络校验、`operation_key` 技术去重、`deletion_watermark`、权限复核、伪匿名映射）属于 CL-011b/CL-011d 的实现范围。本实现接收已归一化的 `TaskFact` / `AssessmentFact` / `EntryFact` / `InterruptionFact`。
2. **时间只从参数来。** 唯一的“现在”是数据集里的 `cutoff`。函数不调用 `Date.now()`，因此同一集合重算结果一致，可以直接用于重算幂等断言。
3. **时间格式只接受带 `Z` 的 UTC 时间戳**，带偏移量的时间会被拒绝而不是静默换算（定义稿第 1 节“时间”）。
4. **不编码候选阈值。** 40% 激活线与 25% W4 线不出现在产物里；产物只有分子、分母和比值，`N/A` 有独立状态。
5. **口径不明时返回 `{ status: "undefined-by-spec", gap, reason }`**，并在 `specGaps` 汇总里计数。不补看起来合理的默认值。
6. **判定三元而非二元。** 除“是/不是 VLU”外，还有 `indeterminate`（无法判定 → 排除并披露，定义稿第 9 节），避免把“没证据”当成“成功”或“失败”。

## 3. 条款 → 实现函数 → 用例对照

### 3.1 第 1 节 共同口径

| 定义稿条款 | 实现函数 | 对应用例 |
| --- | --- | --- |
| 服务端 UTC 时间戳 | `parseUtcInstant` | `§1 只接受带 Z 的 UTC 时间戳…` |
| 自然周 `week(t)` 周一 00:00 起 | `weekStart` / `addDays` / `addHours` | `§1 自然周以周一 00:00 起算…` |
| 区间左闭右开 `[start, end)` | `isWithin` | `§1 区间左闭右开：恰逢 end 不计入窗口` |
| 零分母报 `N/A` 不写 0 | `rate` | `§3/§8.2 分母为零报 N/A，不得写成 0` |
| 内部测试/机器人/刷量/作弊不计 | `evaluateVlu`（`OPERATOR_EXCLUDED`） | `§1 内部测试/机器人/刷量主体整条排除` |
| 账户合并保留映射、不得产生第二个全局首个 VLU | `canonicalSubjectIndex` / `firstVluByUser` | `§4.1/§1 合并账户保留映射…` |
| 删除/撤回后从合法事件重算，不覆盖历史快照 | `withInvalidations` / `recomputeAfterInvalidation` | `§1 来源删除后分子分母同步重算…`、`§1 同一输入集合重算结果一致（幂等）…` |
| 未成熟窗口不进分母、不按失败处理 | `computeActivation` / `computeRetention` / `computeRecovery` 的 `observing*` 计数 | `§4.1 入口未满 7×24 小时…`、`§5 W4 窗口未完整结束…`、`§6.2 窗口未满 72 小时…` |

### 3.2 第 2 节 VLU

| 定义稿条款 | 实现函数 | 对应用例 |
| --- | --- | --- |
| §2.1-1 用户主动开始并提交作答（答错也可） | `evaluateVlu` | `§2.1-1 用户主动开始并提交作答 → 形成 VLU（答错不妨碍）` |
| §2.1-1 系统自动标记完成不算 | `evaluateVlu`（`TASK_AUTO_COMPLETED`） | `§2.1-1 系统自动把任务标为完成 → 不形成 VLU` |
| §2.1-1 打开页面/未开始不算 | `evaluateVlu`（`TASK_NOT_STARTED_BY_USER`） | `§2.1-1 只打开页面/未开始任务 → 不形成 VLU` |
| §2.1-1 撤回提交、无作答产物不算 | `evaluateVlu`（`TASK_NOT_COMPLETED` / `RESPONSE_ARTIFACT_MISSING`） | `§2.1-1 撤回提交或没有作答产物 → 不形成 VLU` |
| §2.1-2 内容质量门禁（草稿/待审/校验失败/撤回/失效不算） | `assessContentQuality` | `§2.1-2 已审校/试用生成内容可作为学习证据…`、`§2.1-2 草稿/待审/校验失败内容作答 → 不形成 VLU` |
| §2.1-2 试用生成/基础校验只能作学习证据，不自动升级为正式诊断 | `assessContentQuality`（`scope`） | `§2.1-2 试用内容用于正式诊断 → 不形成 VLU；用于学习证据 → 形成` |
| §2.1-2 提交前暴露答案不算；曝光状态不明标不可判定 | `evaluateVlu`（`ANSWER_EXPOSED` / `ANSWER_EXPOSURE_UNKNOWN`） | `§2.1-2 先看答案再提交 → 不形成 VLU…` |
| §2.1-2 提示必须记录层级 | `evaluateVlu`（`HINT_LEVEL_MISSING`） | `§2.1-2 使用提示但没有记录提示层级 → 不形成 VLU` |
| §2.1-3 至少一个有效技能 + 可定位来源版本与区块 | `evaluateVlu`（`SKILL_MISSING`/`SOURCE_MISSING`/`SOURCE_BLOCK_UNRESOLVED`） | `§2.1-3 无技能、无来源或来源区块无法定位 → 不形成 VLU` |
| §2.1-4 部分正确、错误仍可形成 VLU（评分规则支持时） | `evaluateVlu` | `§2.1-4 部分正确但评分规则支持该结果 → 仍形成 VLU` |
| §2.1-4 评分失败/规则不支持/无法对应版本不可信 | `evaluateVlu`（`RESULT_NOT_SUPPORTED_BY_RULE` 等） | `§2.1-4 评分规则不支持部分正确/无法判定 → …` |
| §2.1-4 只有完成自报/模型自评不算 | `evaluateVlu`（`SELF_REPORTED_RESULT`） | `§2.1-4 只有完成自报/模型自评 90%…` |
| §2.2 业务唯一键 `user+task+task_version+assessment+assessment_version` | `dedupeVlus`（`DUPLICATE_BUSINESS_KEY`） | `§2.2 同一业务唯一键的重放与重复作答只计一个 VLU` |
| §2.2 同一任务最多一个 VLU（含改题目版本） | `dedupeVlus`（`DUPLICATE_TASK`） | `§2.2 同一任务修改题目版本后仍最多一个 VLU` |
| §2.2 换皮/复制题目/拆任务不新增 | `dedupeVlus`（`DUPLICATE_NORMALIZED_CONTENT`） | `§2.2 换皮/复制题目成新任务…`、`§2.2 同题拆成多个任务不增加 VLU…` |
| §2.2 内容实质变化 + 重新过门禁才可新增 | `dedupeVlus` | `§2.2 内容实质变化并重新通过门禁…` |

### 3.3 第 3 节 WVLU

| 定义稿条款 | 实现函数 | 对应用例 |
| --- | --- | --- |
| `VLU_total(w)` 按去重后 `validated_at` 计数 | `computeWeeklyVlu` | `§3 周内开始任务的用户即使没有 VLU 也进分母…`（`VLU_total=12`） |
| `WAL(w)` 只含主动开始真实任务的用户（登录/阅读/上传/生成不算） | `selectWal` | `§3 只有登录/阅读/上传（无主动开始任务）不进 WAL 分母` |
| `WVLU_per_WAL` 示例 20 人 / 12 VLU = 0.60 | `computeWeeklyVlu` | 同上 |
| 同时报有 VLU 用户数、每用户中位数、总量 | `computeWeeklyVlu`（`usersWithVlu` / `medianVluPerUser`） | 同上 |
| 零分母报 `N/A` | `rate` | `§3 某周有 VLU 但无 WAL（任务在上一周开始）→ 人均报 N/A 而不是 0` |

### 3.4 第 4 节 首个 VLU 激活

| 定义稿条款 | 实现函数 | 对应用例 |
| --- | --- | --- |
| §4.1 合格入口：私有准入 + 可学习章节 / 公共实际进入 | `evaluateEntry` | `§4.1 仅注册、上传未成功、解析成功但无可用章节都不是合格入口`、`§4.1 私有资料准入成功且至少一个可学习章节可用…` |
| §4.1 窗口 `[entry_at, entry_at + 7×24h)`，恰逢 end 不算 | `computeActivation` | `§4.1 入口后 7×24 小时内形成首个 VLU → 计入分子`、`§4.1 恰逢 entry_at + 7×24h…` |
| §4.1 分母只含入口已满 7×24 小时者 | `computeActivation` | `§4.1 入口未满 7×24 小时 → 观察中…` |
| §4.1 七日后首个 VLU 单独报“迟到首个 VLU” | `computeActivation`（`lateFirstVluUsers`） | 同上“恰逢…”用例 |
| §4.1 按第一次入口主学科分群，后续换学科不重激活 | `computeActivation`（`bySubjectGroup`） | `§4.1 激活按第一次入口的主学科分群…` |
| §8.2 未激活用户不进 W4 分母 | `computeRetention` 与激活分别计算 | `§8.2 未激活用户不进 W4 分母…` |

### 3.5 第 5 节 W1/W4 留存

| 定义稿条款 | 实现函数 | 对应用例 |
| --- | --- | --- |
| 以 `week(activation_at)` 为 W0，W1/W4 是完整自然周 | `computeRetention` | `§5 W0 后第 1 个完整自然周内有新 VLU → W1 留存` |
| W1 `[W0+7d, W0+14d)`、W4 `[W0+28d, W0+35d)`，且 W1/W4 独立判断 | `computeRetention` | `§5 恰逢 W1 窗口 end 的 VLU 不算 W1 留存；W4 独立判断不要求 W1` |
| 分母只含对应窗口已完整结束的已激活用户 | `computeRetention`（`observingUsers`） | `§5 W4 窗口未完整结束 → 观察中，不进分母` |
| 同一周多个 VLU 对二值留存只算一个用户 | `computeRetention` | `§5 同一周多个 VLU 对二值留存只算一个用户` |

### 3.6 第 6 节 72 小时恢复

| 定义稿条款 | 实现函数 | 对应用例 |
| --- | --- | --- |
| §6.1 明确暂停/退出时间；无明确退出 = 最后交互 + 30 分钟 | `resolveInterruptedAt` | `§6.1 无明确退出时 interrupted_at = 最后交互 + 30 分钟…` |
| §6.1 同任务 24 小时内重复离线合并、取最早 | `mergeInterruptions` | `§6.1 同任务 24 小时内重复离线合并为一个中断，取最早时间` |
| §6.1 用户已有至少一个 VLU 才是合格中断 | `computeRecovery`（`interruptionsWithoutPriorVlu`） | `§6.1 用户尚无可计入的既有 VLU → 候选中断不进分母` |
| §6.2 窗口 `[interrupted_at, interrupted_at + 72h)` 内有新 VLU 计恢复 | `computeRecovery` | `§6.2 72 小时窗口内形成新 VLU → 计为恢复` |
| §6.2 恰逢第 72 小时不计入主窗口，列迟到恢复 | `computeRecovery`（`lateRecoveryUsers`） | `§6.2 恰逢第 72 小时才形成 VLU → 不进主窗口…` |
| §6.2 窗口未结束为观察中，不计失败 | `computeRecovery`（`observingUsers`） | `§6.2 窗口未满 72 小时 → 观察中，不按失败处理` |

### 3.7 第 7 节 延迟检验

| 定义稿条款 | 实现函数 | 对应用例 |
| --- | --- | --- |
| 窗口 `[origin+7d, origin+14d)`，完整窗口后统一计算 | `computeDelayedCheck` | `§7 原 VLU 后 7—14 天内完成同技能不同内容检验 → 触达 + 正确`、`§7 恰逢第 14 天 end 的检验…` |
| 同题/换皮/仅改 ID 不合格 | `dedupeVlus` + `computeDelayedCheck` | `§7 同题/换皮（同规范化内容）不能算延迟触达…` |
| 触达率分母 = 已满 14 天且来源仍有效的用户—技能数 | `computeDelayedCheck` | `§7 不同技能的新题不算该技能触达…` |
| 正确率用同一原 VLU 的首次合格新题检验 | `computeDelayedCheck`（`accuracy`） | `§7 不同技能的新题不算该技能触达；正确率只用首次合格检验` |
| 无法映射二元结果的量规只报分布 | `computeDelayedCheck`（`resultDistribution` / `binary-rubric-not-applicable`） | `§7 二元量规出现 partial → undefined-by-spec…` |
| 未收到邀请/未作答/内容撤回/未生成分别报告 | `computeDelayedCheck`（`nonDelivery`） | `§7 窗口未满 14 天 → 观察中；未触达原因分别报告…` |
| 窗口未成熟排除并标观察中 | `computeDelayedCheck`（`observingOriginVlus`） | 同上 |
| 原 VLU 来源删除后整体失效，不留分母 | `evaluateVlu` + `computeDelayedCheck` | `§7 原 VLU 来源被删除 → 原 VLU 整体失效…` |

### 3.8 第 8/9 节 分组、报表与验收

| 定义稿条款 | 实现函数 | 对应用例 |
| --- | --- | --- |
| §8.1 固定四组入口主学科，各组互斥 | `computeActivation`（`bySubjectGroup`） | `§4.1 激活按第一次入口的主学科分群…` |
| §8.1 cohort 只用于已激活用户 | `computeRetention`（`cohorts`） | `§5 W0 后第 1 个完整自然周内有新 VLU → W1 留存` |
| §8.2 最小报表的分子/分母/成熟条件 | `computeMetrics` 返回结构 | `§8.3 40% 激活线与 25% W4 线不出现在指标结果里…` |
| §8.3 候选阈值是待验证决策线 | 不实现（无阈值表达式） | 同上 |
| §9 不可判定标排除并披露，不默认补齐 | `indeterminate` 判定 + `rejectionCounts` | `§9 无法判定答案曝光/来源版本的记录标 indeterminate…` |
| §9 未决项必须显式登记 | `SPEC_GAPS` / `buildGapReport` | `§9 SPEC_GAPS 全部带条款、原因和决定人…` |

## 4. 定义稿未明确、实现返回 `undefined-by-spec` 的条目

这些条目**没有**被实现成“看起来合理”的规则。出现时记录为 `indeterminate` 并计入 `specGaps`，该记录被排除而不是默认成功。

| ID | 涉及条款 | 为什么不自行决定 | 谁来定 |
| --- | --- | --- | --- |
| `hint-level-grading` | §2.1-2、§9 未决项 | 定义稿只要求“记录提示层级”，没规定层级如何改变证据等级或是否使 VLU 失效。实现只校验“是否记录”。 | CL-011a 口径负责人 + 教学设计审核人 |
| `normalized-content-key` | §2.2、§9 未决项 | “规范化检验内容”的键算法（尤其跨学科比较）未冻结。同一用户已有 VLU 时，缺内容键无法证明“实质变化”，不得默认新增。 | CL-011b Schema 负责人 + CL-011a 口径负责人 |
| `interruption-session-exit-anchor` | §6.1 | “会话异常退出”的 `interrupted_at` 锚点未定义（检测到异常的服务端时间，还是最后交互 + 30 分钟）。 | CL-011a 口径负责人 + 中断探针负责人 |
| `account-merge-entry-attribution` | §1、§4.1 | 合并后 `entry_at`、入口主学科与首激活 cohort 归属哪个原账户未定义；只明确不得产生第二个全局首 VLU。 | CL-011a 口径负责人 + 身份/账户合并负责人 |
| `entry-attribution-tie` | §4.1 | 同一用户同一时刻出现两个不同主学科的合格入口时，“第一次入口主学科”取值未定义。 | CL-011a 口径负责人 |
| `partial-result-binary-aggregation` | §7 | 二元量规出现 `partial` 时，是计为“不正确”还是整条排除，定义稿未规定。 | CL-011a 口径负责人 + 学科评分量规负责人 |

此外有两处实现选择**不是**口径推断，但需要在接真实管线时确认（已在代码注释中标明）：

- 去重排序在同 `validated_at` 时按 `attempt_ref` 字典序稳定排序，仅用于确定“首次”，不是业务规则。
- `computeMetrics` 的 `specGaps` 汇总把各处缺口计数相加，便于一次看到全部待决项。

## 5. 候选阈值仍是假设线

- **40% 首个 VLU 激活率** 与 **25% W4 留存率** 在本实现里**不存在**：没有阈值常量、没有 `pass/fail`、没有 `target` 字段。
- 输出只有 `{ numerator, denominator, value }` 或 `N/A`。测试 `§8.3 40% 激活线与 25% W4 线不出现在指标结果里` 会失败，如果有人把它们塞进产物。
- 本实现**不**把这两个数字变成已验证 KPI。它们仍是待真实试点前登记的决策线，非承诺、非实测、不证明 PMF 或学习效果（定义稿 §8.3）。

## 6. 删除后重算的纯函数语义

```text
computeMetrics(dataset)                          // 用当前合法事实算一遍
withInvalidations(dataset, invalidations)        // 追加撤回/删除事实，不修改入参
recomputeAfterInvalidation(dataset, invalids)    // 返回 { previous, next } 两份快照
```

- 重算 = **用新集合再算一次**，不是增量修补；同一集合重复计算结果一致（用例 `§1 同一输入集合重算结果一致（幂等）…`）。
- `corrected`（更正）不抹掉历史作答；只有 `withdrawn` / `deleted` 让依赖该来源的 VLU 失效（事件字典 §2.4）。
- 删除后分子分母同步变化：删除一条来源会同时移出 VLU 分子与 WAL 分母，不会“只删分子不改分母”（用例 `§1 来源删除后分子分母同步重算：2/3 → 1/3…`）。
- **未实现**：真实删除水位、跨存储副本清理、已发布快照的不可变存储、迟到事件的乱序合并。这些属于 CL-011d/CL-117。

## 7. 把参考实现接成真实指标管线还缺什么

| 缺口 | 归属 | 说明 |
| --- | --- | --- |
| 事件 Schema 与允许列表 | CL-011b | 公共包络、`event_type.vN`、封闭字段校验、`operation_key` 技术去重 |
| 事件 → 事实投影 | CL-011b | `task.*` / `exit_assessment.*` / `resource.invalidated.*` 到 `TaskFact` / `AssessmentFact` 的映射与字段补齐 |
| 伪匿名主体映射 | CL-011b/CL-005 | `actor_ref` → `subject_ref` + `subject_group`，分库存放，账户合并映射可重算 |
| 内容质量状态来源 | CL-011a/CL-108 | `quality_state` / `content_state` 的权威值来自哪张表、由谁写入 |
| 规范化检验内容键 | CL-011b（未决） | 跨学科内容指纹算法；决定前 `normalized-content-key` 会持续被触发 |
| 来源有效性复核 | CL-011b/CL-113 | 更正、撤回、删除、撤权的权威记录与传播闭包 |
| 事件投递与幂等 | CL-008/CL-114 | Outbox、ACK 丢失、重放、乱序、迟到事件 |
| 删除水位与快照 | CL-011d/CL-117 | 按删除水位重算，保留历史快照与修订原因 |
| 存储与调度 | CL-011d | 指标事实表、聚合任务、回填、重算触发 |
| 权限 | CL-101 | 指标读取、导出、跨空间隔离 |
| 隐私与再识别 | CL-011b Q07/Q09 | 小样本抑制、差分泄漏评估、报告发布阈值 |

## 8. 如何验证

```bash
pnpm --filter @canlearn/api test          # 新增 59 个用例
pnpm --filter @canlearn/api typecheck
pnpm --filter @canlearn/api build
npx biome lint apps/api/src/metrics/      # 0 warning
npx biome format apps/api/src/metrics/    # 通过
```

本轮实际执行结果见 [metrics-validation.json](metrics-validation.json)。

**注意：** 仓库级 `npx biome lint .` / `npx biome format .` 目前会报 1 条 warning 与 2 处格式差异，均来自本轮之前已存在的工作区改动（`apps/web/src/app/prototype/prototype-app.tsx`、`docs/api/CL-106/validation-record.json`），**不在本卡允许修改的范围内**，因此未改动。落到本卡新增的两个文件时，lint 与 format 均通过。
