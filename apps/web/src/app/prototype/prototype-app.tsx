"use client";

import { useMemo, useState } from "react";
import {
  type Admission,
  formatDemoEvidence,
  getCapacity,
  getChapterReadiness,
  getCompletedTasks,
  getDefaultChapter,
  getPagePreview,
  getPageStatus,
  getPageStatusLabel,
  getPrivateLearnAdmission,
  getPrivateProcessAdmission,
  getPublicLearnAdmission,
  initialDemoBypass,
  journeyHasAdmissionGate,
  type LearningQuestion,
  type LearningTrack,
  type PackageId,
  PRIVATE_PAGE_COUNT,
  privateChapters,
  privatePagePreview,
  resolveTrack,
  subjectPackages,
} from "./prototype-data";
import { SourceNote, StatusTag } from "./prototype-shared";
import RecoveryJourney from "./recovery-journey";

type Journey = "public" | "private" | "recovery";
type PublicStep = "select" | "plan" | "learn";
type PrivateStep = "upload" | "process" | "learn";
type Answers = Record<string, number>;
type DemoBypass = Record<"public" | "private", boolean>;

const PUBLIC_STEPS: readonly { step: PublicStep; label: string }[] = [
  { step: "select", label: "选择学科包" },
  { step: "plan", label: "确认本周计划" },
  { step: "learn", label: "学习与留证" },
];

const PRIVATE_STEPS: readonly { step: PrivateStep; label: string }[] = [
  { step: "upload", label: "创建与上传" },
  { step: "process", label: "逐页检查" },
  { step: "learn", label: "学习与留证" },
];

