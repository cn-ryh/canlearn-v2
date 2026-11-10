"use client";

import { useState } from "react";
import { StatusTag } from "./prototype-shared";

type ErrorKind = "queued" | "failed" | "partial" | "cancelled" | "quota" | "forbidden";

const states: Array<{ id: ErrorKind; label: string; title: string; tone: string }> = [
  { id: "queued", label: "排队中", title: "资料正在等待处理", tone: "blue" },
  { id: "failed", label: "解析失败", title: "无法解析这份资料", tone: "red" },
  { id: "partial", label: "部分可用", title: "仅部分页面通过质量门", tone: "amber" },
  { id: "cancelled", label: "已取消", title: "处理已取消", tone: "neutral" },
  { id: "quota", label: "超配额", title: "本周处理额度不足", tone: "amber" },
  { id: "forbidden", label: "越权访问", title: "当前空间无权访问", tone: "red" },
];

function ErrorDetail({
  kind,
  onOpenPrivate,
}: {
  kind: ErrorKind;
  onOpenPrivate: (step?: "upload" | "process") => void;
}) {
  const [message, setMessage] = useState("");

  if (kind === "queued")
    return (
      <>
        <p>
          影响范围：演示资料 v1，共 18 页。当前排在第 2 位，尚未开始解析；已有学习记录不受影响。
        </p>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="排队进度"
          aria-valuenow={18}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: "18%" }} />
        </div>
        <div className="state-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMessage("已取消排队，未创建解析结果。")}
          >
            取消排队
          </button>
          {message && <span role="status">{message}</span>}
        </div>
      </>
    );
  if (kind === "failed")
    return (
      <>
        <p>
          影响范围：文件读取阶段，未生成任何讲解或练习。可能原因是文件损坏或加密；不会用模型猜测原内容。
        </p>
        <div className="error-scope">
          <strong>可操作的恢复路径</strong>
          <span>解除加密或导出清晰 PDF 后重试，也可以返回选择其他文件。</span>
        </div>
        <div className="state-actions">
          <button type="button" className="primary-button" onClick={() => onOpenPrivate()}>
            返回更换文件 →
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMessage("已保留失败记录，可在替换文件后重试。")}
          >
            查看重试影响
          </button>
        </div>
        {message && (
          <p className="saved-note" role="status">
            {message}
          </p>
        )}
      </>
    );
  if (kind === "partial")
    return (
      <>
        <p>
          影响范围：第 7 页缺页、第 14 页识别质量不足；其余 16 页可用。第 14
          页所属章节不可学习，缺页不会由模型补造。
        </p>
        <div className="partial-grid">
          <span>
            <strong>16 页</strong>通过质量门
          </span>
          <span>
            <strong>1 页</strong>原文件缺页
          </span>
          <span>
            <strong>1 页</strong>识别质量不足
          </span>
        </div>
        <div className="state-actions">
          <button type="button" className="primary-button" onClick={() => onOpenPrivate("process")}>
            查看可学习章节 →
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMessage("补充清晰原稿会创建新文件版本，不覆盖现有引用。")}
          >
            补充清晰原稿
          </button>
        </div>
        {message && (
          <p className="saved-note" role="status">
            {message}
          </p>
        )}
      </>
    );
  if (kind === "cancelled")
    return (
      <>
        <p>
          影响范围：处理任务 #DEMO-P18
          已取消。取消前没有通过质量门的结果；后续晚到结果会被丢弃，不会复活资料。
        </p>
        <div className="state-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMessage("可重新开始处理；将创建新任务，不恢复已取消任务。")}
          >
            了解重新开始
          </button>
        </div>
        {message && (
          <p className="saved-note" role="status">
            {message}
          </p>
        )}
      </>
    );
  if (kind === "quota")
    return (
      <>
        <p>
          影响范围：新资料处理已暂停。本周已用 98 / 100 页，这份资料需要 18
          页；已有资料和学习记录仍可访问。
        </p>
        <div className="error-scope">
          <strong>可操作的恢复路径</strong>
          <span>
            减少处理页数至 2 页以内，或等下周一额度重置后再试。不会自动删除旧资料换取额度。
          </span>
        </div>
        <div className="state-actions">
          <button type="button" className="primary-button" onClick={() => onOpenPrivate()}>
            返回调整处理范围 →
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMessage("已加入下周一的演示等待列表，不会立即处理。")}
          >
            额度重置后提醒
          </button>
        </div>
        {message && (
          <p className="saved-note" role="status">
            {message}
          </p>
        )}
      </>
    );
  return (
    <>
      <p>
        影响范围：另一个私有空间的资料及缓存。即使文件哈希相同，也不能跨空间读取原件、派生内容或缓存。
      </p>
      <div className="error-scope">
        <strong>可操作的恢复路径</strong>
        <span>返回自己的空间，或使用你在当前空间有权使用的文件重新创建资料。</span>
      </div>
      <div className="state-actions">
        <button type="button" className="primary-button" onClick={() => onOpenPrivate()}>
          返回我的私有空间 →
        </button>
      </div>
    </>
  );
}

export default function ErrorStates({
  onOpenPrivate,
}: {
  onOpenPrivate: (step?: "upload" | "process") => void;
}) {
  const [kind, setKind] = useState<ErrorKind>("failed");
  const state = states.find((item) => item.id === kind);
  if (!state) throw new Error(`Unknown error state: ${kind}`);

  return (
    <section className="journey-section" aria-labelledby="errors-heading">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">02 / HONEST FAILURE STATES</p>
          <h2 id="errors-heading">异常不是一句“出了点问题”</h2>
        </div>
        <p>每种状态都说明影响范围、已有结果是否保留，以及下一步可以做什么。</p>
      </div>
      <fieldset className="state-selector" aria-label="选择错误状态">
        {states.map((item) => (
          <button
            type="button"
            key={item.id}
            className={kind === item.id ? "selected" : ""}
            aria-pressed={kind === item.id}
            onClick={() => setKind(item.id)}
          >
            {item.label}
          </button>
        ))}
      </fieldset>
      <section className={`panel state-detail ${state.tone}`} aria-labelledby="state-title">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">DEMO / {state.id.toUpperCase()}</p>
            <h3 id="state-title">{state.title}</h3>
          </div>
          <StatusTag tone={state.tone}>{state.label}</StatusTag>
        </div>
        <ErrorDetail key={kind} kind={kind} onOpenPrivate={onOpenPrivate} />
      </section>
    </section>
  );
}
