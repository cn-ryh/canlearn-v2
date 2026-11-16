// CL-011a 指标的纯函数参考实现。
//
// 口径唯一来源：docs/quality/CL-011/activation-and-vlu-definitions.md（下称“定义稿”）。
// 事件字段来源：docs/quality/CL-011/event-dictionary-and-privacy-tests.md（下称“事件字典”）。
//
// 范围与边界：
// - 不接数据库、网络、时钟与真实用户事件；所有时间从参数传入，便于逐条验证。
// - 输入是“已归一化的事实”，不是原始事件。事件 → 事实的投影（去重键、删除水位、权限复核）
//   由 CL-011b 负责，本文件不做 Schema 校验、权限判定或投递保证。
// - 定义稿某处口径不明确时，函数返回 { status: "undefined-by-spec" }，并在 SPEC_GAPS 登记，
//   不擅自补一个看起来合理的默认值。
// - 本文件不编码 40% 激活线、25% W4 线等候选阈值；它们仍是待验证假设，不是 KPI 门禁。

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVATION_WINDOW_MS = 7 * DAY_MS;
const RECOVERY_WINDOW_MS = 72 * 60 * 60 * 1000;
const INTERRUPTION_MERGE_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 第 1 节：共同口径 —— UTC、左闭右开区间、周一自然周
// ---------------------------------------------------------------------------

const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** 只接受带 `Z` 的 UTC 时间戳；带偏移量的时间必须先由上游换算（第 1 节“时间”）。 */
export function parseUtcInstant(value: string): number {
  if (!UTC_INSTANT_PATTERN.test(value)) throw new Error(`UTC_INSTANT_REQUIRED: ${value}`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`UTC_INSTANT_INVALID: ${value}`);
  return parsed;
}

export function toUtcInstant(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

/** 自然周 `week(t)`：周一 00:00（含）至下周一 00:00（不含），一律按 UTC 计算。 */
export function weekStart(value: string): string {
  const milliseconds = parseUtcInstant(value);
  const date = new Date(milliseconds);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return toUtcInstant(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - mondayOffset),
  );
}

export function addDays(value: string, days: number): string {
  return toUtcInstant(parseUtcInstant(value) + days * DAY_MS);
}

export function addHours(value: string, hours: number): string {
  return toUtcInstant(parseUtcInstant(value) + hours * 60 * 60 * 1000);
}

/** 左闭右开 `[start, end)`；恰逢 `end` 不计入（第 1 节“时间”）。 */
export function isWithin(value: string, start: string, end: string): boolean {
  const at = parseUtcInstant(value);
  return at >= parseUtcInstant(start) && at < parseUtcInstant(end);
}

export type Rate =
  | { status: "value"; numerator: number; denominator: number; value: number }
  | {
      status: "na";
      numerator: number;
      denominator: number;
      reason: "zero-denominator" | "binary-rubric-not-applicable";
    };

/** 分母为零报 `N/A`，不得写成 0（第 3 节、第 8.2 节）。 */
export function rate(numerator: number, denominator: number): Rate {
  if (denominator === 0)
    return { status: "na", numerator, denominator, reason: "zero-denominator" };
  return { status: "value", numerator, denominator, value: numerator / denominator };
}

// ---------------------------------------------------------------------------
// 定义稿未明确项（显式返回 undefined-by-spec，不自行发明口径）
// ---------------------------------------------------------------------------

export const SPEC_GAPS = [
  {
    id: "hint-level-grading",
    clause: "§2.1 条件 2 / §9 未决项",
    reason:
      "定义稿只要求记录 hint_level，未规定提示层级如何改变证据等级或是否使 VLU 失效；" +
      "因此仅校验“是否记录”，不实现分层降级。",
    owner: "CL-011a 指标口径负责人 + 教学设计审核人",
  },
  {
    id: "normalized-content-key",
    clause: "§2.2 去重 / §9 未决项",
    reason:
      "“规范化检验内容”的键算法（尤其跨学科比较）未冻结；事件只带内容引用时，" +
      "无法证明新旧内容是否实质不同。",
    owner: "CL-011b 事件 Schema 负责人 + CL-011a 指标口径负责人",
  },
  {
    id: "interruption-session-exit-anchor",
    clause: "§6.1",
    reason:
      "会话异常退出的 interrupted_at 锚点未定义：是按检测到异常的服务端时间，" +
      "还是按最后一次任务交互 + 30 分钟。",
    owner: "CL-011a 指标口径负责人 + 中断探针负责人",
  },
  {
    id: "account-merge-entry-attribution",
    clause: "§1 / §4.1",
    reason:
      "账户合并后 entry_at、入口主学科与首个激活分群归属哪个原账户未定义；" +
      "定义稿只明确不得产生第二个全局首个 VLU。",
    owner: "CL-011a 指标口径负责人 + 身份/账户合并负责人",
  },
  {
    id: "partial-result-binary-aggregation",
    clause: "§7 正确率 / §9 未决项",
    reason:
      "部分正确的学科量规未冻结：二元量规出现 partial 结果时，是否计为“不正确”、" +
      "还是整条记录排除，定义稿未规定。",
    owner: "CL-011a 指标口径负责人 + 学科评分量规负责人",
  },
  {
    id: "entry-attribution-tie",
    clause: "§4.1",
    reason: "同一用户同一时刻出现两个不同主学科的合格入口时，首个入口主学科如何取值未定义。",
    owner: "CL-011a 指标口径负责人",
  },
] as const;

export type SpecGapId = (typeof SPEC_GAPS)[number]["id"];

export type UndefinedBySpec = {
  status: "undefined-by-spec";
  gap: SpecGapId;
  reason: string;
};

export type GapTally = Partial<Record<SpecGapId, number>>;

const SPEC_GAP_INDEX: ReadonlyMap<SpecGapId, (typeof SPEC_GAPS)[number]> = new Map(
  SPEC_GAPS.map((gap) => [gap.id, gap]),
);

export function undefinedBySpec(gap: SpecGapId): UndefinedBySpec {
  const entry = SPEC_GAP_INDEX.get(gap);
  return { status: "undefined-by-spec", gap, reason: entry?.reason ?? gap };
}

function tallyGap(tally: GapTally, gap: SpecGapId): void {
  tally[gap] = (tally[gap] ?? 0) + 1;
}

export type SpecGapReport = {
  id: SpecGapId;
  clause: string;
  reason: string;
  owner: string;
  occurrences: number;
};

export function buildGapReport(...tallies: GapTally[]): SpecGapReport[] {
  const merged: GapTally = {};
  for (const tally of tallies) {
    for (const [gap, count] of Object.entries(tally)) {
      const key = gap as SpecGapId;
      merged[key] = (merged[key] ?? 0) + (count ?? 0);
    }
  }
  return SPEC_GAPS.map((gap) => ({ ...gap, occurrences: merged[gap.id] ?? 0 }));
}

// ---------------------------------------------------------------------------
// 第 2.1 节：内容质量门禁（“至少达到其声明用途的质量要求”）
// ---------------------------------------------------------------------------

export type SubjectGroup = "408" | "CET" | "other" | "unknown";
export type ContentPurpose = "learning_evidence" | "formal_diagnosis";
export type ResultCode = "correct" | "partial" | "incorrect" | "unjudgeable";
export type RubricKind = "binary" | "partial-capable";

export type ContentQualityState =
  | "curated"
  | "reviewed"
  | "trial_generated"
  | "basic_validated"
  | "draft"
  | "pending_review"
  | "validation_failed"
  | "withdrawn"
  | "invalid";

export type ContentQualityDecision =
  | { status: "allowed"; scope: ContentPurpose }
  | { status: "not-allowed"; reason: string }
  | { status: "unknown-state"; state: string };