export default function PrototypeApp() {
  const [journey, setJourney] = useState<Journey>("public");
  const [packageId, setPackageId] = useState<PackageId>("408");
  const [publicStep, setPublicStep] = useState<PublicStep>("select");
  const [privateStep, setPrivateStep] = useState<PrivateStep>("upload");
  const [hours, setHours] = useState(8);
  const [answers, setAnswers] = useState<Answers>({});
  const [exitAnswer, setExitAnswer] = useState<number>();
  const [recallAnswer, setRecallAnswer] = useState<number>();
  const [fileReady, setFileReady] = useState(false);
  const [selectedPage, setSelectedPage] = useState(12);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [capacityConfirmed, setCapacityConfirmed] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string>(getDefaultChapter().id);
  // D16：演示模式按旅程分别记录，切换旅程不清除既有选择。
  const [demoBypass, setDemoBypass] = useState<DemoBypass>(initialDemoBypass);

  const selectedPackage = subjectPackages.find((item) => item.id === packageId);
  if (!selectedPackage) throw new Error(`Unknown prototype package: ${packageId}`);

  const track: LearningTrack = resolveTrack(
    journey === "private" ? "private" : "public",
    packageId,
  );
  const capacity = useMemo(() => getCapacity(hours, track.weekTasks), [hours, track]);
  const completed = getCompletedTasks(track.weekTasks);
  const allAnswered = track.questions.every((question) => answers[question.id] !== undefined);

  const selectedChapterIdState = selectedChapterId;
  const selectedChapter =
    journey === "private"
      ? getChapterReadiness(
          privateChapters.find((chapter) => chapter.id === selectedChapterIdState) ??
            getDefaultChapter(),
        )
      : undefined;

  const bypass = demoBypass[journey === "private" ? "private" : "public"];

  const publicAdmission: Admission = bypass
    ? { allowed: true, reason: "" }
    : getPublicLearnAdmission({ capacityConfirmed, capacityFeasible: capacity.feasible });

  const privateProcessAdmission: Admission = bypass
    ? { allowed: true, reason: "" }
    : getPrivateProcessAdmission({ fileReady });
  const privateLearnAdmission: Admission = bypass
    ? { allowed: true, reason: "" }
    : getPrivateLearnAdmission({
        fileReady,
        chapterLearnable: selectedChapter?.learnable === true,
      });

  function switchJourney(next: Journey) {
    setJourney(next);
    setAnswers({});
    setExitAnswer(undefined);
    setRecallAnswer(undefined);
    setPreviewOpen(false);
  }

  function answerQuestion(id: string, answer: number) {
    if (answers[id] === undefined) setAnswers((current) => ({ ...current, [id]: answer }));
  }

  function resetLearning() {
    setAnswers({});
    setExitAnswer(undefined);
    setRecallAnswer(undefined);
  }

  function toggleDemoBypass() {
    const key: "public" | "private" = journey === "private" ? "private" : "public";
    setDemoBypass((current) => ({ ...current, [key]: !current[key] }));
  }

  const practiceQuestions = track.questions;

  const learningPanel = () => (
    <div className="learning-grid">
      <section className="panel lesson-panel" aria-labelledby={`${journey}-lesson-title`}>
        <div className="panel-heading">
          <div>
            <p className="section-kicker">02 / 讲解与来源</p>
            <h2 id={`${journey}-lesson-title`}>{track.lessonTitle}</h2>
          </div>
          <StatusTag tone={journey === "private" ? "purple" : "teal"}>
            {journey === "private" ? "私有空间" : "公共维护"}
          </StatusTag>
        </div>
        <div className="lesson-copy">
          <p>{track.lessonBody}</p>
          <div className="concept-card">
            <span className="concept-number">01</span>
            <div>
              <strong>{track.conceptTitle}</strong>
              <p>{track.conceptBody}</p>
            </div>
          </div>
        </div>
        <SourceNote>{track.sourceVersion}</SourceNote>
        {journey === "private" && (
          <>
            <div className="source-check">
              <div>
                <span className="file-icon" aria-hidden="true">
                  PDF
                </span>
                <span>
                  第 {selectedPage} 页 · {getPageStatusLabel(selectedPage)}
                </span>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => setPreviewOpen((open) => !open)}
              >
                {previewOpen ? "收起页面预览" : "在原稿中核对 →"}
              </button>
            </div>
            {previewOpen && <PagePreviewPanel page={selectedPage} onSelect={setSelectedPage} />}
          </>
        )}
        <p className="supplement-note">
          补充说明：页面中的类比为无来源的学习辅助，不作为原文事实。
        </p>
      </section>

      <section className="panel practice-panel" aria-labelledby={`${journey}-practice-title`}>
        <div className="panel-heading">
          <div>
            <p className="section-kicker">03 / 少量练习</p>
            <h2 id={`${journey}-practice-title`}>边学边检验</h2>
          </div>
          <span className="question-count">
            {Object.keys(answers).length} / {practiceQuestions.length}
          </span>
        </div>
        <p className="muted small">题目保留校验状态；“试用生成”不进入正式诊断。</p>
        {practiceQuestions.map((question: LearningQuestion, questionIndex: number) => {
          const answer = answers[question.id];
          const answered = answer !== undefined;
          return (
            <article className="question" key={question.id}>
              <div className="question-meta">
                <span>练习 {questionIndex + 1}</span>
                <StatusTag tone={question.status === "已审校" ? "green" : "amber"}>
                  {question.status}
                </StatusTag>
              </div>
              <h3>{question.stem}</h3>
              <div className="options">
                {question.options.map((option, optionIndex) => (
                  <button
                    type="button"
                    key={option}
                    className={`option ${answered && optionIndex === question.answer ? "correct" : ""} ${answered && answer === optionIndex && answer !== question.answer ? "wrong" : ""}`}
                    onClick={() => answerQuestion(question.id, optionIndex)}
                    disabled={answered}
                    aria-pressed={answer === optionIndex}
                  >
                    <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                    {option}
                    {answered && optionIndex === question.answer && <span title="正确答案">✓</span>}
                  </button>
                ))}
              </div>
              {answered && (
                <div
                  className={`feedback ${answer === question.answer ? "success" : "retry"}`}
                  role="status"
                >
                  <strong>
                    {answer === question.answer ? "回答正确" : "这次没有答对，也是很好的学习线索"}
                  </strong>
                  <p>{question.explanation}</p>
                  <SourceNote>{question.source}</SourceNote>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="panel evidence-panel" aria-labelledby={`${journey}-evidence-title`}>
        <div className="panel-heading">
          <div>
            <p className="section-kicker">04 / 有效学习证据</p>
            <h2 id={`${journey}-evidence-title`}>一次新的退出测</h2>
          </div>
          <StatusTag tone={exitAnswer === undefined ? "neutral" : "blue"}>
            {exitAnswer === undefined ? "待完成" : "已记录"}
          </StatusTag>
        </div>
        {!allAnswered ? (
          <div className="locked-state">
            <span aria-hidden="true">○</span>
            <p>
              完成上方 {practiceQuestions.length} 道练习后，开启一次独立退出测。
              <br />
              浏览讲解本身不会被视为掌握。
            </p>
          </div>
        ) : (
          <div className="exit-test">
            <h3>{track.exitQuestion.stem}</h3>
            <div className="options">
              {track.exitQuestion.options.map((option, index) => (
                <button
                  type="button"
                  className={`option ${exitAnswer !== undefined && index === track.exitQuestion.answer ? "correct" : ""} ${exitAnswer === index && index !== track.exitQuestion.answer ? "wrong" : ""}`}
                  key={option}
                  disabled={exitAnswer !== undefined}
                  onClick={() => setExitAnswer(index)}
                  aria-pressed={exitAnswer === index}
                >
                  <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                  {option}
                </button>
              ))}
            </div>
            {exitAnswer !== undefined && (
              <div className="evidence-record" role="status">
                <div className="evidence-check" aria-hidden="true">
                  ✓
                </div>
                <div>
                  <strong>学习证据 {formatDemoEvidence(track.evidenceId)}</strong>
                  <p>{track.exitQuestion.explanation}</p>
                  <dl>
                    <div>
                      <dt>目标技能</dt>
                      <dd>{track.skill}</dd>
                    </div>
                    <div>
                      <dt>作答结果</dt>
                      <dd>
                        {exitAnswer === track.exitQuestion.answer ? "正确" : "错误（已忠实记录）"}
                      </dd>
                    </div>
                    <div>
                      <dt>来源版本</dt>
                      <dd>{track.sourceVersion}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="recall-block">
          <h3>结构化回忆（可选）</h3>
          <p>不看资料，选择你最想再次核对的一点：</p>
          <div className="recall-actions">
            {["概念定义", "典型例题", "来源原句"].map((item, index) => (
              <button
                type="button"
                className={recallAnswer === index ? "selected-chip" : "chip"}
                key={item}
                onClick={() => setRecallAnswer(index)}
              >
                {recallAnswer === index ? "✓ " : ""}
                {item}
              </button>
            ))}
          </div>
          {recallAnswer !== undefined && (
            <p className="saved-note" role="status">
              回忆选择已记录，并关联当前内容版本。
            </p>
          )}
        </div>
        <button type="button" className="text-button restart-button" onClick={resetLearning}>
          重置演示作答
        </button>
      </section>
    </div>
  );

  const demoBypassControl = journeyHasAdmissionGate(journey) ? (
    <div className="demo-bypass">
      <label>
        <input type="checkbox" checked={bypass} onChange={toggleDemoBypass} />
        演示模式：允许直接跳转到学习页
      </label>
      <p>开启后不构成容量确认、文件上传或合格章节选择，只用于演示快捷导航，不代表真实准入通过。</p>
    </div>
  ) : null;

  return (
    <main className="prototype-shell">
      <header className="prototype-header">
        <a className="prototype-brand" href="/prototype" aria-label="CanLearn 原型首页">
          <span className="brand-mark">C</span>
          <span>
            CanLearn <small>学习旅程原型</small>
          </span>
        </a>
        <div className="prototype-notice">
          <span className="pulse-dot" />
          交互原型 · Mock 数据 · 非上线 UI
        </div>
      </header>

      <nav className="journey-tabs" aria-label="选择用户旅程">
        <button
          type="button"
          className={journey === "public" ? "active" : ""}
          onClick={() => switchJourney("public")}
          aria-pressed={journey === "public"}
        >
          <span>旅程 A</span>公共学科包学习
        </button>
        <button
          type="button"
          className={journey === "private" ? "active" : ""}
          onClick={() => switchJourney("private")}
          aria-pressed={journey === "private"}
        >
          <span>旅程 B</span>私有资料学习
        </button>
        <button
          type="button"
          className={journey === "recovery" ? "active" : ""}
          onClick={() => switchJourney("recovery")}
          aria-pressed={journey === "recovery"}
        >
          <span>旅程 C</span>中断恢复与权利
        </button>
      </nav>

      {journey === "recovery" ? (
        <RecoveryJourney
          onOpenPrivate={(step = "upload") => {
            switchJourney("private");
            setPrivateStep(step);
          }}
        />
      ) : journey === "public" ? (
        <>
          <section className="prototype-hero">
            <p className="eyebrow">FROM TRUSTED CONTENT TO REAL EVIDENCE</p>
            <h1>
              从可信内容开始，
              <br />
              <em>留下真正的学习证据。</em>
            </h1>
            <p className="lede">
              选择公共学科包，安排本周学习。在每一个讲解、练习和结果里，看清来源与状态。
            </p>
          </section>
          <nav className="stepper" aria-label="公共学习步骤">
            {PUBLIC_STEPS.map(({ step, label }, index) => {
              const reachable =
                step === "select" ||
                step === "plan" ||
                (step === "learn" && publicAdmission.allowed);
              return (
                <button
                  type="button"
                  key={label}
                  className={publicStep === step ? "current" : ""}
                  onClick={() => reachable && setPublicStep(step)}
                  disabled={!reachable}
                  title={reachable ? undefined : publicAdmission.reason}
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              );
            })}
          </nav>
          {demoBypassControl}

          {publicStep === "select" && (
            <section className="journey-section" aria-labelledby="package-heading">
              <div className="section-title-row">
                <div>
                  <p className="section-kicker">01 / PUBLIC PACKAGES</p>
                  <h2 id="package-heading">选择你的学习目标</h2>
                </div>
                <p>公共目录只展示已准入内容；未覆盖单元不会被包装成已发布。</p>
              </div>
              <div className="package-grid">
                {subjectPackages.map((item) => (
                  <button
                    type="button"
                    className={`package-card ${item.tone} ${packageId === item.id ? "selected" : ""}`}
                    key={item.id}
                    onClick={() => setPackageId(item.id)}
                    aria-pressed={packageId === item.id}
                  >
                    <div className="package-top">
                      <span className="package-monogram">{item.shortName}</span>
                      <span className="select-indicator">
                        {packageId === item.id ? "✓ 已选择" : "选择 →"}
                      </span>
                    </div>
                    <h3>{item.name}</h3>
                    <StatusTag tone={item.reviewedUnits === item.totalUnits ? "green" : "amber"}>
                      {item.maintenance}
                    </StatusTag>
                    <dl>
                      <div>
                        <dt>目录覆盖</dt>
                        <dd>{item.coverage}</dd>
                      </div>
                      <div>
                        <dt>来源</dt>
                        <dd>{item.source}</dd>
                      </div>
                      <div>
                        <dt>许可与限制</dt>
                        <dd>{item.license}</dd>
                      </div>
                    </dl>
                    <div className="coverage-meter">
                      <span style={{ width: `${(item.reviewedUnits / item.totalUnits) * 100}%` }} />
                      <small>
                        {item.reviewedUnits}/{item.totalUnits} 个单元已审校
                      </small>
                    </div>
                  </button>
                ))}
              </div>
              <div className="coverage-warning">
                <span aria-hidden="true">i</span>
                <div>
                  <strong>没有你的学科或单元？</strong>
                  <p>覆盖不足时可使用自己有权使用的资料。公共维护与私有资料始终隔离。</p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchJourney("private")}
                >
                  创建私有学习空间 →
                </button>
              </div>
              <div className="section-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setPublicStep("plan")}
                >
                  以 {selectedPackage.shortName} 制定计划 <span>→</span>
                </button>
              </div>
            </section>
          )}

          {publicStep === "plan" && (
            <section className="journey-section" aria-labelledby="plan-heading">
              <div className="section-title-row">
                <div>
                  <p className="section-kicker">02 / WEEKLY CAPACITY</p>
                  <h2 id="plan-heading">让计划装进真实的一周</h2>
                </div>
                <StatusTag tone="teal">{selectedPackage.shortName} · 7 日滚动</StatusTag>
              </div>
              <div className="plan-layout">
                <div className="panel task-panel">
                  <div className="panel-heading">
                    <h3>本周任务</h3>
                    <span>{track.weekTasks.length} 项</span>
                  </div>
                  {track.weekTasks.map((task) => (
                    <div className="week-task" key={task.day}>
                      <span className="task-day">{task.day}</span>
                      <div>
                        <strong>{task.title}</strong>
                        <small>
                          {task.done
                            ? `已有真实作答${task.evidenceId ? ` · 证据 ${formatDemoEvidence(task.evidenceId)}` : ""}`
                            : "待学习"}
                        </small>
                      </div>
                      <span className="task-time">{task.minutes} 分钟</span>
                    </div>
                  ))}
                </div>
                <div className="panel capacity-panel">
                  <h3>每周可用总时间</h3>
                  <div className="hours-control">
                    <label htmlFor="weekly-hours">可用时间</label>
                    <div>
                      <input
                        id="weekly-hours"
                        type="range"
                        min="2"
                        max="16"
                        step="0.5"
                        value={hours}
                        onChange={(event) => {
                          setHours(Number(event.target.value));
                          setCapacityConfirmed(false);
                        }}
                      />
                      <output htmlFor="weekly-hours">{hours} 小时</output>
                    </div>
                  </div>
                  <div
                    className={`capacity-result ${capacity.feasible ? "feasible" : "infeasible"}`}
                  >
                    <span>{capacity.feasible ? "✓" : "!"}</span>
                    <div>
                      <strong>{capacity.feasible ? "容量可行" : "容量不足"}</strong>
                      <p>
                        任务总计 {Math.floor(capacity.totalMinutes / 60)} 小时{" "}
                        {capacity.totalMinutes % 60} 分，
                        {capacity.feasible
                          ? `还剩余 ${capacity.remainingMinutes} 分钟。`
                          : `超出 ${Math.abs(capacity.remainingMinutes)} 分钟，请增加时间或调整目标。`}
                      </p>
                    </div>
                  </div>
                  {!capacity.feasible && (
                    <div className="priority-note">
                      系统不会偷偷缩短估时或删除目标。请调整滑块后再开始。
                    </div>
                  )}
                  <dl className="plan-facts">
                    <div>
                      <dt>已完成任务</dt>
                      <dd>
                        {completed.length} 项 · 来自 {selectedPackage.shortName} 本包任务
                      </dd>
                    </div>
                    <div>
                      <dt>当前计划</dt>
                      <dd>{capacityConfirmed ? "版本 P1 · 已确认容量" : "版本 P1 · 尚未确认"}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="primary-button full-width"
                    disabled={!capacity.feasible}
                    onClick={() => {
                      setCapacityConfirmed(true);
                      setPublicStep("learn");
                    }}
                  >
                    确认容量，开始第一单元 →
                  </button>
                  {!capacity.feasible && (
                    <p className="admission-note">
                      容量不足时不能进入学习，也不会自动缩短任务估时。
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {publicStep === "learn" && (
            <div className="journey-section">
              <div className="learning-heading">
                <div>
                  <StatusTag tone="teal">{selectedPackage.shortName} · 公共维护</StatusTag>
                  <h1>{selectedPackage.shortName} 第一单元 · 看清出处，再检验理解</h1>
                </div>
                <p>{track.sourceVersion}</p>
              </div>
              {learningPanel()}
            </div>
          )}
        </>
      ) : (
        <>
          <section className="prototype-hero private-hero">
            <p className="eyebrow">YOUR MATERIAL, YOUR PRIVATE SPACE</p>
            <h1>
              从你的资料开始，
              <br />
              <em>每一步都有据可查。</em>
            </h1>
            <p className="lede">
              为其他学科创建私有空间。逐页了解可用范围，从原文到练习，不让缺页被补造。
            </p>
          </section>
          <nav className="stepper" aria-label="私有资料学习步骤">
            {PRIVATE_STEPS.map(({ step, label }, index) => {
              const reachable =
                step === "upload" ||
                (step === "process" && privateProcessAdmission.allowed) ||
                (step === "learn" && privateLearnAdmission.allowed);
              const reason =
                step === "process"
                  ? privateProcessAdmission.reason
                  : step === "learn"
                    ? privateLearnAdmission.reason
                    : "";
              return (
                <button
                  type="button"
                  key={label}
                  className={privateStep === step ? "current" : ""}
                  onClick={() => reachable && setPrivateStep(step)}
                  disabled={!reachable}
                  title={reachable ? undefined : reason}
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              );
            })}
          </nav>
          {demoBypassControl}

          {privateStep === "upload" && (
            <section className="journey-section narrow-section" aria-labelledby="upload-heading">
              <div className="section-title-row">
                <div>
                  <p className="section-kicker">01 / PRIVATE WORKSPACE</p>
                  <h2 id="upload-heading">创建学习空间</h2>
                </div>
                <StatusTag tone="purple">默认私有</StatusTag>
              </div>
              <div className="panel upload-panel">
                <label className="field-label" htmlFor="subject-name">
                  学科与目标
                </label>
                <input
                  id="subject-name"
                  className="text-input"
                  defaultValue="细胞生物学 · 第三章细胞膜"
                />
                <span className="field-label">资料文件</span>
                <button
                  type="button"
                  className={`dropzone ${fileReady ? "file-ready" : ""}`}
                  onClick={() => setFileReady(true)}
                >
                  <span className="upload-icon" aria-hidden="true">
                    {fileReady ? "✓" : "↑"}
                  </span>
                  <strong>{fileReady ? "cell-biology-ch3-demo.pdf" : "选择演示 PDF"}</strong>
                  <span>
                    {fileReady
                      ? "1.8 MB · 18 页 · 文件版本 v1"
                      : "此原型不会实际上传文件，点击载入 mock 文件"}
                  </span>
                </button>
                <div className="permission-note">
                  <span aria-hidden="true">▣</span>
                  <p>
                    <strong>仅用于我的个人学习</strong>
                    <br />
                    拥有文件不代表可公开再分发。原件与派生内容默认仅本空间可访问。
                  </p>
                </div>
                <div className="upload-limits">
                  支持 PDF · 单文件不超过 20 MB / 100 页 · 加密或损坏文件不会开始处理
                </div>
                <button
                  type="button"
                  className="primary-button full-width"
                  disabled={!fileReady}
                  onClick={() => setPrivateStep("process")}
                >
                  确认权限并开始解析 →
                </button>
                {!fileReady && <p className="admission-note">请先载入演示 PDF，再开始解析。</p>}
              </div>
            </section>
          )}

          {privateStep === "process" && (
            <section className="journey-section" aria-labelledby="process-heading">
              <div className="section-title-row">
                <div>
                  <p className="section-kicker">02 / PAGE-BY-PAGE RESULT</p>
                  <h2 id="process-heading">看清每一页的可用状态</h2>
                </div>
                <StatusTag tone="amber">部分可用 · 16/18 页</StatusTag>
              </div>
              <div className="process-layout">
                <div className="panel page-panel">
                  <div className="file-summary">
                    <span className="file-icon">PDF</span>
                    <div>
                      <strong>cell-biology-ch3-demo.pdf</strong>
                      <small>v1 · 1.8 MB · 18 页</small>
                    </div>
                    <StatusTag tone="green">解析完成</StatusTag>
                  </div>
                  <div className="page-grid">
                    {Array.from({ length: PRIVATE_PAGE_COUNT }, (_, index) => index + 1).map(
                      (page) => {
                        const status = getPageStatus(page);
                        return (
                          <button
                            type="button"
                            key={page}
                            className={`page-cell ${status === "missing" ? "missing" : status === "low-quality" ? "low" : "ok"}`}
                            title={`第 ${page} 页 · ${getPageStatusLabel(page)}`}
                          >
                            <span>{page}</span>
                            <small>
                              {status === "missing"
                                ? "缺页"
                                : status === "low-quality"
                                  ? "低质量"
                                  : "可用"}
                            </small>
                          </button>
                        );
                      },
                    )}
                  </div>
                  <div className="page-legend">
                    <span>
                      <i className="legend-ok" />
                      通过质量门
                    </span>
                    <span>
                      <i className="legend-missing" />
                      原文件缺页
                    </span>
                    <span>
                      <i className="legend-low" />
                      识别质量不足
                    </span>
                  </div>
                </div>
                <div className="panel chapter-panel">
                  <h3>可学习章节</h3>
                  {privateChapters.map((chapter) => {
                    const readiness = getChapterReadiness(chapter);
                    const selected = chapter.id === selectedChapterId;
                    return (
                      <button
                        type="button"
                        key={chapter.id}
                        className={`chapter ${readiness.learnable ? "available" : "blocked"} ${selected ? "selected" : ""}`}
                        disabled={!readiness.learnable}
                        aria-pressed={selected}
                        onClick={() => {
                          if (readiness.learnable) setSelectedChapterId(chapter.id);
                        }}
                      >
                        <StatusTag tone={readiness.learnable ? "green" : "red"}>
                          {readiness.learnable ? "可使用" : "不可选择"}
                        </StatusTag>
                        <strong>
                          {chapter.id} {chapter.title}
                        </strong>
                        <p>{readiness.summary}</p>
                      </button>
                    );
                  })}
                  <div className="missing-warning">
                    缺页和低质量页不会由模型补造，也不会进入讲解或练习。
                  </div>
                  <button
                    type="button"
                    className="primary-button full-width"
                    disabled={!privateLearnAdmission.allowed}
                    onClick={() => setPrivateStep("learn")}
                  >
                    学习 {selectedChapterId} · 查看来源 →
                  </button>
                  {!privateLearnAdmission.allowed && (
                    <p className="admission-note">{privateLearnAdmission.reason}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {privateStep === "learn" && (
            <div className="journey-section">
              <div className="learning-heading">
                <div>
                  <StatusTag tone="purple">
                    {track.subject} · {selectedChapterId}
                  </StatusTag>
                  <h1>
                    {selectedChapterId} {track.lessonTitle}
                  </h1>
                </div>
                <p>{track.sourceVersion} · 估时 35 分钟</p>
              </div>
              {learningPanel()}
            </div>
          )}
        </>
      )}
      <footer className="prototype-footer">
        <span>CL-012a / CL-012b · 基于 CL-001b 首发旅程</span>
        <span>所有人物、文件与结果均为演示数据</span>
      </footer>
    </main>
  );
}

function PagePreviewPanel({ page, onSelect }: { page: number; onSelect: (page: number) => void }) {
  const preview = getPagePreview(page);
  return (
    <section className="page-preview" aria-label="页面预览占位">
      <div className="page-preview-head">
        <StatusTag
          tone={
            preview.status === "available"
              ? "green"
              : preview.status === "missing"
                ? "red"
                : "amber"
          }
        >
          {preview.statusLabel}
        </StatusTag>
        <strong>{preview.heading}</strong>
      </div>
      <fieldset className="page-preview-pages" aria-label="选择预览页">
        {privatePagePreview.pages.map((choice) => (
          <button
            type="button"
            key={choice}
            className={`page-preview-tab ${getPageStatus(choice)} ${choice === page ? "selected" : ""}`}
            aria-pressed={choice === page}
            onClick={() => onSelect(choice)}
          >
            第 {choice} 页 · {getPageStatusLabel(choice)}
          </button>
        ))}
      </fieldset>
      <div className="page-preview-body">
        {preview.textBlocks.length > 0 ? (
          preview.textBlocks.map((block) => <p key={block}>{block}</p>)
        ) : (
          <p className="page-preview-empty">该页没有可访问文本。</p>
        )}
      </div>
      <p className="page-preview-note">{preview.note}</p>
      <p className="page-preview-disclaimer">{privatePagePreview.disclaimer}</p>
    </section>
  );
}
