"use client";

import { useEffect, useState } from "react";

type Job = {
  id: string;
  status: string;
  traceId: string;
  snapshotId: string;
  workflowId: string;
  terminationState: string;
  failureCode: string | null;
  result: { pages: { pageIndex: number; status: string }[] } | null;
  delivery?: { eventId: string; state: string; attempts: number }[];
};
const finished = new Set(["SUCCEEDED", "PARTIAL_READY", "FAILED", "CANCELLED"]);

export function SmokePanel() {
  const [mode, setMode] = useState("success");
  const [delayMs, setDelayMs] = useState(2000);
  const [key, setKey] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(path: string, init?: RequestInit): Promise<Job> {
    const response = await fetch(`/api/smoke${path}`, init);
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        Array.isArray(body.message) ? body.message.join("；") : (body.message ?? "服务暂不可用"),
      );
    return body as Job;
  }

  async function create(repeat = false) {
    setBusy(true);
    setError("");
    const requestKey = repeat ? key : crypto.randomUUID();
    setKey(requestKey);
    try {
      const current = await request("", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": requestKey },
        body: JSON.stringify({ mode, delayMs }),
      });
      setJob(current);
      setLookupId(current.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }

  async function lookup() {
    setBusy(true);
    setError("");
    try {
      setJob(await request(`/${encodeURIComponent(lookupId)}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "查询失败");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      setJob(await request(`/${job.id}/cancel`, { method: "POST" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "取消失败");
    } finally {
      setBusy(false);
    }
  }

  const id = job?.id;
  const status = job?.status;
  const termination = job?.terminationState;
  useEffect(() => {
    if (!id || (finished.has(status ?? "") && termination !== "requested")) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/smoke/${id}`);
        if (!response.ok) throw new Error("查询暂不可用，可稍后手动刷新");
        const current = await response.json();
        if (active) {
          setJob(current);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "查询失败");
      }
    }, 750);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, status, termination]);

  return (
    <>
      <section className="smoke-controls" aria-labelledby="fixture-heading">
        <h2 id="fixture-heading">固定夹具 · 三页</h2>
        <label htmlFor="smoke-mode">预期结果</label>
        <select id="smoke-mode" value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="success">全部成功</option>
          <option value="partial">部分可用</option>
          <option value="blank">全部空白</option>
          <option value="fail">永久失败</option>
        </select>
        <label htmlFor="smoke-delay">模拟处理时间（毫秒，0–15000）</label>
        <input
          id="smoke-delay"
          type="number"
          min={0}
          max={15000}
          step={250}
          value={delayMs}
          onChange={(event) => setDelayMs(Number(event.target.value))}
        />
        <div className="smoke-actions">
          <button type="button" disabled={busy} onClick={() => void create()}>
            创建任务
          </button>
          <button type="button" disabled={busy || !key} onClick={() => void create(true)}>
            同键重发
          </button>
        </div>
        <label htmlFor="smoke-id">Job ID</label>
        <input
          id="smoke-id"
          value={lookupId}
          onChange={(event) => setLookupId(event.target.value)}
          placeholder="粘贴 Job ID，重启后继续查询"
        />
        <div className="smoke-actions">
          <button type="button" disabled={busy || !lookupId} onClick={() => void lookup()}>
            查询 / 刷新
          </button>
          <button
            type="button"
            disabled={busy || !job || finished.has(job.status)}
            onClick={() => void cancel()}
          >
            取消任务
          </button>
        </div>
      </section>
      {error && (
        <p className="smoke-error" role="alert">
          {error}
        </p>
      )}
      {job && (
        <section aria-labelledby="job-heading">
          <h2 id="job-heading">当前任务</h2>
          <p className="smoke-status" aria-live="polite">
            {job.status}
          </p>
          <dl className="smoke-facts">
            <dt>Job</dt>
            <dd>{job.id}</dd>
            <dt>Trace</dt>
            <dd>{job.traceId}</dd>
            <dt>Workflow</dt>
            <dd>{job.workflowId}</dd>
            <dt>Snapshot</dt>
            <dd>{job.snapshotId}</dd>
            <dt>停止回执</dt>
            <dd>{job.terminationState}</dd>
            {job.failureCode && (
              <>
                <dt>失败原因</dt>
                <dd>{job.failureCode}</dd>
              </>
            )}
          </dl>
          {job.result && (
            <ul>
              {job.result.pages.map((page) => (
                <li key={page.pageIndex}>
                  第 {page.pageIndex} 页：{page.status}
                </li>
              ))}
            </ul>
          )}
          {job.status === "CANCELLED" && (
            <p>任务已逻辑取消。停止回执 confirmed 表示本次模拟计算已停止。</p>
          )}
          {job.delivery && (
            <p>
              事件投递：
              {job.delivery.map((item) => `${item.state}（${item.attempts} 次）`).join("、")}
            </p>
          )}
        </section>
      )}
    </>
  );
}
