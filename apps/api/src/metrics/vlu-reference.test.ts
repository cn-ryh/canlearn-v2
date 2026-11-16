// CL-011a 指标参考实现的回归测试。
// 每个用例标题以定义稿条款编号开头，便于把“定义 → 实现 → 用例”三向对齐。
// 这里只验证纯函数口径，不证明真实事件投递、权限、删除副本清理或生产指标。
import { describe, expect, it } from "vitest";
import {
  type AssessmentFact,
  addDays,
  addHours,
  assessContentQuality,
  buildEvaluationContext,
  buildGapReport,
  computeActivation,
  computeDelayedCheck,
  computeMetrics,
  computeRecovery,
  computeRetention,
  type EntryFact,
  evaluateEntry,
  evaluateVlu,
  firstVluByUser,
  hintEvidenceGrade,
  type InterruptionFact,
  isWithin,
  type MetricsDataset,
  parseUtcInstant,
  rate,
  recomputeAfterInvalidation,
  resolveInterruptedAt,
  type SourceInvalidation,
  selectWal,
  type TaskFact,
  weekStart,
  withInvalidations,
} from "./vlu-reference.js";

const SUBJECT = "S-U1";
const ALT_SUBJECT = "S-U2";

function task(overrides: Partial<TaskFact> = {}): TaskFact {
  return {
    subjectRef: SUBJECT,
    taskRef: "T1",
    taskVersionRef: "TV1",
    startedAt: "2026-01-02T09:00:00Z",
    startedByUser: true,
    completionKind: "submitted",
    entryKind: "public_unit",
    primarySubject: "408",
    sourceVersionRefs: ["SV1"],
    ...overrides,
  };
}

function assessment(overrides: Partial<AssessmentFact> = {}): AssessmentFact {
  return {
    subjectRef: SUBJECT,
    taskRef: "T1",
    taskVersionRef: "TV1",
    assessmentRef: "A1",
    assessmentVersionRef: "AV1",
    attemptRef: "AT1",
    gradeVersionRef: "G1",
    submittedAt: "2026-01-03T09:50:00Z",
    validatedAt: "2026-01-03T10:00:00Z",
    resultCode: "incorrect",
    rubricKind: "binary",
    scoreRuleSupportsResult: true,
    hintLevel: 0,
    answerExposed: false,
    responseRef: "R1",
    qualityState: "curated",
    purpose: "learning_evidence",
    skillRefs: ["SK1"],
    sourceVersionRefs: ["SV1"],
    sourceBlockRefs: ["SB1"],
    normalizedContentRef: "C1",
    originVluRef: null,
    ...overrides,
  };
}

function entry(overrides: Partial<EntryFact> = {}): EntryFact {
  return {
    subjectRef: SUBJECT,
    enteredAt: "2026-01-01T08:00:00Z",
    entryKind: "public_unit",
    primarySubject: "408",
    actuallyEntered: true,
    ...overrides,
  };
}

function dataset(overrides: Partial<MetricsDataset> = {}): MetricsDataset {
  return {
    cutoff: "2026-06-01T00:00:00Z",
    tasks: [task()],
    assessments: [assessment()],
    entries: [entry()],
    ...overrides,
  };
}

const firstVlus = (data: MetricsDataset) => computeMetrics(data).vlu.accepted;

describe("§1 共同口径：UTC 时间与周一自然周", () => {
  it("§1 只接受带 Z 的 UTC 时间戳，带偏移量的本地时间不做静默换算", () => {
    expect(parseUtcInstant("2026-01-05T00:00:00Z")).toBe(Date.parse("2026-01-05T00:00:00Z"));
    expect(() => parseUtcInstant("2026-01-05T00:00:00+08:00")).toThrow("UTC_INSTANT_REQUIRED");
    expect(() => parseUtcInstant("2026-01-05T00:00:00")).toThrow("UTC_INSTANT_REQUIRED");
  });

  it("§1 自然周以周一 00:00 起算：周一 00:00 属新一周，前一日 23:59:59 仍属上一周", () => {
    expect(weekStart("2026-01-05T00:00:00Z")).toBe("2026-01-05T00:00:00.000Z");
    expect(weekStart("2026-01-04T23:59:59Z")).toBe("2025-12-29T00:00:00.000Z");
    expect(weekStart("2026-01-08T12:00:00Z")).toBe("2026-01-05T00:00:00.000Z");
    expect(weekStart("2026-01-11T23:59:59Z")).toBe("2026-01-05T00:00:00.000Z");
  });

  it("§1 区间左闭右开：恰逢 end 不计入窗口", () => {
    expect(isWithin("2026-01-12T00:00:00Z", "2026-01-05T00:00:00Z", "2026-01-12T00:00:00Z")).toBe(
      false,
    );
    expect(isWithin("2026-01-11T23:59:59Z", "2026-01-05T00:00:00Z", "2026-01-12T00:00:00Z")).toBe(
      true,
    );
    expect(addHours("2026-01-05T00:00:00Z", 72)).toBe("2026-01-08T00:00:00.000Z");
    expect(addDays("2026-01-05T00:00:00Z", 28)).toBe("2026-02-02T00:00:00.000Z");
  });

  it("§3/§8.2 分母为零报 N/A，不得写成 0", () => {
    expect(rate(0, 0)).toEqual({
      status: "na",
      numerator: 0,
      denominator: 0,
      reason: "zero-denominator",
    });
    expect(rate(1, 2)).toEqual({ status: "value", numerator: 1, denominator: 2, value: 0.5 });
  });
});

