import { weekTasks } from "./prototype-data";

export type RecoveryOptionId = "essential" | "balanced" | "sprint";

export interface RecoveryOption {
  id: RecoveryOptionId;
  name: string;
  description: string;
  taskIndexes: number[];
  minutes: number;
  feasible: boolean;
  impact: string;
}

export interface PlanState {
  version: number;
  previousVersion: number | null;
  confirmedOption: RecoveryOptionId | null;
  baseVersion: number;
  conflict: boolean;
}

export const completedTasks = weekTasks.filter((task) => task.done);
export const remainingTasks = weekTasks
  .map((task, index) => ({ ...task, index }))
  .filter((task) => !task.done);

export function getRecoveryOptions(availableMinutes: number): RecoveryOption[] {
  const definitions = [
    {
      id: "essential",
      name: "保底",
      description: "保留概念、遍历与退出测，先守住核心证据。",
      taskIndexes: [2, 3, 4],
      impact: "图的存储结构与本周回忆延期，不修改已完成记录。",
    },
    {
      id: "balanced",
      name: "平衡",
      description: "增加本周结构化回忆，图的存储结构延期。",
      taskIndexes: [2, 3, 4, 6],
      impact: "图的存储结构延期至下周，其余估时保持不变。",
    },
    {
      id: "sprint",
      name: "冲刺",
      description: "保留全部剩余目标；容量不足时不可确认。",
      taskIndexes: remainingTasks.map((task) => task.index),
      impact: "不延期任何任务，但需要补足可用时间。",
    },
  ] as const;

  return definitions.map((definition) => {
    const minutes = definition.taskIndexes.reduce(
      (sum, index) => sum + (weekTasks[index]?.minutes ?? 0),
      0,
    );
    return {
      ...definition,
      taskIndexes: [...definition.taskIndexes],
      minutes,
      feasible: minutes <= availableMinutes,
    };
  });
}

export const initialPlanState: PlanState = {
  version: 12,
  previousVersion: null,
  confirmedOption: null,
  baseVersion: 12,
  conflict: false,
};

export function confirmPlan(state: PlanState, option: RecoveryOption): PlanState {
  if (state.conflict || state.baseVersion !== state.version || !option.feasible) return state;
  return {
    ...state,
    previousVersion: state.version,
    version: state.version + 1,
    confirmedOption: option.id,
    baseVersion: state.version + 1,
  };
}

export function rejectPlan(state: PlanState): PlanState {
  return {
    ...state,
    confirmedOption: state.previousVersion === null ? null : state.confirmedOption,
  };
}

export function simulatePlanConflict(state: PlanState): PlanState {
  return { ...state, version: state.version + 1, conflict: true };
}

export function refreshPlanConflict(state: PlanState): PlanState {
  return { ...state, baseVersion: state.version, conflict: false };
}

export function undoPlan(state: PlanState): PlanState {
  if (state.previousVersion === null) return state;
  return {
    ...state,
    version: state.version + 1,
    previousVersion: null,
    confirmedOption: null,
    baseVersion: state.version + 1,
    conflict: false,
  };
}
