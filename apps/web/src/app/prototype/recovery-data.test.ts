import { describe, expect, it } from "vitest";
import {
  completedTasks,
  confirmPlan,
  getRecoveryOptions,
  initialPlanState,
  refreshPlanConflict,
  rejectPlan,
  remainingTasks,
  simulatePlanConflict,
  undoPlan,
} from "./recovery-data";

describe("recovery proposal", () => {
  it("keeps completed tasks out of every reordering option", () => {
    expect(completedTasks).toHaveLength(2);
    expect(remainingTasks).toHaveLength(5);
    for (const option of getRecoveryOptions(270)) {
      for (const task of completedTasks) {
        expect(option.taskIndexes).not.toContain(task.day === "周一" ? 0 : 1);
      }
    }
  });

  it("reports the capacity conflict and never shortens task estimates", () => {
    const options = getRecoveryOptions(270);
    expect(remainingTasks.reduce((sum, task) => sum + task.minutes, 0)).toBe(340);
    expect(options.map((option) => option.minutes)).toEqual([180, 250, 340]);
    expect(options.map((option) => option.feasible)).toEqual([true, true, false]);
    expect(getOption(1, 180).feasible).toBe(false);
  });

  function getOption(index: number, availableMinutes = 270) {
    const option = getRecoveryOptions(availableMinutes)[index];
    if (!option) throw new Error("Expected recovery option");
    return option;
  }

  it("requires explicit confirmation and creates an undoable version", () => {
    const option = getOption(0);
    const confirmed = confirmPlan(initialPlanState, option);
    expect(initialPlanState.confirmedOption).toBeNull();
    expect(confirmed.version).toBe(13);
    expect(confirmed.previousVersion).toBe(12);
    expect(confirmed.confirmedOption).toBe("essential");
    const undone = undoPlan(confirmed);
    expect(undone.confirmedOption).toBeNull();
    expect(undone.previousVersion).toBeNull();
    expect(completedTasks.every((task) => task.done)).toBe(true);
  });

  it("keeps the current plan when a proposal is rejected or infeasible", () => {
    expect(rejectPlan(initialPlanState)).toEqual(initialPlanState);
    expect(confirmPlan(initialPlanState, getOption(2))).toEqual(initialPlanState);
  });

  it("blocks a stale proposal until its differences are refreshed", () => {
    const conflicted = simulatePlanConflict(initialPlanState);
    expect(confirmPlan(conflicted, getOption(0))).toEqual(conflicted);
    const refreshed = refreshPlanConflict(conflicted);
    expect(refreshed.conflict).toBe(false);
    expect(refreshed.baseVersion).toBe(refreshed.version);
    expect(confirmPlan(refreshed, getOption(0)).confirmedOption).toBe("essential");
  });
});