describe("§2.1 条件 1：真实任务完成", () => {
  it("§2.1-1 用户主动开始并提交作答 → 形成 VLU（答错不妨碍）", () => {
    const evaluated = evaluateVlu(assessment(), selectContext(dataset()));
    expect(evaluated.status).toBe("vlu");
  });

  it("§2.1-1 系统自动把任务标为完成 → 不形成 VLU", () => {
    const evaluated = evaluateVlu(
      assessment(),
      selectContext(dataset({ tasks: [task({ completionKind: "auto_marked" })] })),
    );
    expect(evaluated).toMatchObject({ status: "not-vlu", code: "TASK_AUTO_COMPLETED" });
  });

  it("§2.1-1 只打开页面/未开始任务 → 不形成 VLU", () => {
    const evaluated = evaluateVlu(
      assessment(),
      selectContext(dataset({ tasks: [task({ startedByUser: false })] })),
    );
    expect(evaluated).toMatchObject({ status: "not-vlu", code: "TASK_NOT_STARTED_BY_USER" });
  });

  it("§2.1-1 撤回提交或没有作答产物 → 不形成 VLU", () => {
    expect(
      evaluateVlu(
        assessment(),
        selectContext(dataset({ tasks: [task({ completionKind: "recalled" })] })),
      ),
    ).toMatchObject({ status: "not-vlu", code: "TASK_NOT_COMPLETED" });
    expect(evaluateVlu(assessment({ responseRef: null }), selectContext(dataset()))).toMatchObject({
      status: "not-vlu",
      code: "RESPONSE_ARTIFACT_MISSING",
    });
  });

  it("§2.1-4 只有完成自报/模型自评 90% 而没有可信结果 → 不形成 VLU", () => {
    expect(
      evaluateVlu(assessment({ selfReportedOnly: true }), selectContext(dataset())),
    ).toMatchObject({ status: "not-vlu", code: "SELF_REPORTED_RESULT" });
    expect(
      evaluateVlu(assessment({ gradeVersionRef: null }), selectContext(dataset())),
    ).toMatchObject({ status: "not-vlu", code: "GRADE_VERSION_MISSING" });
  });

  it("§1 内部测试/机器人/刷量主体整条排除", () => {
    const evaluated = evaluateVlu(
      assessment(),
      selectContext(dataset({ excludedSubjects: [{ subjectRef: SUBJECT, reason: "bot" }] })),
    );
    expect(evaluated).toMatchObject({ status: "not-vlu", code: "OPERATOR_EXCLUDED" });
  });
});

describe("§2.1 条件 2：有效检验与内容质量门禁", () => {
  it("§2.1-2 已审校/试用生成内容可作为学习证据，但试用内容不得用于正式诊断", () => {
    expect(assessContentQuality("curated", "formal_diagnosis")).toEqual({
      status: "allowed",
      scope: "formal_diagnosis",
    });
    expect(assessContentQuality("trial_generated", "learning_evidence")).toEqual({
      status: "allowed",
      scope: "learning_evidence",
    });
    expect(assessContentQuality("trial_generated", "formal_diagnosis")).toEqual({
      status: "not-allowed",
      reason: "TRIAL_CONTENT_NOT_FORMAL_DIAGNOSIS",
    });
    for (const state of ["draft", "pending_review", "validation_failed", "withdrawn", "invalid"]) {
      expect(assessContentQuality(state, "learning_evidence")).toEqual({
        status: "not-allowed",
        reason: "CONTENT_QUALITY_GATE_FAILED",
      });
    }
    // 未知枚举不降级猜测为合格（事件字典 P04）。
    expect(assessContentQuality("brand_new_state", "learning_evidence")).toEqual({
      status: "unknown-state",
      state: "brand_new_state",
    });
  });

  it("§2.1-2 草稿/待审/校验失败内容作答 → 不形成 VLU", () => {
    for (const qualityState of ["draft", "pending_review", "validation_failed"]) {
      expect(evaluateVlu(assessment({ qualityState }), selectContext(dataset()))).toMatchObject({
        status: "not-vlu",
        code: "CONTENT_QUALITY_GATE_FAILED",
      });
    }
  });

  it("§2.1-2 试用内容用于正式诊断 → 不形成 VLU；用于学习证据 → 形成", () => {
    expect(
      evaluateVlu(
        assessment({ qualityState: "trial_generated", purpose: "formal_diagnosis" }),
        selectContext(dataset()),
      ),
    ).toMatchObject({ status: "not-vlu", code: "CONTENT_NOT_FORMAL_DIAGNOSIS" });
    expect(
      evaluateVlu(
        assessment({ qualityState: "trial_generated", purpose: "learning_evidence" }),
        selectContext(dataset()),
      ).status,
    ).toBe("vlu");
  });

  it("§2.1-2 先看答案再提交 → 不形成 VLU；曝光状态不可判定 → 标 indeterminate 并排除", () => {
    expect(
      evaluateVlu(assessment({ answerExposed: true }), selectContext(dataset())),
    ).toMatchObject({ status: "not-vlu", code: "ANSWER_EXPOSED" });
    expect(
      evaluateVlu(assessment({ answerExposed: null }), selectContext(dataset())),
    ).toMatchObject({ status: "indeterminate", code: "ANSWER_EXPOSURE_UNKNOWN" });
  });

  it("§2.1-2 使用提示但没有记录提示层级 → 不形成 VLU", () => {
    expect(evaluateVlu(assessment({ hintLevel: null }), selectContext(dataset()))).toMatchObject({
      status: "not-vlu",
      code: "HINT_LEVEL_MISSING",
    });
  });

  it("§9 提示层级如何影响证据等级属未决项 → 返回 undefined-by-spec 而不是自行判定", () => {
    const result = hintEvidenceGrade(2);
    expect(result.status).toBe("undefined-by-spec");
    expect(result.gap).toBe("hint-level-grading");
    expect(result.reason).toContain("hint_level=2");
  });
});

