import { describe, expect, it } from "vitest";
import {
  DEMO_EVIDENCE_NOTICE,
  formatDemoEvidence,
  getCapacity,
  getChapterReadiness,
  getCompletedTasks,
  getDefaultChapter,
  getEvidenceIds,
  getPagePreview,
  getPageStatus,
  getPrivateLearnAdmission,
  getPrivateProcessAdmission,
  getPublicLearnAdmission,
  initialDemoBypass,
  journeyHasAdmissionGate,
  learningTracks,
  type PackageId,
  PRIVATE_PAGE_COUNT,
  privateChapters,
  privateLearningTrack,
  privatePagePreview,
  publicLearningTracks,
  questions,
  subjectPackages,
  weekTasks,
} from "./prototype-data";

/** 两两组合，用于断言各包证据编号互不重叠。 */
function evidencePairs(groups: string[][]): Array<[string[], string[]]> {
  const pairs: Array<[string[], string[]]> = [];
  for (let left = 0; left < groups.length; left += 1) {
    for (let right = left + 1; right < groups.length; right += 1) {
      const a = groups[left];
      const b = groups[right];
      if (a && b) pairs.push([a, b]);
    }
  }
  return pairs;
}

describe("prototype learning data", () => {
  it("shows the reviewed coverage without implying every unit is published", () => {
    for (const subjectPackage of subjectPackages) {
      expect(subjectPackage.reviewedUnits).toBeLessThanOrEqual(subjectPackage.totalUnits);
      expect(subjectPackage.source).not.toBe("");
      expect(subjectPackage.license).not.toBe("");
    }
  });

  it("keeps trial and reviewed exercises visibly distinct", () => {
    expect(questions.map((question) => question.status)).toEqual(["已审校", "试用生成"]);
  });

  it("reports capacity honestly instead of shortening tasks", () => {
    const totalMinutes = weekTasks.reduce((sum, task) => sum + task.minutes, 0);
    const feasible = getCapacity(8);
    const insufficient = getCapacity(2);

    expect(feasible.totalMinutes).toBe(totalMinutes);
    expect(feasible.feasible).toBe(true);
    expect(feasible.remainingMinutes).toBe(40);
    expect(insufficient.totalMinutes).toBe(totalMinutes);
    expect(insufficient.feasible).toBe(false);
    expect(insufficient.remainingMinutes).toBe(-320);
  });
});

describe("per-public-package learning tracks (D02)", () => {
  const packageIds: PackageId[] = ["408", "cet4", "cet6"];

  it("gives every public package its own tasks and exercises", () => {
    const signatures = packageIds.map((id) =>
      publicLearningTracks[id].weekTasks.map((task) => `${task.day}:${task.minutes}`).join("|"),
    );
    expect(new Set(signatures).size).toBe(packageIds.length);

    const questionIds = packageIds.map((id) => publicLearningTracks[id].questions.map((q) => q.id));
    const flattened = questionIds.flat();
    expect(new Set(flattened).size).toBe(flattened.length);
  });

  it("keeps each package's daily schedule on the same weekdays", () => {
    for (const id of packageIds) {
      expect(publicLearningTracks[id].weekTasks.map((task) => task.day)).toEqual([
        "周一",
        "周二",
        "周三",
        "周四",
        "周五",
        "周六",
        "周日",
      ]);
    }
  });

  it("keeps the 408 exports pointing at the 408 track", () => {
    expect(weekTasks).toBe(learningTracks["408"].weekTasks);
    expect(questions).toBe(learningTracks["408"].questions);
    expect(learningTracks["408"].packageId).toBe("408");
    expect(learningTracks["408"].journey).toBe("public");
  });

  it("does not reuse 408 topics in the CET packages", () => {
    const cctTopics = [/线性表/, /顺序表/, /链表/, /二叉树/, /图/, /栈和队列/];
    for (const id of ["cet4", "cet6"] as const) {
      const track = publicLearningTracks[id];
      const taskText = track.weekTasks.map((task) => task.title).join(" ");
      const questionText = track.questions.map((question) => question.stem).join(" ");

      for (const pattern of cctTopics) {
        expect(taskText).not.toMatch(pattern);
        expect(questionText).not.toMatch(pattern);
        expect(track.exitQuestion.stem).not.toMatch(pattern);
      }
    }
  });

  it("keeps every CET task titled with English-learning topics", () => {
    for (const id of ["cet4", "cet6"] as const) {
      const track = publicLearningTracks[id];
      expect(track.subject).toMatch(/英语/);
      expect(track.weekTasks.length).toBe(7);
      for (const task of track.weekTasks) {
        expect(task.minutes).toBeGreaterThan(0);
      }
    }
  });

  it("recomputes capacity from the selected package, not the 408 default", () => {
    for (const id of packageIds) {
      const track = publicLearningTracks[id];
      const expected = track.weekTasks.reduce((sum, task) => sum + task.minutes, 0);
      expect(getCapacity(8, track.weekTasks).totalMinutes).toBe(expected);
    }
  });
});