// 平台维护/已审校内容支持两种用途；“试用生成/基础校验”只能作为学习证据，
// 不自动升级为正式诊断（第 2.1 节条件 2、§2.3 第 3 行）。
export function assessContentQuality(
  state: ContentQualityState | string,
  purpose: ContentPurpose,
): ContentQualityDecision {
  switch (state) {
    case "curated":
    case "reviewed":
      return { status: "allowed", scope: purpose };
    case "trial_generated":
    case "basic_validated":
      return purpose === "learning_evidence"
        ? { status: "allowed", scope: "learning_evidence" }
        : { status: "not-allowed", reason: "TRIAL_CONTENT_NOT_FORMAL_DIAGNOSIS" };
    case "draft":
    case "pending_review":
    case "validation_failed":
    case "withdrawn":
    case "invalid":
      return { status: "not-allowed", reason: "CONTENT_QUALITY_GATE_FAILED" };
    default:
      // 未知枚举不得猜测为合格（事件字典 P04）。
      return { status: "unknown-state", state: String(state) };
  }
}

// 第 9 节把“提示层级对证据等级的细分”列为未决项：这里只能显式返回待决，
// 不把任何提示层级判成有效或无效。
export function hintEvidenceGrade(hintLevel: number): UndefinedBySpec {
  const result = undefinedBySpec("hint-level-grading");
  return { ...result, reason: `${result.reason}（hint_level=${hintLevel}）` };
}

// ---------------------------------------------------------------------------
// 输入事实（由 CL-011b 事件投影而来）
// ---------------------------------------------------------------------------

export type CompletionKind = "submitted" | "recalled" | "auto_marked" | null;

export type TaskFact = {
  subjectRef: string;
  taskRef: string;
  taskVersionRef: string;
  /** 用户主动开始的服务端时间（task.started.v1）。 */
  startedAt: string;
  /** 上游无法判定是否主动开始时给 null。 */
  startedByUser: boolean | null;
  /** 完成 ≠ VLU；`auto_marked` 是系统自动标记，`recalled` 是用户撤回提交。 */
  completionKind: CompletionKind;
  entryKind: "private_source" | "public_unit" | "unknown";
  primarySubject: SubjectGroup;
  sourceVersionRefs: string[];
};

export type AssessmentFact = {
  subjectRef: string;
  taskRef: string;
  taskVersionRef: string;
  assessmentRef: string;
  assessmentVersionRef: string;
  attemptRef: string;
  gradeVersionRef: string | null;
  submittedAt: string;
  /** VLU 归属时点一律是 `validated_at`（第 1 节“事件时点”）。 */
  validatedAt: string;
  resultCode: ResultCode | null;
  rubricKind: RubricKind;
  /** 评分规则是否确实支持该结果（部分正确/无法判定）。 */
  scoreRuleSupportsResult: boolean;
  hintLevel: number | null;
  answerExposed: boolean | null;
  responseRef: string | null;
  selfReportedOnly?: boolean;
  qualityState: ContentQualityState | string;
  purpose: ContentPurpose;
  skillRefs: string[];
  sourceVersionRefs: string[];
  sourceBlockRefs: string[];
  /** 规范化检验内容键；跨学科算法未冻结，缺失时按 SPEC_GAPS 处理。 */
  normalizedContentRef: string | null;
  /** 仅用于同技能不同规范化内容的延迟检验（§7）。 */
  originVluRef: string | null;
};

export type EntryFact = {
  subjectRef: string;
  enteredAt: string;
  entryKind: "private_source" | "public_unit";
  primarySubject: SubjectGroup;
  /** 私有资料：系统确认准入。 */
  admissionConfirmed?: boolean;
  /** 私有资料：可学习章节数。 */
  usableSectionCount?: number;
  /** 公共单元：用户实际选择进入。 */
  actuallyEntered?: boolean;
};

export type InterruptionReason = "user_pause" | "session_exit" | "inactive_30m";

export type InterruptionFact = {
  subjectRef: string;
  interruptionRef: string;
  taskRef: string;
  taskVersionRef: string;
  reasonCode: InterruptionReason;
  interruptedAt?: string | null;
  lastInteractionAt?: string | null;
};

export type ResumptionFact = {
  subjectRef: string;
  taskRef: string;
  taskVersionRef: string;
  resumedAt: string;
};

export type SourceInvalidation = {
  sourceVersionRef: string;
  /** `corrected` 不抹掉历史作答；`withdrawn`/`deleted` 触发重算（事件字典 §2.4）。 */
  change: "corrected" | "withdrawn" | "deleted";
  recordedAt: string;
};

export type ExcludedSubject = {
  subjectRef: string;
  reason: "internal_test" | "bot" | "abuse" | "cheating";
};

export type DelayedNonDelivery = {
  originVluRef: string;
  reason: "not_invited" | "not_answered" | "content_withdrawn" | "not_generated";
};

export type MetricsDataset = {
  /** 统计截止时刻；所有成熟度判断都用它，函数本身不读时钟。 */
  cutoff: string;
  tasks: TaskFact[];
  assessments: AssessmentFact[];
  entries: EntryFact[];
  interruptions?: InterruptionFact[];
  resumptions?: ResumptionFact[];
  invalidations?: SourceInvalidation[];
  excludedSubjects?: ExcludedSubject[];
  /** 上游解析器确认无法定位的来源区块引用。 */
  unresolvableSourceBlockRefs?: string[];
  accountMerges?: { from: string; into: string }[];
  /** 恢复指标的分析观察期（§6.2）。 */
  recoveryObservation?: { start: string; end: string };
  /** §7 要求把未触达原因分别报告，不能静默记为错误。 */
  delayedNonDelivery?: DelayedNonDelivery[];
};

// ---------------------------------------------------------------------------
// 第 1 节：账户合并映射（保留可重算映射，不产生第二个全局首个 VLU）
// ---------------------------------------------------------------------------

export function canonicalSubjectIndex(
  merges: readonly { from: string; into: string }[] = [],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const merge of merges) index.set(merge.from, merge.into);
  for (const key of [...index.keys()]) {
    const seen = new Set<string>([key]);
    let current = index.get(key) ?? key;
    while (index.has(current) && !seen.has(current)) {
      seen.add(current);
      current = index.get(current) ?? current;
    }
    index.set(key, current);
  }
  return index;
}

function canonicalize(subjectRef: string, index: ReadonlyMap<string, string>): string {
  const seen = new Set<string>();
  let current = subjectRef;
  while (index.has(current) && !seen.has(current)) {
    seen.add(current);
    current = index.get(current) ?? current;
  }
  return current;
}

// ---------------------------------------------------------------------------
// 第 2.1 / 2.2 节：单个 VLU 的判定
// ---------------------------------------------------------------------------

export type VluRejectionCode =
  | "OPERATOR_EXCLUDED"
  | "TASK_REFERENCE_UNRESOLVED"
  | "TASK_START_UNKNOWN"
  | "TASK_NOT_STARTED_BY_USER"
  | "TASK_NOT_COMPLETED"
  | "TASK_AUTO_COMPLETED"
  | "RESPONSE_ARTIFACT_MISSING"
  | "ASSESSMENT_IDENTIFIER_MISSING"
  | "GRADE_VERSION_MISSING"
  | "RESULT_MISSING"
  | "SELF_REPORTED_RESULT"
  | "RESULT_NOT_SUPPORTED_BY_RULE"
  | "ANSWER_EXPOSURE_UNKNOWN"
  | "ANSWER_EXPOSED"
  | "HINT_LEVEL_MISSING"
  | "CONTENT_QUALITY_GATE_FAILED"
  | "CONTENT_QUALITY_UNKNOWN"
  | "CONTENT_NOT_FORMAL_DIAGNOSIS"
  | "SKILL_MISSING"
  | "SOURCE_MISSING"
  | "SOURCE_BLOCK_UNRESOLVED"
  | "SOURCE_INVALIDATED"
  | "TIMESTAMP_INCONSISTENT"
  | "DUPLICATE_BUSINESS_KEY"
  | "DUPLICATE_TASK"
  | "DUPLICATE_NORMALIZED_CONTENT"
  | "UNDEFINED_BY_SPEC";