describe("§2.1 条件 3/4：来源、技能与可信结果", () => {
  it("§2.1-3 无技能、无来源或来源区块无法定位 → 不形成 VLU", () => {
    expect(evaluateVlu(assessment({ skillRefs: [] }), selectContext(dataset()))).toMatchObject({
      status: "not-vlu",
      code: "SKILL_MISSING",
    });
    expect(
      evaluateVlu(assessment({ sourceVersionRefs: [] }), selectContext(dataset())),
    ).toMatchObject({ status: "not-vlu", code: "SOURCE_MISSING" });
    expect(
      evaluateVlu(assessment(), selectContext(dataset({ unresolvableSourceBlockRefs: ["SB1"] }))),
    ).toMatchObject({ status: "not-vlu", code: "SOURCE_BLOCK_UNRESOLVED" });
  });

  it("§2.1-4 部分正确但评分规则支持该结果 → 仍形成 VLU", () => {
    expect(
      evaluateVlu(
        assessment({ resultCode: "partial", rubricKind: "partial-capable" }),
        selectContext(dataset()),
      ).status,
    ).toBe("vlu");
  });

  it("§2.1-4 评分规则不支持部分正确/无法判定 → 记录不可复核，不形成 VLU", () => {
    expect(
      evaluateVlu(
        assessment({ resultCode: "partial", scoreRuleSupportsResult: false }),
        selectContext(dataset()),
      ),
    ).toMatchObject({ status: "not-vlu", code: "RESULT_NOT_SUPPORTED_BY_RULE" });
    expect(
      evaluateVlu(
        assessment({ resultCode: "unjudgeable", scoreRuleSupportsResult: false }),
        selectContext(dataset()),
      ),
    ).toMatchObject({ status: "not-vlu", code: "RESULT_NOT_SUPPORTED_BY_RULE" });
  });
});

describe("§2.2 去重与归属", () => {
  it("§2.2 同一业务唯一键的重放与重复作答只计一个 VLU", () => {
    const replay = assessment({ attemptRef: "AT2", validatedAt: "2026-01-03T11:00:00Z" });
    const accepted = firstVlus(dataset({ assessments: [assessment(), replay] }));
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.attemptRef).toBe("AT1");
  });

  it("§2.2 同一任务修改题目版本后仍最多一个 VLU", () => {
    const second = assessment({
      assessmentVersionRef: "AV2",
      attemptRef: "AT2",
      validatedAt: "2026-01-04T10:00:00Z",
      normalizedContentRef: "C2",
    });
    expect(firstVlus(dataset({ assessments: [assessment(), second] }))).toHaveLength(1);
  });

  it("§2.2 换皮/复制题目成新任务 → 规范化内容相同，不新增 VLU", () => {
    const copyTask = task({ taskRef: "T2", taskVersionRef: "TV2" });
    const copyAssessment = assessment({
      taskRef: "T2",
      taskVersionRef: "TV2",
      assessmentRef: "A2",
      attemptRef: "AT2",
      validatedAt: "2026-01-04T10:00:00Z",
    });
    const accepted = firstVlus(
      dataset({ tasks: [task(), copyTask], assessments: [assessment(), copyAssessment] }),
    );
    expect(accepted).toHaveLength(1);
  });

  it("§2.2 内容实质变化并重新通过门禁 → 可作为新检验形成 VLU", () => {
    const freshAssessment = assessment({
      taskRef: "T2",
      taskVersionRef: "TV2",
      assessmentRef: "A2",
      attemptRef: "AT2",
      normalizedContentRef: "C2",
      validatedAt: "2026-01-04T10:00:00Z",
    });
    const accepted = firstVlus(
      dataset({
        tasks: [task(), task({ taskRef: "T2", taskVersionRef: "TV2" })],
        assessments: [assessment(), freshAssessment],
      }),
    );
    expect(accepted).toHaveLength(2);
  });

  it("§2.2/§9 缺少规范化内容键时无法证明内容实质变化 → undefined-by-spec 并排除", () => {
    const noKey = assessment({
      taskRef: "T2",
      taskVersionRef: "TV2",
      assessmentRef: "A2",
      attemptRef: "AT2",
      normalizedContentRef: null,
      validatedAt: "2026-01-04T10:00:00Z",
    });
    const selection = computeMetrics(
      dataset({
        tasks: [task(), task({ taskRef: "T2", taskVersionRef: "TV2" })],
        assessments: [assessment(), noKey],
      }),
    );
    expect(selection.vlu.accepted).toHaveLength(1);
    const gap = selection.specGaps.find((item) => item.id === "normalized-content-key");
    expect(gap?.occurrences).toBe(1);
  });

  it("§2.2 同题拆成多个任务不增加 VLU，且拒绝原因可追溯", () => {
    const split = assessment({
      taskRef: "T3",
      taskVersionRef: "TV3",
      assessmentRef: "A1",
      attemptRef: "AT3",
      normalizedContentRef: "C1",
      validatedAt: "2026-01-05T10:00:00Z",
    });
    const report = computeMetrics(
      dataset({
        tasks: [
          task(),
          task({ taskRef: "T3", taskVersionRef: "TV3", startedAt: "2026-01-05T08:00:00Z" }),
        ],
        assessments: [assessment(), split],
      }),
    );
    expect(report.vlu.accepted).toHaveLength(1);
    expect(report.vlu.rejectionCounts).toContainEqual({
      status: "not-vlu",
      code: "DUPLICATE_NORMALIZED_CONTENT",
      count: 1,
    });
  });
});