describe("private learning track (D01)", () => {
  it("matches the private lesson, skill and source citation", () => {
    const track = privateLearningTrack;
    expect(track.journey).toBe("private");
    expect(track.packageId).toBeNull();
    expect(track.lessonTitle).toContain("细胞膜");
    expect(track.skill).toBe("解释膜结构");
    expect(track.sourceVersion).toBe("PDF v1 · p.12");

    for (const question of track.questions) {
      expect(question.source).toMatch(/细胞生物学|当前讲解/);
    }
    expect(track.exitQuestion.stem).toMatch(/细胞膜|膜/);
  });

  it("does not mix public 408 questions or sources into the private track", () => {
    const publicQuestions = learningTracks["408"].questions;
    const privateIds = new Set(privateLearningTrack.questions.map((q) => q.id));
    for (const question of publicQuestions) {
      expect(privateIds.has(question.id)).toBe(false);
    }

    const privateText = [
      privateLearningTrack.exitQuestion.stem,
      ...privateLearningTrack.questions.map((q) => `${q.stem} ${q.explanation} ${q.source}`),
    ].join(" ");

    expect(privateText).not.toMatch(/顺序表|链表|数据结构/);
    expect(privateLearningTrack.sourceVersion).not.toContain("单元 v3");
  });

  it("keeps each private question's answer index inside its option list", () => {
    for (const question of privateLearningTrack.questions) {
      expect(question.answer).toBeGreaterThanOrEqual(0);
      expect(question.answer).toBeLessThan(question.options.length);
    }
    expect(privateLearningTrack.exitQuestion.answer).toBeLessThan(
      privateLearningTrack.exitQuestion.options.length,
    );
  });
});

describe("learning admission gates (D03)", () => {
  it("requires a feasible and explicitly confirmed capacity for public learning", () => {
    const unconfirmed = getPublicLearnAdmission({
      capacityConfirmed: false,
      capacityFeasible: true,
    });
    expect(unconfirmed.allowed).toBe(false);
    expect(unconfirmed.reason).toContain("确认");

    const infeasible = getPublicLearnAdmission({
      capacityConfirmed: true,
      capacityFeasible: false,
    });
    expect(infeasible.allowed).toBe(false);
    expect(infeasible.reason).toContain("时间");

    expect(
      getPublicLearnAdmission({ capacityConfirmed: true, capacityFeasible: true }).allowed,
    ).toBe(true);
  });

  it("requires a loaded demo file before private processing", () => {
    expect(getPrivateProcessAdmission({ fileReady: false }).allowed).toBe(false);
    expect(getPrivateProcessAdmission({ fileReady: true }).allowed).toBe(true);
  });

  it("requires a learnable chapter before private learning", () => {
    expect(getPrivateLearnAdmission({ fileReady: true, chapterLearnable: false }).allowed).toBe(
      false,
    );
    expect(getPrivateLearnAdmission({ fileReady: false, chapterLearnable: true }).allowed).toBe(
      false,
    );
    expect(getPrivateLearnAdmission({ fileReady: true, chapterLearnable: true }).allowed).toBe(
      true,
    );
  });

  it("gates only journeys that have an admission step", () => {
    expect(journeyHasAdmissionGate("public")).toBe(true);
    expect(journeyHasAdmissionGate("private")).toBe(true);
    expect(journeyHasAdmissionGate("recovery")).toBe(false);
  });
});

describe("demo bypass is tracked per journey (D16)", () => {
  it("starts disabled for both gated journeys", () => {
    expect(initialDemoBypass).toEqual({ public: false, private: false });
  });
});

