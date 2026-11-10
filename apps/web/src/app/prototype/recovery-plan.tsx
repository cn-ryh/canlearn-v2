"use client";

import { useMemo, useState } from "react";
import { StatusTag } from "./prototype-shared";
import {
  completedTasks,
  confirmPlan,
  getRecoveryOptions,
  initialPlanState,
  type RecoveryOptionId,
  refreshPlanConflict,
  rejectPlan,
  remainingTasks,
  simulatePlanConflict,
  undoPlan,
} from "./recovery-data";

export function formatMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

export default function RecoveryPlan() {
  const [availableMinutes, setAvailableMinutes] = useState(270);
  const [selectedId, setSelectedId] = useState<RecoveryOptionId>("essential");
  const [plan, setPlan] = useState(initialPlanState);
  const [proposalFailed, setProposalFailed] = useState(false);
  const [message, setMessage] = useState("");
  const options = useMemo(() => getRecoveryOptions(availableMinutes), [availableMinutes]);
  const selected = options.find((option) => option.id === selectedId);
  if (!selected) throw new Error(`Unknown recovery option: ${selectedId}`);
  const requiredMinutes = remainingTasks.reduce((sum, task) => sum + task.minutes, 0);

  function chooseOption(id: RecoveryOptionId) {
    if (plan.conflict) return;
    setSelectedId(id);
    setMessage("");
  }

  return (
    <section className="journey-section" aria-labelledby="recovery-heading">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">01 / RECOVERY PROPOSAL</p>
          <h2 id="recovery-heading">本周少了时间，先看清取舍</h2>
        </div>
        <StatusTag tone="blue">
          计划 P{plan.version} · {plan.confirmedOption ? "你已确认" : "尚未变更"}
        </StatusTag>
      </div>

      <div className="recovery-summary">
        <div>
          <span>剩余容量</span>
          <strong>{formatMinutes(availableMinutes)}</strong>
        </div>
        <div>
          <span>剩余任务</span>
          <strong>{formatMinutes(requiredMinutes)}</strong>
        </div>
        <div className="summary-conflict">
          <span>容量冲突</span>
          <strong>{formatMinutes(Math.max(0, requiredMinutes - availableMinutes))}</strong>
        </div>
        <div>
          <span>已完成与证据</span>
          <strong>2 项 · 原样保留</strong>
        </div>
      </div>

      <div className="recovery-capacity panel">
        <div>
          <label htmlFor="recovery-hours">调整本周剩余可用时间</label>
          <p>只生成待确认提案，不自动重排，不缩短任务估时。</p>
        </div>
        <div className="hours-control">
          <input
            id="recovery-hours"
            type="range"
            min="3"
            max="7"
            step="0.5"
            value={availableMinutes / 60}
            disabled={plan.confirmedOption !== null || plan.conflict}
            onChange={(event) => {
              setAvailableMinutes(Number(event.target.value) * 60);
              setMessage("");
            }}
          />
          <output htmlFor="recovery-hours">{availableMinutes / 60} 小时</output>
        </div>
      </div>

      <div className="recovery-layout">
        <section className="panel recovery-options" aria-labelledby="options-heading">
          <div className="panel-heading">
            <h3 id="options-heading">选择一种可行范围</h3>
            <StatusTag tone="neutral">提案基于 P{plan.baseVersion}</StatusTag>
          </div>
          <div className="option-cards">
            {options.map((option) => (
              <button
                type="button"
                key={option.id}
                disabled={plan.conflict || plan.confirmedOption !== null}
                className={`recovery-option ${selectedId === option.id ? "selected" : ""}`}
                onClick={() => chooseOption(option.id)}
                aria-pressed={selectedId === option.id}
              >
                <span className="recovery-option-top">
                  <strong>{option.name}</strong>
                  <StatusTag tone={option.feasible ? "green" : "red"}>
                    {option.feasible ? "容量可行" : "超出容量"}
                  </StatusTag>
                </span>
                <span>{option.description}</span>
                <span className="option-total">{formatMinutes(option.minutes)}</span>
                <small>{option.impact}</small>
              </button>
            ))}
          </div>
          <div className="difference-box">
            <h3>与原计划的差异 · {selected.name}</h3>
            <ul>
              {remainingTasks.map((task) => {
                const retained = selected.taskIndexes.includes(task.index);
                return (
                  <li key={task.day}>
                    <span className={retained ? "kept" : "deferred"}>
                      {retained ? "保留" : "延期"}
                    </span>
                    <span>
                      {task.day} · {task.title}
                    </span>
                    <span>{task.minutes} 分钟</span>
                  </li>
                );
              })}
            </ul>
            <p>
              来源与证据缺口仍关联《数据结构学习导引》单元
              v3；“图的存储结构”延期后需在下周补做退出测。
            </p>
          </div>
          {plan.conflict && (
            <div className="state-alert error" role="alert">
              <strong>计划版本冲突</strong>
              <p>
                另一处已将计划更新为 P{plan.version}。当前基于 P{plan.baseVersion}{" "}
                的提案不能覆盖它，请刷新差异。
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setPlan(refreshPlanConflict);
                  setMessage("已刷新差异，请重新核对后确认。");
                }}
              >
                刷新差异 →
              </button>
            </div>
          )}
          {proposalFailed && (
            <div className="state-alert error" role="alert">
              <strong>恢复建议暂时生成失败</strong>
              <p>影响范围：尚未确认的提案。原计划 P{plan.version} 和全部完成证据仍可查看。</p>
              <button
                type="button"
                className="text-button"
                onClick={() => setProposalFailed(false)}
              >
                重试生成 →
              </button>
            </div>
          )}
          <div className="recovery-actions">
            <button
              type="button"
              className="primary-button"
              disabled={
                !selected.feasible ||
                plan.conflict ||
                proposalFailed ||
                plan.confirmedOption !== null
              }
              onClick={() => {
                setPlan(confirmPlan(plan, selected));
                setMessage(`已确认${selected.name}方案，生成新版本；历史作答未改变。`);
              }}
            >
              查看差异后确认 →
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={plan.confirmedOption !== null}
              onClick={() => {
                setPlan(rejectPlan);
                setMessage("已拒绝提案，原计划与完成记录保持不变。");
              }}
            >
              拒绝，保留原计划
            </button>
          </div>
          <div className="recovery-demo-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setPlan(simulatePlanConflict)}
            >
              演示版本冲突
            </button>
            <button type="button" className="text-button" onClick={() => setProposalFailed(true)}>
              演示建议失败
            </button>
            <button
              type="button"
              className="text-button"
              disabled={plan.previousVersion === null}
              onClick={() => {
                setPlan(undoPlan);
                setMessage("已撤销到上一个计划内容；历史完成证据未删除。");
              }}
            >
              撤销上次确认
            </button>
          </div>
          {message && (
            <p className="saved-note" role="status">
              {message}（当前 P{plan.version}）
            </p>
          )}
        </section>

        <aside className="panel immutable-tasks" aria-labelledby="immutable-heading">
          <div className="panel-heading">
            <h3 id="immutable-heading">不在候选重排中</h3>
            <StatusTag tone="green">受保护</StatusTag>
          </div>
          {completedTasks.map((task, index) => (
            <article className="protected-task" key={task.day}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{task.title}</strong>
                <p>{task.minutes} 分钟 · 已有真实作答</p>
                <small>证据 #DEMO-02{index + 7} · 单元 v3</small>
              </div>
            </article>
          ))}
          <div className="immutable-note">
            不删除作答、不改分、不撤销历史证据。确认人或版本变化不会改写这些事实。
          </div>
          <dl className="plan-facts">
            <div>
              <dt>计划维护者</dt>
              <dd>学习者本人确认</dd>
            </div>
            <div>
              <dt>上一个计划</dt>
              <dd>{plan.previousVersion ? `P${plan.previousVersion} · 可撤销` : "无待撤销版本"}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