describe("§3 WVLU：周聚合与 WAL 分母", () => {
  it("§3 只有登录/阅读/上传（无主动开始任务）不进 WAL 分母", () => {
    const wal = selectWal(
      dataset({
        tasks: [task({ taskRef: "T1" }), task({ taskRef: "T2", startedByUser: false })],
      }),
    );
    expect(wal.usersByWeek.get("2025-12-29T00:00:00.000Z")?.size).toBe(1);
  });

  it("§3 周内开始任务的用户即使没有 VLU 也进分母；人均值按文档示例为 12/20=0.60", () => {
    const tasks: TaskFact[] = [];
    const assessments: AssessmentFact[] = [];
    for (let index = 0; index < 20; index += 1) {
      const subjectRef = `S-${index}`;
      const startedAt = "2026-01-06T09:00:00Z";
      tasks.push(task({ subjectRef, taskRef: `T-${index}`, taskVersionRef: "TV1", startedAt }));
      // 前 4 人各 2 个 VLU，第 5—8 人各 1 个，共 12 个；其余 12 人只有开始事实。
      const units = index < 4 ? 2 : index < 8 ? 1 : 0;
      for (let unit = 0; unit < units; unit += 1) {
        if (unit > 0) {
          tasks.push(
            task({
              subjectRef,
              taskRef: `T-${index}-${unit}`,
              taskVersionRef: "TV1",
              startedAt,
            }),
          );
        }
        assessments.push(
          assessment({
            subjectRef,
            taskRef: `T-${index}${unit > 0 ? `-${unit}` : ""}`,
            assessmentRef: `A-${index}-${unit}`,
            attemptRef: `AT-${index}-${unit}`,
            normalizedContentRef: `C-${index}-${unit}`,
            validatedAt: "2026-01-06T10:00:00Z",
          }),
        );
      }
    }
    const report = computeMetrics(
      dataset({ tasks, assessments, entries: [], cutoff: "2026-01-20T00:00:00Z" }),
    );
    const week = report.wvlu.find((item) => item.week === "2026-01-05T00:00:00.000Z");
    expect(week?.wal).toBe(20);
    expect(week?.vluTotal).toBe(12);
    expect(week?.wvluPerWal).toMatchObject({ status: "value", value: 0.6 });
    expect(week?.usersWithVlu).toBe(8);
    expect(week?.medianVluPerUser).toBe(1.5);
  });

  it("§3 某周有 VLU 但无 WAL（任务在上一周开始）→ 人均报 N/A 而不是 0", () => {
    const report = computeMetrics(
      dataset({
        tasks: [task({ startedAt: "2026-01-04T09:00:00Z" })],
        assessments: [assessment({ validatedAt: "2026-01-05T10:00:00Z" })],
        entries: [],
        cutoff: "2026-01-20T00:00:00Z",
      }),
    );
    const week = report.wvlu.find((item) => item.week === "2026-01-05T00:00:00.000Z");
    expect(week?.vluTotal).toBe(1);
    expect(week?.wal).toBe(0);
    expect(week?.wvluPerWal).toMatchObject({ status: "na", reason: "zero-denominator" });
  });
});