describe("page preview and chapter readiness (D13/D15)", () => {
  it("marks only page 7 missing and page 14 low quality", () => {
    expect(getPageStatus(7)).toBe("missing");
    expect(getPageStatus(14)).toBe("low-quality");
    for (let page = 1; page <= PRIVATE_PAGE_COUNT; page += 1) {
      if (page === 7 || page === 14) continue;
      expect(getPageStatus(page)).toBe("available");
    }
  });

  it("keeps the preview disclaimer explicit about not being a real PDF render", () => {
    expect(privatePagePreview.disclaimer).toContain("不是真实 PDF 渲染");
    expect(privatePagePreview.pages).toEqual([7, 12, 13, 14]);
  });

  it("returns an empty block list for a missing page instead of invented text", () => {
    const preview = getPagePreview(7);
    expect(preview.status).toBe("missing");
    expect(preview.textBlocks).toEqual([]);
  });

  it("makes 3.1 fully learnable because its pages 10-13 are all usable", () => {
    const chapter = getDefaultChapter();
    expect(chapter.id).toBe("3.1");
    const readiness = getChapterReadiness(chapter);
    expect(readiness.rangeLabel).toBe("第 10–13 页");
    expect(readiness.missingPages).toEqual([]);
    expect(readiness.lowQualityPages).toEqual([]);
    expect(readiness.learnable).toBe(true);
    expect(readiness.summary).toContain("4/4");
  });

  it("blocks 2.4 on the missing page 7 and 3.2 on the low-quality page 14", () => {
    const c24 = getChapterReadiness(
      privateChapters.find((c) => c.id === "2.4") as (typeof privateChapters)[number],
    );
    expect(c24.missingPages).toEqual([7]);
    expect(c24.learnable).toBe(false);

    const c32 = getChapterReadiness(
      privateChapters.find((c) => c.id === "3.2") as (typeof privateChapters)[number],
    );
    expect(c32.lowQualityPages).toEqual([14]);
    expect(c32.learnable).toBe(false);
  });

  it("derives chapter ranges that lie inside the 18-page fixture", () => {
    for (const chapter of privateChapters) {
      expect(chapter.pageStart).toBeGreaterThanOrEqual(1);
      expect(chapter.pageEnd).toBeLessThanOrEqual(PRIVATE_PAGE_COUNT);
      expect(chapter.pageStart).toBeLessThanOrEqual(chapter.pageEnd);
    }
  });
});

describe("demo evidence ids are always labelled (D14) and never shared across packages (D17)", () => {
  it("always appends the non-issued notice", () => {
    expect(formatDemoEvidence("#DEMO-031")).toBe(`#DEMO-031 · ${DEMO_EVIDENCE_NOTICE}`);
    expect(formatDemoEvidence("#DEMO-C4-01")).toContain(DEMO_EVIDENCE_NOTICE);
  });

  it("rejects ids outside the demo namespace", () => {
    expect(() => formatDemoEvidence("real-123")).toThrow();
  });

  it("gives each package its own completed tasks and non-overlapping evidence IDs", () => {
    const packageIds: PackageId[] = ["408", "cet4", "cet6"];
    const evidenceByPackage = packageIds.map((id) =>
      getEvidenceIds(publicLearningTracks[id].weekTasks),
    );

    for (const ids of evidenceByPackage) {
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(formatDemoEvidence(id)).toContain(DEMO_EVIDENCE_NOTICE);
      }
    }

    for (const [left, right] of evidencePairs(evidenceByPackage)) {
      const shared = left.filter((id) => right.includes(id));
      expect(shared).toEqual([]);
    }
  });

  it("derives the completed count from each package instead of a fixed number", () => {
    const counts = (["408", "cet4", "cet6"] as PackageId[]).map(
      (id) => getCompletedTasks(publicLearningTracks[id].weekTasks).length,
    );
    expect(counts).toEqual([2, 2, 2]);

    for (const id of ["408", "cet4", "cet6"] as PackageId[]) {
      const track = publicLearningTracks[id];
      expect(track.weekTasks.filter((task) => task.done).length).toBe(
        getCompletedTasks(track.weekTasks).length,
      );
    }
  });

  it("keeps every track's exit-test evidence inside the demo namespace", () => {
    for (const track of [learningTracks["408"], privateLearningTrack]) {
      expect(formatDemoEvidence(track.evidenceId)).toContain(DEMO_EVIDENCE_NOTICE);
    }
  });
});
