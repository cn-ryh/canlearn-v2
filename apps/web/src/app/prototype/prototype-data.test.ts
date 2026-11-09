import { describe, expect, it } from "vitest";
import { getCapacity, questions, subjectPackages, weekTasks } from "./prototype-data";

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