describe("§4.1 首个 VLU 激活（7 日主口径）", () => {
  const matureDataset = (assessments: AssessmentFact[], entries: EntryFact[] = [entry()]) =>
    dataset({ assessments, entries, cutoff: "2026-06-01T00:00:00Z" });

  it("§4.1 入口后 7×24 小时内形成首个 VLU → 计入分子", () => {
    const metrics = computeActivation(
      firstVlus(matureDataset([assessment({ validatedAt: "2026-01-07T23:59:59Z" })])),
      matureDataset([assessment({ validatedAt: "2026-01-07T23:59:59Z" })]),
    );
    expect(metrics.overall).toMatchObject({ numerator: 1, denominator: 1, rate: { value: 1 } });
  });

  it("§4.1 恰逢 entry_at + 7×24h 才形成 VLU → 不计入 7 日激活，单独记为迟到", () => {
    const data = matureDataset([assessment({ validatedAt: "2026-01-08T08:00:00Z" })]);
    const metrics = computeActivation(firstVlus(data), data);
    expect(metrics.overall).toMatchObject({ numerator: 0, denominator: 1 });
    expect(metrics.lateFirstVluUsers).toBe(1);
  });

  it("§4.1 入口未满 7×24 小时 → 观察中，不进分母也不按失败处理", () => {
    const data = dataset({
      assessments: [],
      entries: [entry({ enteredAt: "2026-05-30T00:00:00Z" })],
      cutoff: "2026-06-01T00:00:00Z",
    });
    const metrics = computeActivation(firstVlus(data), data);
    expect(metrics.overall).toMatchObject({ numerator: 0, denominator: 0 });
    expect(metrics.overall.rate).toMatchObject({ status: "na" });
    expect(metrics.observingUsers).toBe(1);
  });

  it("§4.1 仅注册、上传未成功、解析成功但无可用章节都不是合格入口", () => {
    expect(
      evaluateEntry(
        entry({ entryKind: "private_source", admissionConfirmed: true, usableSectionCount: 0 }),
      ),
    ).toEqual({ status: "not-qualified", code: "ENTRY_NO_USABLE_SECTION" });
    expect(
      evaluateEntry(entry({ entryKind: "private_source", admissionConfirmed: false })),
    ).toEqual({ status: "not-qualified", code: "ENTRY_NOT_ADMITTED" });
    expect(evaluateEntry(entry({ actuallyEntered: false }))).toEqual({
      status: "not-qualified",
      code: "ENTRY_NOT_ENTERED",
    });
    expect(evaluateEntry(entry())).toEqual({ status: "qualified" });
  });

  it("§4.1 私有资料准入成功且至少一个可学习章节可用 → 合格入口；状态不明不猜测", () => {
    expect(
      evaluateEntry(
        entry({ entryKind: "private_source", admissionConfirmed: true, usableSectionCount: 2 }),
      ),
    ).toEqual({ status: "qualified" });
    expect(evaluateEntry(entry({ entryKind: "private_source", admissionConfirmed: true }))).toEqual(
      { status: "indeterminate", code: "ENTRY_SECTIONS_INDETERMINATE" },
    );
  });

  it("§4.1 激活按第一次入口的主学科分群，后续换学科不重复激活", () => {
    const data = dataset({
      tasks: [task({ primarySubject: "408" })],
      assessments: [assessment({ validatedAt: "2026-01-03T10:00:00Z" })],
      entries: [
        entry({ enteredAt: "2026-01-01T08:00:00Z", primarySubject: "408" }),
        entry({ enteredAt: "2026-01-20T08:00:00Z", primarySubject: "CET" }),
      ],
      cutoff: "2026-06-01T00:00:00Z",
    });
    const metrics = computeActivation(firstVlus(data), data);
    expect(metrics.overall).toMatchObject({ numerator: 1, denominator: 1 });
    expect(metrics.bySubjectGroup["408"]).toMatchObject({ numerator: 1, denominator: 1 });
    expect(metrics.bySubjectGroup.CET).toMatchObject({ numerator: 0, denominator: 0 });
  });

  it("§4.1/§1 合并账户保留映射：同一人两个原账户不产生第二个全局首个 VLU", () => {
    const merged = dataset({
      tasks: [
        task({ subjectRef: "S-A", taskRef: "T1" }),
        task({ subjectRef: "S-B", taskRef: "T2" }),
      ],
      assessments: [
        assessment({ subjectRef: "S-A", taskRef: "T1", validatedAt: "2026-01-03T10:00:00Z" }),
        assessment({
          subjectRef: "S-B",
          taskRef: "T2",
          assessmentRef: "A2",
          attemptRef: "AT2",
          normalizedContentRef: "C2",
          validatedAt: "2026-01-06T10:00:00Z",
        }),
      ],
      entries: [
        entry({ subjectRef: "S-A", enteredAt: "2026-01-01T08:00:00Z" }),
        entry({ subjectRef: "S-B", enteredAt: "2026-01-02T08:00:00Z" }),
      ],
      accountMerges: [{ from: "S-B", into: "S-A" }],
      cutoff: "2026-06-01T00:00:00Z",
    });
    const accepted = firstVlus(merged);
    expect(accepted.map((vlu) => vlu.subjectRef)).toEqual(["S-A", "S-A"]);
    expect(firstVluByUser(accepted).size).toBe(1);
    const report = computeMetrics(merged);
    // 两个原账户同日历周内的入口合并后归属未定义，显式披露而不是任选一个。
    expect(report.activation.attributionUndefinedUsers).toBe(1);
    expect(report.activation.overall.denominator).toBe(0);
    expect(
      report.specGaps.find((gap) => gap.id === "account-merge-entry-attribution")?.occurrences,
    ).toBe(1);
  });

  it("§4.1 同一时刻出现两个不同主学科的合格入口 → 首个入口主学科无法归属，显式披露", () => {
    const data = dataset({
      assessments: [assessment({ validatedAt: "2026-01-03T10:00:00Z" })],
      entries: [
        entry({ enteredAt: "2026-01-01T08:00:00Z", primarySubject: "408" }),
        entry({ enteredAt: "2026-01-01T08:00:00Z", primarySubject: "CET" }),
      ],
      cutoff: "2026-06-01T00:00:00Z",
    });
    const report = computeMetrics(data);
    expect(report.activation.entryExclusions.ENTRY_ATTRIBUTION_TIE).toBe(1);
    expect(report.activation.overall.denominator).toBe(0);
    expect(report.specGaps.find((gap) => gap.id === "entry-attribution-tie")?.occurrences).toBe(1);
  });

  it("§8.2 未激活用户不进 W4 分母（激活与留存的解剖对象不同）", () => {
    const data = dataset({
      assessments: [],
      entries: [entry()],
      cutoff: "2026-06-01T00:00:00Z",
    });
    const metrics = computeActivation(firstVlus(data), data);
    expect(metrics.overall).toMatchObject({ numerator: 0, denominator: 1 });
    expect(computeRetention([], data, "W4").rate).toMatchObject({
      status: "na",
      denominator: 0,
    });
  });
});

