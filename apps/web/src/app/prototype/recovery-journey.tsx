"use client";

import { useState } from "react";
import ErrorStates from "./error-states";
import RecoveryPlan from "./recovery-plan";
import RightsStates from "./rights-states";

type RecoveryView = "plan" | "errors" | "rights";

export default function RecoveryJourney({
  onOpenPrivate,
}: {
  onOpenPrivate: (step?: "upload" | "process") => void;
}) {
  const [view, setView] = useState<RecoveryView>("plan");

  return (
    <>
      <section className="prototype-hero recovery-hero">
        <p className="eyebrow">RECOVER WITH CONTROL, KEEP WHAT IS REAL</p>
        <h1>
          变化可以被看见，
          <br />
          <em>记录不会被改写。</em>
        </h1>
        <p className="lede">
          面对时间变化、处理异常与数据权利请求，清楚查看影响范围，再决定下一步。
        </p>
      </section>
      <nav className="stepper recovery-stepper" aria-label="中断恢复与数据权利">
        {[
          ["plan", "中断恢复"],
          ["errors", "错误与边界"],
          ["rights", "数据权利"],
        ].map(([id, label], index) => (
          <button
            type="button"
            key={id}
            className={view === id ? "current" : ""}
            onClick={() => setView(id as RecoveryView)}
            aria-pressed={view === id}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {view === "plan" && <RecoveryPlan />}
      {view === "errors" && <ErrorStates onOpenPrivate={onOpenPrivate} />}
      {view === "rights" && <RightsStates />}
    </>
  );
}