export type VluRejection = {
  status: "not-vlu" | "indeterminate";
  code: VluRejectionCode;
  reason: string;
};

export type AcceptedVlu = {
  vluRef: string;
  subjectRef: string;
  originalSubjectRef: string;
  subjectGroup: SubjectGroup;
  taskRef: string;
  taskVersionRef: string;
  assessmentRef: string;
  assessmentVersionRef: string;
  attemptRef: string;
  hintLevel: number;
  resultCode: ResultCode;
  rubricKind: RubricKind;
  validatedAt: string;
  skillRefs: string[];
  sourceVersionRefs: string[];
  sourceBlockRefs: string[];
  normalizedContentRef: string | null;
  originVluRef: string | null;
};

export type VluEvaluation = { status: "vlu"; vlu: AcceptedVlu } | VluRejection | UndefinedBySpec;

export type EvaluationContext = {
  tasks: ReadonlyMap<string, TaskFact>;
  invalidatedSources: ReadonlyMap<string, SourceInvalidation>;
  excludedSubjects: ReadonlySet<string>;
  unresolvableBlocks: ReadonlySet<string>;
  canonical: ReadonlyMap<string, string>;
};

export function taskFactKey(task: Pick<TaskFact, "subjectRef" | "taskRef" | "taskVersionRef">) {
  return `${task.subjectRef}|${task.taskRef}|${task.taskVersionRef}`;
}

export function buildEvaluationContext(dataset: MetricsDataset): EvaluationContext {
  const canonical = canonicalSubjectIndex(dataset.accountMerges);
  const tasks = new Map<string, TaskFact>();
  for (const task of dataset.tasks) tasks.set(taskFactKey(task), task);
  const invalidatedSources = new Map<string, SourceInvalidation>();
  for (const invalidation of dataset.invalidations ?? []) {
    // `corrected` 只修订内容，不抹掉历史作答（事件字典 §2.4）。
    if (invalidation.change === "corrected") continue;
    invalidatedSources.set(invalidation.sourceVersionRef, invalidation);
  }
  const excludedSubjects = new Set(
    (dataset.excludedSubjects ?? []).map((item) => canonicalize(item.subjectRef, canonical)),
  );
  return {
    tasks,
    invalidatedSources,
    excludedSubjects,
    unresolvableBlocks: new Set(dataset.unresolvableSourceBlockRefs ?? []),
    canonical,
  };
}

const rejection = (
  status: VluRejection["status"],
  code: VluRejectionCode,
  reason: string,
): VluRejection => ({ status, code, reason });

// 四项必要条件必须同时成立（第 2.1 节）：
// 1) 真实任务完成；2) 有效检验；3) 关联来源/技能；4) 可信结果。
export function evaluateVlu(fact: AssessmentFact, context: EvaluationContext): VluEvaluation {
  const subjectRef = canonicalize(fact.subjectRef, context.canonical);

  // 第 1 节“合格记录”：内部测试、机器人、刷量及已确认作弊不计。
  if (context.excludedSubjects.has(subjectRef)) {
    return rejection("not-vlu", "OPERATOR_EXCLUDED", "主体被标记为内部测试/机器人/刷量/作弊");
  }

  // 条件 1：真实任务完成。
  const task = context.tasks.get(taskFactKey(fact));
  if (!task) {
    return rejection("indeterminate", "TASK_REFERENCE_UNRESOLVED", "找不到对应任务版本事实");
  }
  if (task.startedByUser === null) {
    return rejection("indeterminate", "TASK_START_UNKNOWN", "无法判定任务是否由用户主动开始");
  }
  if (!task.startedByUser) {
    return rejection("not-vlu", "TASK_NOT_STARTED_BY_USER", "任务不是用户主动开始");
  }
  if (task.completionKind === "auto_marked") {
    return rejection("not-vlu", "TASK_AUTO_COMPLETED", "系统自动把任务标为完成");
  }
  if (task.completionKind !== "submitted") {
    return rejection("not-vlu", "TASK_NOT_COMPLETED", "任务未正常提交完成");
  }
  if (!fact.responseRef || fact.responseRef.trim() === "") {
    return rejection("not-vlu", "RESPONSE_ARTIFACT_MISSING", "没有保存实际作答/回忆产物");
  }

  // 条件 2：有效检验（题目版本、质量门禁、答案曝光、提示层级）。
  if (
    fact.assessmentRef.trim() === "" ||
    fact.assessmentVersionRef.trim() === "" ||
    !fact.taskRef ||
    !fact.taskVersionRef
  ) {
    return rejection("not-vlu", "ASSESSMENT_IDENTIFIER_MISSING", "检验缺少题目/版本身份");
  }
  if (fact.answerExposed === null) {
    return rejection("indeterminate", "ANSWER_EXPOSURE_UNKNOWN", "答案曝光状态不可判定");
  }
  if (fact.answerExposed) {
    return rejection("not-vlu", "ANSWER_EXPOSED", "提交前已暴露参考答案");
  }
  if (fact.hintLevel === null) {
    return rejection("not-vlu", "HINT_LEVEL_MISSING", "使用了提示但未记录提示层级");
  }
  const quality = assessContentQuality(fact.qualityState, fact.purpose);
  if (quality.status === "unknown-state") {
    return rejection(
      "indeterminate",
      "CONTENT_QUALITY_UNKNOWN",
      `未知内容质量状态 ${quality.state}，不猜测为合格`,
    );
  }
  if (quality.status === "not-allowed") {
    if (quality.reason === "TRIAL_CONTENT_NOT_FORMAL_DIAGNOSIS") {
      return rejection(
        "not-vlu",
        "CONTENT_NOT_FORMAL_DIAGNOSIS",
        "试用生成/基础校验内容不能计入正式诊断用途",
      );
    }
    return rejection("not-vlu", "CONTENT_QUALITY_GATE_FAILED", "内容未通过其声明用途的质量门禁");
  }

  // 条件 3：关联来源/技能（公共内容也必须回到维护版本与区块）。
  if (fact.skillRefs.length === 0) {
    return rejection("not-vlu", "SKILL_MISSING", "没有关联有效技能");
  }
  if (fact.sourceVersionRefs.length === 0) {
    return rejection("not-vlu", "SOURCE_MISSING", "无来源的开放生成不进入 VLU");
  }
  if (
    fact.sourceBlockRefs.length === 0 ||
    fact.sourceBlockRefs.some((block) => context.unresolvableBlocks.has(block))
  ) {
    return rejection("not-vlu", "SOURCE_BLOCK_UNRESOLVED", "来源区块不存在或无法定位");
  }
  if (fact.sourceVersionRefs.some((source) => context.invalidatedSources.has(source))) {
    return rejection("not-vlu", "SOURCE_INVALIDATED", "来源已撤回、删除或失效");
  }

  // 条件 4：可信结果。
  if (fact.gradeVersionRef === null || fact.gradeVersionRef.trim() === "") {
    return rejection("not-vlu", "GRADE_VERSION_MISSING", "无法对应评分依据与版本");
  }
  if (fact.selfReportedOnly === true) {
    return rejection("not-vlu", "SELF_REPORTED_RESULT", "只有完成自报或模型自评，没有可信结果");
  }
  if (fact.resultCode === null) {
    return rejection("not-vlu", "RESULT_MISSING", "没有评分结果");
  }
  if (
    (fact.resultCode === "partial" || fact.resultCode === "unjudgeable") &&
    !fact.scoreRuleSupportsResult
  ) {
    return rejection(
      "not-vlu",
      "RESULT_NOT_SUPPORTED_BY_RULE",
      "评分规则不支持该结果，记录不可复核",
    );
  }
  if (parseUtcInstant(fact.validatedAt) < parseUtcInstant(fact.submittedAt)) {
    return rejection("indeterminate", "TIMESTAMP_INCONSISTENT", "validated_at 早于 submitted_at");
  }

  const vluRef = `${subjectRef}|${fact.taskRef}|${fact.taskVersionRef}|${fact.assessmentRef}|${fact.assessmentVersionRef}`;
  return {
    status: "vlu",
    vlu: {
      vluRef,
      subjectRef,
      originalSubjectRef: fact.subjectRef,
      subjectGroup: task.primarySubject,
      taskRef: fact.taskRef,
      taskVersionRef: fact.taskVersionRef,
      assessmentRef: fact.assessmentRef,
      assessmentVersionRef: fact.assessmentVersionRef,
      attemptRef: fact.attemptRef,
      hintLevel: fact.hintLevel,
      resultCode: fact.resultCode,
      rubricKind: fact.rubricKind,
      validatedAt: fact.validatedAt,
      skillRefs: [...new Set(fact.skillRefs)],
      sourceVersionRefs: [...new Set(fact.sourceVersionRefs)],
      sourceBlockRefs: [...new Set(fact.sourceBlockRefs)],
      normalizedContentRef: fact.normalizedContentRef,
      originVluRef: fact.originVluRef,
    },
  };
}