describe("§5 W1/W4 留存（自然周窗口）", () => {
  // 2026-01-08（周四）激活 → W0 为 01-05，W1 为 01-12..01-19，W4 为 02-02..02-09。
  const origin = assessment({ validatedAt: "2026-01-08T10:00:00Z" });
  const second = assessment({
    taskRef: "T2",
    taskVersionRef: "TV2",
    assessmentRef: "A2",
    attemptRef: "AT2",
    normalizedContentRef: "C2",
    validatedAt: "2026-01-15T10:00:00Z",
  });
  const baseTasks = [task(), task({ taskRef: "T2", taskVersionRef: "TV2" })];

  it("§5 W0 后第 1 个完整自然周内有新 VLU → W1 留存", () => {
    const data = dataset({
      tasks: baseTasks,
      assessments: [origin, second],
      cutoff: "2026-03-01T00:00:00Z",
    });
    const metrics = computeRetention(firstVlus(data), data, "W1");
    expect(metrics.rate).toMatchObject({ numerator: 1, denominator: 1, value: 1 });
    expect(metrics.cohorts[0]?.activationWeek).toBe("2026-01-05T00:00:00.000Z");
  });

  it("§5 恰逢 W1 窗口 end 的 VLU 不算 W1 留存；W4 独立判断不要求 W1", () => {
    const edge = { ...second, validatedAt: "2026-01-19T00:00:00Z" };
    const w4 = {
      ...second,
      taskRef: "T3",
      taskVersionRef: "TV3",
      assessmentRef: "A3",
      attemptRef: "AT3",
      normalizedContentRef: "C3",
      validatedAt: "2026-02-05T10:00:00Z",
    };
    const data = dataset({
      tasks: [...baseTasks, task({ taskRef: "T3", taskVersionRef: "TV3" })],
      assessments: [origin, edge, w4],
      cutoff: "2026-03-01T00:00:00Z",
    });
    const vlus = firstVlus(data);
    expect(computeRetention(vlus, data, "W1").rate).toMatchObject({ numerator: 0, denominator: 1 });
    expect(computeRetention(vlus, data, "W4").rate).toMatchObject({ numerator: 1, denominator: 1 });
  });

  it("§5 W4 窗口未完整结束 → 观察中，不进分母", () => {
    const data = dataset({
      tasks: baseTasks,
      assessments: [origin, second],
      cutoff: "2026-02-08T23:59:59Z",
    });
    const metrics = computeRetention(firstVlus(data), data, "W4");
    expect(metrics.rate).toMatchObject({ status: "na", denominator: 0 });
    expect(metrics.observingUsers).toBe(1);
  });

  it("§5 同一周多个 VLU 对二值留存只算一个用户", () => {
    const extra = {
      ...second,
      taskRef: "T3",
      taskVersionRef: "TV3",
      assessmentRef: "A3",
      attemptRef: "AT3",
      normalizedContentRef: "C3",
      validatedAt: "2026-01-16T10:00:00Z",
    };
    const data = dataset({
      tasks: [...baseTasks, task({ taskRef: "T3", taskVersionRef: "TV3" })],
      assessments: [origin, second, extra],
      cutoff: "2026-03-01T00:00:00Z",
    });
    expect(computeRetention(firstVlus(data), data, "W1").rate).toMatchObject({
      numerator: 1,
      denominator: 1,
    });
  });
});

describe("§6 中断后 72 小时恢复", () => {
  const prior = assessment({
    taskRef: "T0",
    taskVersionRef: "TV0",
    assessmentRef: "A0",
    attemptRef: "AT0",
    normalizedContentRef: "C0",
    validatedAt: "2026-02-20T10:00:00Z",
  });
  const interruption: InterruptionFact = {
    subjectRef: SUBJECT,
    interruptionRef: "I1",
    taskRef: "T0",
    taskVersionRef: "TV0",
    reasonCode: "user_pause",
    interruptedAt: "2026-03-01T10:00:00Z",
  };
  const recoveryTask = task({
    taskRef: "T9",
    taskVersionRef: "TV9",
    startedAt: "2026-03-01T12:00:00Z",
  });
  const recoveryVlu = assessment({
    taskRef: "T9",
    taskVersionRef: "TV9",
    assessmentRef: "A9",
    attemptRef: "AT9",
    normalizedContentRef: "C9",
    submittedAt: "2026-03-02T09:00:00Z",
    validatedAt: "2026-03-02T09:30:00Z",
  });

  it("§6.2 72 小时窗口内形成新 VLU → 计为恢复", () => {
    const data = dataset({
      tasks: [task({ taskRef: "T0", taskVersionRef: "TV0" }), recoveryTask],
      assessments: [prior, recoveryVlu],
      entries: [entry()],
      interruptions: [interruption],
      cutoff: "2026-03-10T00:00:00Z",
    });
    const metrics = computeRecovery(firstVlus(data), data);
    expect(metrics.rate).toMatchObject({ numerator: 1, denominator: 1 });
  });

  it("§6.2 恰逢第 72 小时才形成 VLU → 不进主窗口，列入迟到恢复", () => {
    const data = dataset({
      tasks: [task({ taskRef: "T0", taskVersionRef: "TV0" }), recoveryTask],
      assessments: [prior, { ...recoveryVlu, validatedAt: "2026-03-04T10:00:00Z" }],
      entries: [entry()],
      interruptions: [interruption],
      cutoff: "2026-03-10T00:00:00Z",
    });
    const metrics = computeRecovery(firstVlus(data), data);
    expect(metrics.rate).toMatchObject({ numerator: 0, denominator: 1 });
    expect(metrics.lateRecoveryUsers).toBe(1);
  });

  it("§6.1 用户尚无可计入的既有 VLU → 候选中断不进分母", () => {
    const data = dataset({
      tasks: [recoveryTask],
      assessments: [recoveryVlu],
      entries: [entry()],
      interruptions: [{ ...interruption, taskRef: "T9", taskVersionRef: "TV9" }],
      cutoff: "2026-03-10T00:00:00Z",
    });
    const metrics = computeRecovery(firstVlus(data), data);
    expect(metrics.rate).toMatchObject({ status: "na", denominator: 0 });
    expect(metrics.interruptionsWithoutPriorVlu).toBe(1);
  });

  it("§6.1 同任务 24 小时内重复离线合并为一个中断，取最早时间", () => {
    const data = dataset({
      tasks: [task({ taskRef: "T0", taskVersionRef: "TV0" }), recoveryTask],
      assessments: [prior, recoveryVlu],
      entries: [entry()],
      interruptions: [
        interruption,
        { ...interruption, interruptionRef: "I2", interruptedAt: "2026-03-01T20:00:00Z" },
      ],
      cutoff: "2026-03-10T00:00:00Z",
    });
    const metrics = computeRecovery(firstVlus(data), data);
    expect(metrics.mergedInterruptions).toBe(1);
    expect(metrics.rate).toMatchObject({ numerator: 1, denominator: 1 });
  });

  it("§6.1 无明确退出时 interrupted_at = 最后交互 + 30 分钟；异常退出锚点属未决项", () => {
    expect(
      resolveInterruptedAt({
        subjectRef: SUBJECT,
        interruptionRef: "I3",
        taskRef: "T0",
        taskVersionRef: "TV0",
        reasonCode: "inactive_30m",
        lastInteractionAt: "2026-03-01T09:00:00Z",
      }),
    ).toEqual({ status: "resolved", at: "2026-03-01T09:30:00.000Z" });
    expect(
      resolveInterruptedAt({
        subjectRef: SUBJECT,
        interruptionRef: "I4",
        taskRef: "T0",
        taskVersionRef: "TV0",
        reasonCode: "session_exit",
        interruptedAt: "2026-03-01T10:00:00Z",
      }),
    ).toMatchObject({ status: "undefined-by-spec", gap: "interruption-session-exit-anchor" });
  });

  it("§6.2 窗口未满 72 小时 → 观察中，不按失败处理", () => {
    const data = dataset({
      tasks: [task({ taskRef: "T0", taskVersionRef: "TV0" })],
      assessments: [prior],
      entries: [entry()],
      interruptions: [interruption],
      cutoff: "2026-03-03T00:00:00Z",
    });
    const metrics = computeRecovery(firstVlus(data), data);
    expect(metrics.rate).toMatchObject({ status: "na", denominator: 0 });
    expect(metrics.observingUsers).toBe(1);
  });
});