// ---------------------------------------------------------------------------
// 第 2.2 节：去重与归属
// ---------------------------------------------------------------------------

export type VluSelection = {
  accepted: AcceptedVlu[];
  rejections: VluRejection[];
  gaps: GapTally;
};

type DuplicateDecision =
  | { kind: "accept" }
  | { kind: "duplicate"; code: VluRejectionCode; reason: string }
  | { kind: "undefined"; gap: SpecGapId; reason: string };

// 业务唯一性 `user_id + task_id + task_version + assessment_id + assessment_version`；
// 同一任务最多一个 VLU；同一用户首次就某项规范化检验内容形成 VLU 后，换皮/拆任务不再新增。
// 排序只用于“首次”归属：validated_at 升序，同刻按 attempt_ref 稳定排序（实现细节，非口径）。
export function dedupeVlus(candidates: readonly AcceptedVlu[]): VluSelection {
  const ordered = [...candidates].sort((left, right) => {
    const delta = parseUtcInstant(left.validatedAt) - parseUtcInstant(right.validatedAt);
    return delta !== 0 ? delta : left.attemptRef.localeCompare(right.attemptRef);
  });
  const accepted: AcceptedVlu[] = [];
  const rejections: VluRejection[] = [];
  const gaps: GapTally = {};
  const byBusinessKey = new Map<string, AcceptedVlu>();
  const byTask = new Map<string, AcceptedVlu>();
  const byAssessmentVersion = new Map<string, AcceptedVlu>();
  const byContent = new Map<string, AcceptedVlu>();

  for (const candidate of ordered) {
    const decision = decideDuplicate(candidate, {
      byBusinessKey,
      byTask,
      byAssessmentVersion,
      byContent,
    });
    if (decision.kind === "duplicate") {
      rejections.push(rejection("not-vlu", decision.code, decision.reason));
      continue;
    }
    if (decision.kind === "undefined") {
      tallyGap(gaps, decision.gap);
      rejections.push(rejection("indeterminate", "DUPLICATE_NORMALIZED_CONTENT", decision.reason));
      continue;
    }
    accepted.push(candidate);
    byBusinessKey.set(candidate.vluRef, candidate);
    byTask.set(`${candidate.subjectRef}|${candidate.taskRef}`, candidate);
    byAssessmentVersion.set(
      `${candidate.subjectRef}|${candidate.assessmentRef}|${candidate.assessmentVersionRef}`,
      candidate,
    );
    if (candidate.normalizedContentRef !== null) {
      byContent.set(`${candidate.subjectRef}|${candidate.normalizedContentRef}`, candidate);
    }
  }
  return { accepted, rejections, gaps };
}

function decideDuplicate(
  candidate: AcceptedVlu,
  indexes: {
    byBusinessKey: ReadonlyMap<string, AcceptedVlu>;
    byTask: ReadonlyMap<string, AcceptedVlu>;
    byAssessmentVersion: ReadonlyMap<string, AcceptedVlu>;
    byContent: ReadonlyMap<string, AcceptedVlu>;
  },
): DuplicateDecision {
  if (indexes.byBusinessKey.has(candidate.vluRef)) {
    return {
      kind: "duplicate",
      code: "DUPLICATE_BUSINESS_KEY",
      reason: "同一业务唯一键的重放/重复作答不新增 VLU",
    };
  }
  const sameTask = indexes.byTask.get(`${candidate.subjectRef}|${candidate.taskRef}`);
  if (sameTask) {
    return {
      kind: "duplicate",
      code: "DUPLICATE_TASK",
      reason: "同一任务最多形成一个 VLU（含修改题目版本、拆分任务）",
    };
  }
  const sameAssessment = indexes.byAssessmentVersion.get(
    `${candidate.subjectRef}|${candidate.assessmentRef}|${candidate.assessmentVersionRef}`,
  );
  if (sameAssessment) {
    return {
      kind: "duplicate",
      code: "DUPLICATE_NORMALIZED_CONTENT",
      reason: "同一检验内容版本换个任务ID仍是同一检验",
    };
  }
  if (candidate.normalizedContentRef === null) {
    // 用户此前已有 VLU，但本条没有内容键：无法证明内容实质变化，不得默认新增。
    const hasPrior = [...indexes.byTask.keys()].some((key) =>
      key.startsWith(`${candidate.subjectRef}|`),
    );
    if (hasPrior) {
      const gap = undefinedBySpec("normalized-content-key");
      return { kind: "undefined", gap: gap.gap, reason: gap.reason };
    }
    return { kind: "accept" };
  }
  const sameContent = indexes.byContent.get(
    `${candidate.subjectRef}|${candidate.normalizedContentRef}`,
  );
  if (sameContent) {
    // 跨学科内容比较算法未冻结：定义稿把这一实现列为未决项。
    if (sameContent.subjectGroup !== candidate.subjectGroup) {
      const gap = undefinedBySpec("normalized-content-key");
      return { kind: "undefined", gap: gap.gap, reason: gap.reason };
    }
    return {
      kind: "duplicate",
      code: "DUPLICATE_NORMALIZED_CONTENT",
      reason: "同一用户就同一规范化检验内容已形成 VLU（换皮/复制题目不新增）",
    };
  }
  return { kind: "accept" };
}

export function selectVlus(dataset: MetricsDataset): VluSelection {
  const context = buildEvaluationContext(dataset);
  const rejections: VluRejection[] = [];
  const candidates: AcceptedVlu[] = [];
  const gaps: GapTally = {};
  for (const fact of dataset.assessments) {
    const evaluated = evaluateVlu(fact, context);
    if (evaluated.status === "vlu") {
      candidates.push(evaluated.vlu);
      continue;
    }
    if (evaluated.status === "undefined-by-spec") {
      // 单条判定进入 undefined-by-spec 时按“排除并披露”处理（第 9 节）。
      tallyGap(gaps, evaluated.gap);
      rejections.push({
        status: "indeterminate",
        code: "UNDEFINED_BY_SPEC",
        reason: evaluated.reason,
      });
      continue;
    }
    rejections.push(evaluated);
  }
  const deduped = dedupeVlus(candidates);
  for (const [gap, count] of Object.entries(deduped.gaps)) {
    gaps[gap as SpecGapId] = (gaps[gap as SpecGapId] ?? 0) + (count ?? 0);
  }
  return {
    accepted: deduped.accepted,
    rejections: [...rejections, ...deduped.rejections],
    gaps,
  };
}

// ---------------------------------------------------------------------------
// 第 3 节：WVLU（周有效学习单元）
// ---------------------------------------------------------------------------

export type WeeklyVluMetrics = {
  week: string;
  vluTotal: number;
  wal: number;
  wvluPerWal: Rate;
  usersWithVlu: number;
  /** 无 VLU 用户时为 null（不报 0，避免被误读为“人均 0”）。 */
  medianVluPerUser: number | null;
  walIndeterminate: number;
};

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1] ?? 0;
  return (lower + upper) / 2;
}

export type WalSelection = {
  /** week -> 主动开始真实任务的独立用户。 */
  usersByWeek: Map<string, Set<string>>;
  /** week -> 开始状态不可判定的事件数。 */
  indeterminateByWeek: Map<string, number>;
};

// WAL 分母只含“主动开始真实学习任务”的用户；登录、阅读、上传、生成都不算（第 3 节）。
// 来源被删除/撤回的任务开始事实一并剔除，等量重算分子分母（事件字典 §3.3）。
export function selectWal(dataset: MetricsDataset): WalSelection {
  const context = buildEvaluationContext(dataset);
  const usersByWeek = new Map<string, Set<string>>();
  const indeterminateByWeek = new Map<string, number>();
  for (const task of dataset.tasks) {
    const week = weekStart(task.startedAt);
    const subjectRef = canonicalize(task.subjectRef, context.canonical);
    if (task.startedByUser === null) {
      indeterminateByWeek.set(week, (indeterminateByWeek.get(week) ?? 0) + 1);
      continue;
    }
    if (!task.startedByUser) continue;
    if (context.excludedSubjects.has(subjectRef)) continue;
    if (task.sourceVersionRefs.some((source) => context.invalidatedSources.has(source))) continue;
    const users = usersByWeek.get(week) ?? new Set<string>();
    users.add(subjectRef);
    usersByWeek.set(week, users);
  }
  return { usersByWeek, indeterminateByWeek };
}