describe("§7 延迟检验", () => {
  const origin = assessment({
    taskRef: "T0",
    taskVersionRef: "TV0",
    assessmentRef: "A0",
    attemptRef: "AT0",
    normalizedContentRef: "C0",
    validatedAt: "2026-04-01T12:00:00Z",
  });
  const check = (overrides: Partial<AssessmentFact> = {}) =>
    assessment({
      taskRef: "T5",
      taskVersionRef: "TV5",
      assessmentRef: "A5",
      attemptRef: "AT5",
      normalizedContentRef: "C5",
      resultCode: "correct",
      validatedAt: "2026-04-10T12:00:00Z",
      originVluRef: `${SUBJECT}|T0|TV0|A0|AV1`,
      ...overrides,
    });

  const delayedDataset = (assessments: AssessmentFact[], cutoff = "2026-06-01T00:00:00Z") =>
    dataset({
      tasks: [
        task({ taskRef: "T0", taskVersionRef: "TV0" }),
        task({ taskRef: "T5", taskVersionRef: "TV5" }),
      ],
      assessments,
      entries: [entry()],
      cutoff,
    });

  it("§7 原 VLU 后 7—14 天内完成同技能不同内容检验 → 触达 + 正确", () => {
    const data = delayedDataset([origin, check()]);
    const metrics = computeDelayedCheck(firstVlus(data), data);
    expect(metrics.reach).toMatchObject({ numerator: 1, denominator: 1 });
    expect(metrics.accuracy).toMatchObject({ numerator: 1, denominator: 1 });
  });

  it("§7 恰逢第 14 天 end 的检验、或早于第 7 天的检验都不进主窗口", () => {
    for (const validatedAt of ["2026-04-15T12:00:00Z", "2026-04-03T12:00:00Z"]) {
      const data = delayedDataset([origin, check({ validatedAt })]);
      const metrics = computeDelayedCheck(firstVlus(data), data);
      expect(metrics.reach).toMatchObject({ numerator: 0, denominator: 1 });
    }
  });

  it("§7 同题/换皮（同规范化内容）不能算延迟触达：在 VLU 去重层就被拦下", () => {
    const data = delayedDataset([origin, check({ normalizedContentRef: "C0" })]);
    const report = computeMetrics(data);
    expect(report.delayedCheck.reach).toMatchObject({ numerator: 0, denominator: 1 });
    expect(report.vlu.rejectionCounts).toContainEqual({
      status: "not-vlu",
      code: "DUPLICATE_NORMALIZED_CONTENT",
      count: 1,
    });
  });

  it("§7 不同技能的新题不算该技能触达；正确率只用首次合格检验", () => {
    const data = delayedDataset([
      origin,
      check({ skillRefs: ["SK9"] }),
      check({
        attemptRef: "AT6",
        assessmentRef: "A6",
        validatedAt: "2026-04-11T12:00:00Z",
        resultCode: "incorrect",
      }),
    ]);
    const metrics = computeDelayedCheck(firstVlus(data), data);
    expect(metrics.reach).toMatchObject({ numerator: 0, denominator: 1 });
    expect(metrics.accuracy).toMatchObject({ numerator: 0, denominator: 0 });
  });

  it("§7 窗口未满 14 天 → 观察中；未触达原因分别报告而不是记成错误", () => {
    const data = delayedDataset([origin], "2026-04-10T00:00:00Z");
    const metrics = computeDelayedCheck(firstVlus(data), data);
    expect(metrics.observingOriginVlus).toBe(1);
    expect(metrics.reach).toMatchObject({ status: "na" });

    const withNonDelivery = {
      ...delayedDataset([origin]),
      delayedNonDelivery: [
        { originVluRef: `${SUBJECT}|T0|TV0|A0|AV1`, reason: "not_invited" as const },
        { originVluRef: `${SUBJECT}|T0|TV0|A0|AV1`, reason: "not_generated" as const },
      ],
    };
    const measured = computeDelayedCheck(firstVlus(withNonDelivery), withNonDelivery);
    expect(measured.nonDelivery.not_invited).toBe(1);
    expect(measured.nonDelivery.not_generated).toBe(1);
    expect(measured.nonDelivery.not_answered).toBe(0);
  });

  it("§7 原 VLU 来源被删除 → 原 VLU 整体失效，该 user—skill 对不留在延迟检验分母里", () => {
    const data = {
      ...delayedDataset([origin, check()]),
      invalidations: [
        {
          sourceVersionRef: "SV1",
          change: "deleted" as const,
          recordedAt: "2026-04-12T00:00:00Z",
        },
      ],
    };
    const report = computeMetrics(data);
    expect(report.delayedCheck.originVlus).toBe(0);
    expect(report.delayedCheck.reach).toMatchObject({ status: "na", denominator: 0 });
    expect(report.vlu.rejectionCounts).toContainEqual({
      status: "not-vlu",
      code: "SOURCE_INVALIDATED",
      count: 2,
    });
  });

  it("§7 二元量规出现 partial → undefined-by-spec，不强行并入正确率", () => {
    const data = delayedDataset([origin, check({ resultCode: "partial" })]);
    const metrics = computeDelayedCheck(firstVlus(data), data);
    expect(metrics.gaps["partial-result-binary-aggregation"]).toBe(1);
    expect(metrics.resultDistribution.partial).toBe(1);
  });
});