export function computeWeeklyVlu(
  vlus: readonly AcceptedVlu[],
  dataset: MetricsDataset,
): WeeklyVluMetrics[] {
  const wal = selectWal(dataset);
  const weeks = new Set<string>([...wal.usersByWeek.keys()]);
  const perUserPerWeek = new Map<string, number>();
  for (const vlu of vlus) {
    const week = weekStart(vlu.validatedAt);
    weeks.add(week);
    const key = `${week}|${vlu.subjectRef}`;
    perUserPerWeek.set(key, (perUserPerWeek.get(key) ?? 0) + 1);
  }
  return [...weeks].sort().map((week) => {
    const vluTotal = vlus.filter((vlu) => weekStart(vlu.validatedAt) === week).length;
    const users = wal.usersByWeek.get(week) ?? new Set<string>();
    const counts = [...perUserPerWeek.entries()]
      .filter(([key]) => key.startsWith(`${week}|`))
      .map(([, count]) => count);
    return {
      week,
      vluTotal,
      wal: users.size,
      wvluPerWal: rate(vluTotal, users.size),
      usersWithVlu: counts.length,
      medianVluPerUser: median(counts),
      walIndeterminate: wal.indeterminateByWeek.get(week) ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 第 4 节：首个 VLU 激活（7 日主口径）
// ---------------------------------------------------------------------------

export type EntryEvaluation =
  | { status: "qualified" }
  | { status: "not-qualified"; code: string }
  | { status: "indeterminate"; code: string };

// 合格入口（§4.1）：私有资料需准入成功且至少一个可学习章节；公共单元需用户实际选择进入。
// 仅注册、上传未成功、解析中、解析成功但无可用章节、只浏览封面都不是入口。
export function evaluateEntry(entry: EntryFact): EntryEvaluation {
  if (entry.entryKind === "private_source") {
    if (entry.admissionConfirmed === undefined) {
      return { status: "indeterminate", code: "ENTRY_ADMISSION_INDETERMINATE" };
    }
    if (!entry.admissionConfirmed) return { status: "not-qualified", code: "ENTRY_NOT_ADMITTED" };
    if (entry.usableSectionCount === undefined) {
      return { status: "indeterminate", code: "ENTRY_SECTIONS_INDETERMINATE" };
    }
    if (entry.usableSectionCount < 1) {
      return { status: "not-qualified", code: "ENTRY_NO_USABLE_SECTION" };
    }
    return { status: "qualified" };
  }
  if (entry.actuallyEntered === undefined) {
    return { status: "indeterminate", code: "ENTRY_SELECTION_INDETERMINATE" };
  }
  if (!entry.actuallyEntered) return { status: "not-qualified", code: "ENTRY_NOT_ENTERED" };
  return { status: "qualified" };
}

export type GroupRate = { denominator: number; numerator: number; rate: Rate };

export type ActivationMetrics = {
  window: "[entry_at, entry_at + 7 × 24h)";
  cutoff: string;
  overall: GroupRate;
  lateFirstVluUsers: number;
  observingUsers: number;
  firstVluBeforeEntryUsers: number;
  attributionUndefinedUsers: number;
  entryExclusions: Record<string, number>;
  bySubjectGroup: Record<SubjectGroup, GroupRate>;
  gaps: GapTally;
};

const SUBJECT_GROUPS: readonly SubjectGroup[] = ["408", "CET", "other", "unknown"];

function emptyGroupRates(): Record<SubjectGroup, { denominator: number; numerator: number }> {
  return Object.fromEntries(
    SUBJECT_GROUPS.map((group) => [group, { denominator: 0, numerator: 0 }]),
  ) as Record<SubjectGroup, { denominator: number; numerator: number }>;
}

function groupRates(counts: Record<SubjectGroup, { denominator: number; numerator: number }>) {
  return Object.fromEntries(
    SUBJECT_GROUPS.map((group) => {
      const value = counts[group];
      return [group, { ...value, rate: rate(value.numerator, value.denominator) }];
    }),
  ) as Record<SubjectGroup, GroupRate>;
}

/** 首个有效 VLU 的 validated_at；合并账户取合并后最早一条，避免第二个全局首个 VLU。 */
export function firstVluByUser(vlus: readonly AcceptedVlu[]): Map<string, AcceptedVlu> {
  const first = new Map<string, AcceptedVlu>();
  for (const vlu of vlus) {
    const current = first.get(vlu.subjectRef);
    if (!current || parseUtcInstant(vlu.validatedAt) < parseUtcInstant(current.validatedAt)) {
      first.set(vlu.subjectRef, vlu);
    }
  }
  return first;
}

export function computeActivation(
  vlus: readonly AcceptedVlu[],
  dataset: MetricsDataset,
): ActivationMetrics {
  const canonical = canonicalSubjectIndex(dataset.accountMerges);
  const cutoffMs = parseUtcInstant(dataset.cutoff);
  const entriesByUser = new Map<string, EntryFact[]>();
  for (const entry of dataset.entries) {
    const user = canonicalize(entry.subjectRef, canonical);
    const list = entriesByUser.get(user) ?? [];
    list.push(entry);
    entriesByUser.set(user, list);
  }

  const firstVlu = firstVluByUser(vlus);
  const entryExclusions: Record<string, number> = {};
  const counts = emptyGroupRates();
  const attributionUndefined = new Set<string>();
  let numerator = 0;
  let denominator = 0;
  let late = 0;
  let observing = 0;
  let beforeEntry = 0;
  const gaps: GapTally = {};

  for (const [user, entries] of entriesByUser) {
    const qualified: EntryFact[] = [];
    let indeterminate = false;
    for (const entry of entries) {
      const evaluated = evaluateEntry(entry);
      if (evaluated.status === "qualified") qualified.push(entry);
      if (evaluated.status === "indeterminate") indeterminate = true;
      if (evaluated.status === "not-qualified") {
        entryExclusions[evaluated.code] = (entryExclusions[evaluated.code] ?? 0) + 1;
      }
    }
    if (qualified.length === 0) {
      if (indeterminate) {
        entryExclusions.ENTRY_INDETERMINATE = (entryExclusions.ENTRY_INDETERMINATE ?? 0) + 1;
      }
      continue;
    }

    // §1 只要求保留合并映射、不得产生第二个全局首个 VLU；合并后入口/主学科归属未定义。
    const originalAccounts = new Set(qualified.map((entry) => entry.subjectRef));
    if (originalAccounts.size > 1) {
      tallyGap(gaps, "account-merge-entry-attribution");
      tallyGapAttribution(entryExclusions);
      attributionUndefined.add(user);
      continue;
    }

    qualified.sort(
      (left, right) => parseUtcInstant(left.enteredAt) - parseUtcInstant(right.enteredAt),
    );
    const earliestAt = qualified[0]?.enteredAt;
    if (!earliestAt) continue;
    const earliest = qualified.filter(
      (entry) => parseUtcInstant(entry.enteredAt) === parseUtcInstant(earliestAt),
    );
    const groups = new Set(earliest.map((entry) => entry.primarySubject));
    if (groups.size > 1) {
      // §4.1 未定义同日同刻两个主学科入口时的“第一个入口主学科”，不任选一个。
      tallyGap(gaps, "entry-attribution-tie");
      entryExclusions.ENTRY_ATTRIBUTION_TIE = (entryExclusions.ENTRY_ATTRIBUTION_TIE ?? 0) + 1;
      continue;
    }
    const entry = earliest[0];
    if (!entry) continue;

    const entryMs = parseUtcInstant(entry.enteredAt);
    const matured = entryMs + ACTIVATION_WINDOW_MS <= cutoffMs;
    if (!matured) {
      observing += 1;
      continue;
    }
    denominator += 1;
    counts[entry.primarySubject].denominator += 1;

    const activation = firstVlu.get(user);
    if (!activation) continue;
    const activationMs = parseUtcInstant(activation.validatedAt);
    if (activationMs < entryMs) {
      beforeEntry += 1;
      continue;
    }
    if (activationMs < entryMs + ACTIVATION_WINDOW_MS) {
      numerator += 1;
      counts[entry.primarySubject].numerator += 1;
    } else {
      // 七日后才形成首个 VLU：单独报告“迟到首个 VLU”，不回改七日激活率（§4.1）。
      late += 1;
    }
  }

  return {
    window: "[entry_at, entry_at + 7 × 24h)",
    cutoff: dataset.cutoff,
    overall: { denominator, numerator, rate: rate(numerator, denominator) },
    lateFirstVluUsers: late,
    observingUsers: observing,
    firstVluBeforeEntryUsers: beforeEntry,
    attributionUndefinedUsers: attributionUndefined.size,
    entryExclusions,
    bySubjectGroup: groupRates(counts),
    gaps,
  };
}

function tallyGapAttribution(entryExclusions: Record<string, number>): void {
  entryExclusions.ACCOUNT_MERGE_ATTRIBUTION_UNDEFINED =
    (entryExclusions.ACCOUNT_MERGE_ATTRIBUTION_UNDEFINED ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// 第 5 节：W1/W4 留存（自然周，不是滚动 7/28 天）
// ---------------------------------------------------------------------------

export type CohortRetention = { activationWeek: string; denominator: number; numerator: number };

export type RetentionMetrics = {
  window: "W1" | "W4";
  rate: Rate;
  observingUsers: number;
  cohorts: CohortRetention[];
};

export function computeRetention(
  vlus: readonly AcceptedVlu[],
  dataset: MetricsDataset,
  window: "W1" | "W4",
): RetentionMetrics {
  const cutoffMs = parseUtcInstant(dataset.cutoff);
  const first = firstVluByUser(vlus);
  const byUser = new Map<string, AcceptedVlu[]>();
  for (const vlu of vlus) {
    const list = byUser.get(vlu.subjectRef) ?? [];
    list.push(vlu);
    byUser.set(vlu.subjectRef, list);
  }
  const offsetDays = window === "W1" ? 7 : 28;
  const cohorts = new Map<string, { denominator: number; numerator: number }>();
  let denominator = 0;
  let numerator = 0;
  let observing = 0;

  for (const [user, origin] of first) {
    const w0 = weekStart(origin.validatedAt);
    const windowStart = addDays(w0, offsetDays);
    const windowEnd = addDays(w0, offsetDays + 7);
    if (parseUtcInstant(windowEnd) > cutoffMs) {
      // 窗口未完整结束：标“观察中”，既不进分母也不按失败处理（§5、§1）。
      observing += 1;
      continue;
    }
    denominator += 1;
    const cohort = cohorts.get(w0) ?? { denominator: 0, numerator: 0 };
    cohort.denominator += 1;
    const userVlus = byUser.get(user) ?? [];
    const retained = userVlus.some(
      (vlu) => vlu.vluRef !== origin.vluRef && isWithin(vlu.validatedAt, windowStart, windowEnd),
    );
    if (retained) {
      numerator += 1;
      cohort.numerator += 1;
    }
    cohorts.set(w0, cohort);
  }

  return {
    window,
    rate: rate(numerator, denominator),
    observingUsers: observing,
    cohorts: [...cohorts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([activationWeek, value]) => ({
        activationWeek,
        denominator: value.denominator,
        numerator: value.numerator,
      })),
  };
}

// ---------------------------------------------------------------------------
// 第 6 节：中断后 72 小时恢复
// ---------------------------------------------------------------------------

export type InterruptionResolution =
  | { status: "resolved"; at: string }
  | { status: "indeterminate"; code: string }
  | UndefinedBySpec;

// §6.1 只固定了两种锚点：明确暂停/退出的服务端时间；无明确退出时最后交互 + 30 分钟。
// 会话异常退出的检测时刻与交互锚点之间的关系未定义，故返回 undefined-by-spec。
export function resolveInterruptedAt(fact: InterruptionFact): InterruptionResolution {
  if (fact.reasonCode === "session_exit")
    return undefinedBySpec("interruption-session-exit-anchor");
  if (fact.reasonCode === "user_pause") {
    if (!fact.interruptedAt) return { status: "indeterminate", code: "INTERRUPTED_AT_MISSING" };
    return { status: "resolved", at: fact.interruptedAt };
  }
  if (!fact.lastInteractionAt) {
    return { status: "indeterminate", code: "LAST_INTERACTION_MISSING" };
  }
  return { status: "resolved", at: addHours(fact.lastInteractionAt, 0.5) };
}

export type RecoveryMetrics = {
  rate: Rate;
  observingUsers: number;
  lateRecoveryUsers: number;
  interruptionsWithoutPriorVlu: number;
  mergedInterruptions: number;
  unresolvedInterruptions: number;
  observation: { start: string | null; end: string | null };
};

type ResolvedInterruption = { subjectRef: string; taskRef: string; at: string };

// 同一任务在中断后 24 小时内的重复离线/重连合并为一个中断事件，取最早时间；
// 明确恢复后（有 task.resumed.v1）再发生的独立中断另记（§6.1）。
export function mergeInterruptions(
  interruptions: readonly InterruptionFact[],
  resumptions: readonly ResumptionFact[],
  canonical: ReadonlyMap<string, string>,
): { merged: ResolvedInterruption[]; mergedCount: number; unresolved: number } {
  const resolved: ResolvedInterruption[] = [];
  let unresolved = 0;
  for (const interruption of interruptions) {
    const at = resolveInterruptedAt(interruption);
    if (at.status === "indeterminate") {
      unresolved += 1;
      continue;
    }
    if (at.status === "undefined-by-spec") {
      unresolved += 1;
      continue;
    }
    resolved.push({
      subjectRef: canonicalize(interruption.subjectRef, canonical),
      taskRef: interruption.taskRef,
      at: at.at,
    });
  }

  const byTask = new Map<string, ResolvedInterruption[]>();
  for (const item of resolved) {
    const key = `${item.subjectRef}|${item.taskRef}`;
    const list = byTask.get(key) ?? [];
    list.push(item);
    byTask.set(key, list);
  }
  const merged: ResolvedInterruption[] = [];
  let mergedCount = 0;
  for (const [key, list] of byTask) {
    list.sort((left, right) => parseUtcInstant(left.at) - parseUtcInstant(right.at));
    let anchor: ResolvedInterruption | null = null;
    for (const item of list) {
      if (!anchor) {
        anchor = item;
        merged.push(item);
        continue;
      }
      const withinMerge =
        parseUtcInstant(item.at) - parseUtcInstant(anchor.at) < INTERRUPTION_MERGE_MS;
      const resumedBetween = resumptions.some((resumption) => {
        if (`${canonicalize(resumption.subjectRef, canonical)}|${resumption.taskRef}` !== key) {
          return false;
        }
        const resumedAt = parseUtcInstant(resumption.resumedAt);
        return (
          resumedAt > parseUtcInstant(anchor?.at ?? item.at) &&
          resumedAt <= parseUtcInstant(item.at)
        );
      });
      if (withinMerge && !resumedBetween) {
        mergedCount += 1;
        continue;
      }
      anchor = item;
      merged.push(item);
    }
  }
  return { merged, mergedCount, unresolved };
}

export function computeRecovery(
  vlus: readonly AcceptedVlu[],
  dataset: MetricsDataset,
): RecoveryMetrics & { gaps: GapTally } {
  const canonical = canonicalSubjectIndex(dataset.accountMerges);
  const gaps: GapTally = {};
  for (const interruption of dataset.interruptions ?? []) {
    if (resolveInterruptedAt(interruption).status === "undefined-by-spec") {
      tallyGap(gaps, "interruption-session-exit-anchor");
    }
  }
  const merged = mergeInterruptions(
    dataset.interruptions ?? [],
    dataset.resumptions ?? [],
    canonical,
  );
  const observation = dataset.recoveryObservation ?? null;
  const usable = merged.merged.filter((item) => {
    if (!observation) return true;
    return isWithin(item.at, observation.start, observation.end);
  });

  const firstPerUser = new Map<string, ResolvedInterruption>();
  for (const item of usable.sort(
    (left, right) => parseUtcInstant(left.at) - parseUtcInstant(right.at),
  )) {
    if (!firstPerUser.has(item.subjectRef)) firstPerUser.set(item.subjectRef, item);
  }

  const cutoffMs = parseUtcInstant(dataset.cutoff);
  const vluByUser = new Map<string, AcceptedVlu[]>();
  for (const vlu of vlus) {
    const list = vluByUser.get(vlu.subjectRef) ?? [];
    list.push(vlu);
    vluByUser.set(vlu.subjectRef, list);
  }

  let denominator = 0;
  let numerator = 0;
  let observing = 0;
  let late = 0;
  let withoutPrior = 0;

  for (const [user, interruption] of firstPerUser) {
    const atMs = parseUtcInstant(interruption.at);
    const userVlus = (vluByUser.get(user) ?? []).sort(
      (left, right) => parseUtcInstant(left.validatedAt) - parseUtcInstant(right.validatedAt),
    );
    // 前置条件：用户已有至少一个 VLU（§6.1）。
    if (!userVlus.some((vlu) => parseUtcInstant(vlu.validatedAt) <= atMs)) {
      withoutPrior += 1;
      continue;
    }
    if (atMs + RECOVERY_WINDOW_MS > cutoffMs) {
      observing += 1;
      continue;
    }
    denominator += 1;
    const windowEndMs = atMs + RECOVERY_WINDOW_MS;
    const subsequent = userVlus.filter((vlu) => parseUtcInstant(vlu.validatedAt) > atMs);
    const recovered = subsequent.some((vlu) => parseUtcInstant(vlu.validatedAt) < windowEndMs);
    if (recovered) {
      numerator += 1;
      continue;
    }
    const firstSubsequent = subsequent[0];
    // 恰逢第 72 小时及以后才形成 VLU：不进主窗口，可列入迟到恢复（§6.2）。
    if (firstSubsequent && parseUtcInstant(firstSubsequent.validatedAt) >= windowEndMs) {
      late += 1;
    }
  }

  return {
    rate: rate(numerator, denominator),
    observingUsers: observing,
    lateRecoveryUsers: late,
    interruptionsWithoutPriorVlu: withoutPrior,
    mergedInterruptions: merged.mergedCount,
    unresolvedInterruptions: merged.unresolved,
    observation: { start: observation?.start ?? null, end: observation?.end ?? null },
    gaps,
  };
}

// ---------------------------------------------------------------------------
// 第 7 节：延迟检验触达率与正确率
// ---------------------------------------------------------------------------

export type DelayedCheckMetrics = {
  reach: Rate;
  accuracy: Rate;
  resultDistribution: Record<ResultCode, number>;
  originVlus: number;
  observingOriginVlus: number;
  unverifiablePairs: number;
  sameContentRejections: number;
  nonDelivery: Record<DelayedNonDelivery["reason"], number>;
  gaps: GapTally;
};

function emptyDistribution(): Record<ResultCode, number> {
  return { correct: 0, partial: 0, incorrect: 0, unjudgeable: 0 };
}

// 延迟检验窗口 `[origin_validated_at + 7d, +14d)`；必须同技能、不同规范化内容、
// 带 origin_vlu_ref 且独立满足第 2 节全部条件（§7）。
export function computeDelayedCheck(
  vlus: readonly AcceptedVlu[],
  dataset: MetricsDataset,
): DelayedCheckMetrics {
  const gaps: GapTally = {};
  const cutoffMs = parseUtcInstant(dataset.cutoff);
  const byRef = new Map<string, AcceptedVlu>();
  for (const vlu of vlus) byRef.set(vlu.vluRef, vlu);
  const delayedByOrigin = new Map<string, AcceptedVlu[]>();
  for (const vlu of vlus) {
    if (vlu.originVluRef === null) continue;
    const list = delayedByOrigin.get(vlu.originVluRef) ?? [];
    list.push(vlu);
    delayedByOrigin.set(vlu.originVluRef, list);
  }

  const pairSeen = new Set<string>();
  let pairDenominator = 0;
  let pairNumerator = 0;
  let observing = 0;
  let unverifiable = 0;
  let sameContent = 0;
  let originCount = 0;
  let accuracyDenominator = 0;
  let accuracyNumerator = 0;
  const distribution = emptyDistribution();

  for (const origin of vlus) {
    if (origin.originVluRef !== null) continue;
    originCount += 1;
    const windowStart = addDays(origin.validatedAt, 7);
    const windowEnd = addDays(origin.validatedAt, 14);
    if (parseUtcInstant(windowEnd) > cutoffMs) {
      observing += 1;
      continue;
    }

    // 注意：若原 VLU 的来源被删除/撤回，原 VLU 本身已在 §2.2 层被判无效，
    // 该 user—skill 对随之整体消失，而不是留在分母里（§1“按保留记录重算”）。

    const checks = (delayedByOrigin.get(origin.vluRef) ?? []).sort(
      (left, right) => parseUtcInstant(left.validatedAt) - parseUtcInstant(right.validatedAt),
    );
    const qualified: AcceptedVlu[] = [];
    for (const check of checks) {
      if (!isWithin(check.validatedAt, windowStart, windowEnd)) continue;
      const sharedSkill = check.skillRefs.some((skill) => origin.skillRefs.includes(skill));
      if (!sharedSkill) continue;
      if (check.normalizedContentRef === null || origin.normalizedContentRef === null) {
        tallyGap(gaps, "normalized-content-key");
        unverifiable += 1;
        continue;
      }
      if (check.normalizedContentRef === origin.normalizedContentRef) {
        sameContent += 1;
        continue;
      }
      qualified.push(check);
    }
    // 分母是“已完整经过 14 天窗口且来源仍有效的用户—技能数”，与是否触达无关。
    for (const skill of origin.skillRefs) {
      const pairKey = `${origin.subjectRef}|${skill}`;
      if (pairSeen.has(pairKey)) continue;
      pairSeen.add(pairKey);
      pairDenominator += 1;
      if (qualified.some((check) => check.skillRefs.includes(skill))) pairNumerator += 1;
    }

    const firstCheck = qualified[0];
    if (!firstCheck) continue;
    distribution[firstCheck.resultCode] += 1;
    if (firstCheck.rubricKind !== "binary") continue;
    if (firstCheck.resultCode === "partial") {
      // 二元量规却给出 partial：是否计为“不正确”未定义，不替定义稿做决定。
      tallyGap(gaps, "partial-result-binary-aggregation");
      continue;
    }
    accuracyDenominator += 1;
    if (firstCheck.resultCode === "correct") accuracyNumerator += 1;
    // unjudgeable 仍留在分母，单独披露，不能事后删除以提高比例（§7）。
  }

  const nonDelivery: Record<DelayedNonDelivery["reason"], number> = {
    not_invited: 0,
    not_answered: 0,
    content_withdrawn: 0,
    not_generated: 0,
  };
  for (const item of dataset.delayedNonDelivery ?? []) {
    if (byRef.has(item.originVluRef)) nonDelivery[item.reason] += 1;
  }

  return {
    reach: rate(pairNumerator, pairDenominator),
    // 没有可汇总的二元结果时（无量规或全部 partial）报 N/A，只报分布（§7）。
    accuracy:
      accuracyDenominator === 0
        ? {
            status: "na",
            numerator: accuracyNumerator,
            denominator: accuracyDenominator,
            reason: "binary-rubric-not-applicable",
          }
        : rate(accuracyNumerator, accuracyDenominator),
    resultDistribution: distribution,
    originVlus: originCount,
    observingOriginVlus: observing,
    unverifiablePairs: unverifiable,
    sameContentRejections: sameContent,
    nonDelivery,
    gaps,
  };
}

// ---------------------------------------------------------------------------
// 重算（删除/撤回后）：给定事件集合，重算 = 用新集合再算一次（§1、事件字典 §3.3）
// ---------------------------------------------------------------------------

export type RejectionCount = {
  status: VluRejection["status"];
  code: VluRejectionCode;
  count: number;
};

export type MetricsReport = {
  cutoff: string;
  vlu: {
    accepted: AcceptedVlu[];
    rejectionCounts: RejectionCount[];
  };
  wvlu: WeeklyVluMetrics[];
  activation: ActivationMetrics;
  retention: { w1: RetentionMetrics; w4: RetentionMetrics };
  recovery: RecoveryMetrics;
  delayedCheck: DelayedCheckMetrics;
  specGaps: SpecGapReport[];
};

function countRejections(rejections: readonly VluRejection[]): RejectionCount[] {
  const counts = new Map<string, RejectionCount>();
  for (const item of rejections) {
    const key = `${item.status}|${item.code}`;
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { status: item.status, code: item.code, count: 1 });
  }
  return [...counts.values()].sort(
    (left, right) => left.code.localeCompare(right.code) || left.status.localeCompare(right.status),
  );
}

export function computeMetrics(dataset: MetricsDataset): MetricsReport {
  const selection = selectVlus(dataset);
  const activation = computeActivation(selection.accepted, dataset);
  const recovery = computeRecovery(selection.accepted, dataset);
  const delayedCheck = computeDelayedCheck(selection.accepted, dataset);
  return {
    cutoff: dataset.cutoff,
    vlu: {
      accepted: selection.accepted,
      rejectionCounts: countRejections(selection.rejections),
    },
    wvlu: computeWeeklyVlu(selection.accepted, dataset),
    activation: {
      window: activation.window,
      cutoff: activation.cutoff,
      overall: activation.overall,
      lateFirstVluUsers: activation.lateFirstVluUsers,
      observingUsers: activation.observingUsers,
      firstVluBeforeEntryUsers: activation.firstVluBeforeEntryUsers,
      attributionUndefinedUsers: activation.attributionUndefinedUsers,
      entryExclusions: activation.entryExclusions,
      bySubjectGroup: activation.bySubjectGroup,
      gaps: activation.gaps,
    },
    retention: {
      w1: computeRetention(selection.accepted, dataset, "W1"),
      w4: computeRetention(selection.accepted, dataset, "W4"),
    },
    recovery: {
      rate: recovery.rate,
      observingUsers: recovery.observingUsers,
      lateRecoveryUsers: recovery.lateRecoveryUsers,
      interruptionsWithoutPriorVlu: recovery.interruptionsWithoutPriorVlu,
      mergedInterruptions: recovery.mergedInterruptions,
      unresolvedInterruptions: recovery.unresolvedInterruptions,
      observation: recovery.observation,
    },
    delayedCheck: {
      reach: delayedCheck.reach,
      accuracy: delayedCheck.accuracy,
      resultDistribution: delayedCheck.resultDistribution,
      originVlus: delayedCheck.originVlus,
      observingOriginVlus: delayedCheck.observingOriginVlus,
      unverifiablePairs: delayedCheck.unverifiablePairs,
      sameContentRejections: delayedCheck.sameContentRejections,
      nonDelivery: delayedCheck.nonDelivery,
      gaps: delayedCheck.gaps,
    },
    specGaps: buildGapReport(selection.gaps, activation.gaps, recovery.gaps, delayedCheck.gaps),
  };
}

/** 追加失效事实（不覆盖传入对象）。删除水位由 CL-011b 在事件层实现，这里只做集合替换。 */
export function withInvalidations(
  dataset: MetricsDataset,
  invalidations: readonly SourceInvalidation[],
): MetricsDataset {
  const merged = new Map<string, SourceInvalidation>();
  for (const item of dataset.invalidations ?? []) merged.set(item.sourceVersionRef, item);
  for (const item of invalidations) merged.set(item.sourceVersionRef, item);
  return { ...dataset, invalidations: [...merged.values()] };
}

/**
 * 删除/撤回后的重算：用新事件集合再算一次，并返回前后两份快照。
 * 纯函数不修改已发布快照；迟到事件与新删除水位进入下一次重算（第 9 节）。
 */
export function recomputeAfterInvalidation(
  dataset: MetricsDataset,
  invalidations: readonly SourceInvalidation[],
): { previous: MetricsReport; next: MetricsReport } {
  return {
    previous: computeMetrics(dataset),
    next: computeMetrics(withInvalidations(dataset, invalidations)),
  };
}