describe("§1/事件字典 §3.3 删除后重算", () => {
  const buildThreeUsers = (): MetricsDataset => {
    const tasks: TaskFact[] = [];
    const assessments: AssessmentFact[] = [];
    const entries: EntryFact[] = [];
    for (const [subjectRef, validation] of [
      [SUBJECT, "2026-01-03T10:00:00Z"],
      [ALT_SUBJECT, "2026-01-04T10:00:00Z"],
      ["S-U3", null],
    ] as const) {
      tasks.push(
        task({
          subjectRef,
          taskRef: `T-${subjectRef}`,
          taskVersionRef: "TV1",
          startedAt: "2026-01-02T09:00:00Z",
          sourceVersionRefs: [`SV-${subjectRef}`],
        }),
      );
      entries.push(entry({ subjectRef, enteredAt: "2026-01-01T08:00:00Z" }));
      if (validation) {
        assessments.push(
          assessment({
            subjectRef,
            taskRef: `T-${subjectRef}`,
            sourceVersionRefs: [`SV-${subjectRef}`],
            validatedAt: validation,
          }),
        );
      }
    }
    return dataset({ tasks, assessments, entries, cutoff: "2026-02-01T00:00:00Z" });
  };

  it("§1 来源删除后分子分母同步重算：2/3 → 1/3，WVLU 分母 3 → 2", () => {
    const before = buildThreeUsers();
    const invalidations: SourceInvalidation[] = [
      {
        sourceVersionRef: `SV-${SUBJECT}`,
        change: "deleted",
        recordedAt: "2026-01-20T00:00:00Z",
      },
    ];
    const { previous, next } = recomputeAfterInvalidation(before, invalidations);
    expect(previous.activation.overall).toMatchObject({ numerator: 2, denominator: 3 });
    expect(next.activation.overall).toMatchObject({ numerator: 1, denominator: 3 });
    const week = previous.wvlu[0];
    expect(week).toMatchObject({ vluTotal: 2, wal: 3 });
    expect(next.wvlu[0]).toMatchObject({ vluTotal: 1, wal: 2 });
  });

  it("§1 同一输入集合重算结果一致（幂等），且 corrective 更正不抹掉历史作答", () => {
    const base = buildThreeUsers();
    const invalidations: SourceInvalidation[] = [
      {
        sourceVersionRef: `SV-${SUBJECT}`,
        change: "withdrawn",
        recordedAt: "2026-01-20T00:00:00Z",
      },
    ];
    const first = withInvalidations(base, invalidations);
    const second = withInvalidations(first, invalidations);
    expect(computeMetrics(first)).toEqual(computeMetrics(second));
    expect(computeMetrics(base)).toEqual(computeMetrics(base));

    const corrected = withInvalidations(base, [
      {
        sourceVersionRef: `SV-${SUBJECT}`,
        change: "corrected",
        recordedAt: "2026-01-20T00:00:00Z",
      },
    ]);
    expect(computeMetrics(corrected).vlu.accepted).toHaveLength(2);
  });

  it("§9 无法判定答案曝光/来源版本的记录标 indeterminate 并计入排除，不默认按成功补齐", () => {
    const data = dataset({
      assessments: [assessment({ answerExposed: null })],
      entries: [entry()],
    });
    const report = computeMetrics(data);
    expect(report.vlu.accepted).toHaveLength(0);
    expect(report.vlu.rejectionCounts).toEqual([
      { status: "indeterminate", code: "ANSWER_EXPOSURE_UNKNOWN", count: 1 },
    ]);
  });
});

describe("§8.3/§9 候选阈值与未决项不进入实现", () => {
  it("§8.3 40% 激活线与 25% W4 线不出现在指标结果里（只是待验证假设）", () => {
    const data = dataset({ cutoff: "2026-06-01T00:00:00Z" });
    const report = computeMetrics(data);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("threshold");
    expect(serialized).not.toContain("target");
    expect(Object.keys(report).sort()).toEqual(
      [
        "activation",
        "cutoff",
        "delayedCheck",
        "retention",
        "recovery",
        "specGaps",
        "vlu",
        "wvlu",
      ].sort(),
    );
  });

  it("§9 SPEC_GAPS 全部带条款、原因和决定人，未决项不会被静默忽略", () => {
    const report = buildGapReport({ "normalized-content-key": 2 });
    const gap = report.find((item) => item.id === "normalized-content-key");
    expect(gap?.occurrences).toBe(2);
    expect(gap?.clause).toContain("§2.2");
    expect(gap?.owner.length).toBeGreaterThan(0);
    expect(report.every((item) => item.reason.length > 0)).toBe(true);
  });
});

// 便于断言单条判定：直接复用实现里的事件→上下文投影。
function selectContext(data: MetricsDataset) {
  return buildEvaluationContext(data);
}
