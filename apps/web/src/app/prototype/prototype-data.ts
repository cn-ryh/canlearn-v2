export type PackageId = "408" | "cet4" | "cet6";
export type Journey = "public" | "private";

export interface SubjectPackage {
  id: PackageId;
  name: string;
  shortName: string;
  maintenance: string;
  coverage: string;
  source: string;
  license: string;
  reviewedUnits: number;
  totalUnits: number;
  tone: string;
}

export const subjectPackages: SubjectPackage[] = [
  {
    id: "408",
    name: "计算机学科专业基础 · 408",
    shortName: "408",
    maintenance: "公共维护 · 每月复核",
    coverage: "数据结构 8/8 · 计组 5/7 · 操作系统 4/6 · 计网 3/6",
    source: "公开考试大纲、授权讲义与原创编校内容",
    license: "逐项记录来源与许可；示例内容仅用于原型演示",
    reviewedUnits: 20,
    totalUnits: 27,
    tone: "teal",
  },
  {
    id: "cet4",
    name: "大学英语四级 · CET-4",
    shortName: "CET-4",
    maintenance: "公共维护 · 部分审校",
    coverage: "词汇与阅读已覆盖 · 写作试用 · 听力暂不支持",
    source: "公开考试说明与原创学习材料",
    license: "无可用音频权利与处理能力，不提供听力测量",
    reviewedUnits: 6,
    totalUnits: 10,
    tone: "amber",
  },
  {
    id: "cet6",
    name: "大学英语六级 · CET-6",
    shortName: "CET-6",
    maintenance: "公共维护 · 部分审校",
    coverage: "词汇与阅读已覆盖 · 翻译试用 · 听力暂不支持",
    source: "公开考试说明与原创学习材料",
    license: "无可用音频权利与处理能力，不提供听力测量",
    reviewedUnits: 5,
    totalUnits: 10,
    tone: "violet",
  },
];

export interface WeekTask {
  day: string;
  title: string;
  minutes: number;
  done: boolean;
  /**
   * 该任务完成时产生的演示证据编号。
   *
   * 真实契约里证据 ID 由服务端签发；原型用固定编号，展示时必须同时给出
   * `DEMO_EVIDENCE_NOTICE`，不得让参与者把它当成持久化事实。
   */
  evidenceId?: string;
}

export interface LearningQuestion {
  id: string;
  stem: string;
  options: readonly string[];
  answer: number;
  explanation: string;
  source: string;
  status: "已审校" | "试用生成";
}

export interface LearningTrack {
  journey: Journey;
  /** 私有旅程没有公共包，故为 null；公共旅程等于所属包 ID。 */
  packageId: PackageId | null;
  subject: string;
  lessonTitle: string;
  lessonBody: string;
  conceptTitle: string;
  conceptBody: string;
  skill: string;
  sourceVersion: string;
  reviewedCount: number;
  totalCount: number;
  weekTasks: readonly WeekTask[];
  questions: readonly LearningQuestion[];
  exitQuestion: LearningQuestion;
  /** 退出测记录展示的演示证据编号。 */
  evidenceId: string;
}

/** `#DEMO-` 命名空间是原型构造的演示编号，不是服务端签发的真实证据 ID。 */
export const DEMO_EVIDENCE_NOTICE = "演示编号（非服务端签发）";

const DEMO_ID_PATTERN = /^#DEMO-[A-Za-z0-9-]+$/;

function assertDemoId(evidenceId: string): void {
  if (!DEMO_ID_PATTERN.test(evidenceId)) {
    throw new Error(`Not a demo evidence id: ${evidenceId}`);
  }
}

/**
 * 把演示编号渲染成可直接展示的文本：始终附带 `DEMO_EVIDENCE_NOTICE`。
 *
 * 所有 UI 展示都必须经过本函数，避免某个入口漏掉“非服务端签发”的说明；
 * 测试会断言输出恒定包含该标注。
 */
export function formatDemoEvidence(evidenceId: string): string {
  assertDemoId(evidenceId);
  return `${evidenceId} · ${DEMO_EVIDENCE_NOTICE}`;
}

/** 收集一组周任务的证据编号，保持任务顺序并跳过未完成/无编号的任务。 */
export function getEvidenceIds(tasks: readonly WeekTask[]): string[] {
  return tasks
    .filter((task) => task.done)
    .map((task) => task.evidenceId)
    .filter((evidenceId): evidenceId is string => evidenceId !== undefined);
}

/** 已完成任务数一律从本周任务派生，避免写死数字后与任务表脱节。 */
export function getCompletedTasks(tasks: readonly WeekTask[]): WeekTask[] {
  return tasks.filter((task) => task.done);
}

const week408: readonly WeekTask[] = [
  { day: "周一", title: "线性表：诊断与讲解", minutes: 45, done: true, evidenceId: "#DEMO-027" },
  { day: "周二", title: "栈和队列：练习与回忆", minutes: 55, done: true, evidenceId: "#DEMO-028" },
  { day: "周三", title: "树的基本概念", minutes: 60, done: false },
  { day: "周四", title: "二叉树遍历", minutes: 70, done: false },
  { day: "周五", title: "错题回顾与退出测", minutes: 50, done: false },
  { day: "周六", title: "图的存储结构", minutes: 90, done: false },
  { day: "周日", title: "本周结构化回忆", minutes: 70, done: false },
];

const weekCet4: readonly WeekTask[] = [
  {
    day: "周一",
    title: "词汇：高频词根与复习",
    minutes: 40,
    done: true,
    evidenceId: "#DEMO-C4-01",
  },
  { day: "周二", title: "阅读：段落主旨定位", minutes: 50, done: true, evidenceId: "#DEMO-C4-02" },
  { day: "周三", title: "词汇：同义替换辨析", minutes: 45, done: false },
  { day: "周四", title: "阅读：细节题定位", minutes: 55, done: false },
  { day: "周五", title: "写作：模板试用与改写", minutes: 40, done: false },
  { day: "周六", title: "阅读：长难句拆解", minutes: 60, done: false },
  { day: "周日", title: "本周词汇与阅读回忆", minutes: 45, done: false },
];

const weekCet6: readonly WeekTask[] = [
  {
    day: "周一",
    title: "词汇：学术词汇与搭配",
    minutes: 45,
    done: true,
    evidenceId: "#DEMO-C6-01",
  },
  { day: "周二", title: "阅读：篇章结构分析", minutes: 55, done: true, evidenceId: "#DEMO-C6-02" },
  { day: "周三", title: "翻译：句式转换练习", minutes: 50, done: false },
  { day: "周四", title: "阅读：作者态度推断", minutes: 60, done: false },
  { day: "周五", title: "词汇：易混词辨析", minutes: 40, done: false },
  { day: "周六", title: "翻译：长句拆分", minutes: 55, done: false },
  { day: "周日", title: "本周阅读与翻译回忆", minutes: 50, done: false },
];

const questions408: readonly LearningQuestion[] = [
  {
    id: "q1",
    stem: "在顺序表中，已知第 i 个元素的存储位置，查找第 i+1 个元素的时间复杂度是？",
    options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
    answer: 0,
    explanation: "顺序表支持随机存取，可由当前元素地址直接计算下一元素地址。",
    source: "《数据结构学习导引》原型单元 · 2.1 节 · 内容版本 v3",
    status: "已审校",
  },
  {
    id: "q2",
    stem: "若逻辑上相邻的元素在物理位置上也相邻，这种存储结构称为？",
    options: ["链式存储", "顺序存储", "索引存储", "散列存储"],
    answer: 1,
    explanation: "顺序存储用一组地址连续的存储单元依次存放逻辑上相邻的数据元素。",
    source: "AI 依据当前讲解生成 · 尚未进入正式诊断",
    status: "试用生成",
  },
];

const exit408: LearningQuestion = {
  id: "exit-408",
  stem: "退出测 · 请回忆：顺序表与链表在按位查找上的核心差异是什么？",
  options: [
    "两者都只能顺序查找",
    "顺序表可随机存取，链表通常需顺次查找",
    "链表一定能 O(1) 按位查找",
    "二者没有差异",
  ],
  answer: 1,
  explanation: "已记录本次作答。结果仅构成一次学习证据，不代表已经掌握该技能。",
  source: "《数据结构学习导引》原型单元 · 2.1 节 · 内容版本 v3",
  status: "已审校",
};

const questionsCet4: readonly LearningQuestion[] = [
  {
    id: "q-c4-1",
    stem: "在段落主旨题中，rapid 一词最接近的含义是？",
    options: ["缓慢的", "快速的", "模糊的", "稳定的"],
    answer: 1,
    explanation: "rapid 表示“快速的”，与 fast/quick 同义，常修饰变化或增长。",
    source: "《大学英语四级阅读原型单元》· 词汇 1.2 节 · 内容版本 v1",
    status: "已审校",
  },
  {
    id: "q-c4-2",
    stem: "阅读细节题定位时，最有效的第一步是？",
    options: [
      "通读全文并逐词翻译",
      "先看题干关键词再回原文定位",
      "只读首尾两段",
      "忽略题干直接猜答案",
    ],
    answer: 1,
    explanation: "先用题干关键词缩小范围，再回原文定位，可避免逐词翻译带来的时间浪费。",
    source: "AI 依据当前讲解生成 · 尚未进入正式诊断",
    status: "试用生成",
  },
];

const exitCet4: LearningQuestion = {
  id: "exit-c4",
  stem: "退出测 · 请回忆：阅读主旨题与细节题的定位策略有何不同？",
  options: [
    "两者都只看第一段",
    "主旨题看整体结构，细节题按关键词定位",
    "细节题不需要回原文",
    "两者没有差别",
  ],
  answer: 1,
  explanation: "已记录本次作答。结果仅构成一次学习证据，不代表已经掌握该技能。",
  source: "《大学英语四级阅读原型单元》· 词汇 1.2 节 · 内容版本 v1",
  status: "已审校",
};

const questionsCet6: readonly LearningQuestion[] = [
  {
    id: "q-c6-1",
    stem: "学术语篇中 constitute 最接近的含义是？",
    options: ["构成", "拒绝", "推测", "削弱"],
    answer: 0,
    explanation: "constitute 表示“构成、组成”，常用于描述整体与部分的关系。",
    source: "《大学英语六级阅读原型单元》· 词汇 2.1 节 · 内容版本 v1",
    status: "已审校",
  },
  {
    id: "q-c6-2",
    stem: "分析篇章结构时，识别“让步—转折”信号词的主要作用是？",
    options: ["判断作者最终立场", "统计文章字数", "确定段落数量", "判断是否为议论文"],
    answer: 0,
    explanation: "让步之后常接转折，转折句往往承载作者真正立场，是结构分析的关键锚点。",
    source: "AI 依据当前讲解生成 · 尚未进入正式诊断",
    status: "试用生成",
  },
];

const exitCet6: LearningQuestion = {
  id: "exit-c6",
  stem: "退出测 · 请回忆：如何看待让步句与作者最终立场的关系？",
  options: [
    "让步句即作者立场",
    "让步常为转折铺垫，立场多在转折之后",
    "两者完全无关",
    "只需统计让步句数量",
  ],
  answer: 1,
  explanation: "已记录本次作答。结果仅构成一次学习证据，不代表已经掌握该技能。",
  source: "《大学英语六级阅读原型单元》· 词汇 2.1 节 · 内容版本 v1",
  status: "已审校",
};

const track408: LearningTrack = {
  journey: "public",
  packageId: "408",
  subject: "计算机 · 408",
  lessonTitle: "线性表与顺序存储",
  lessonBody:
    "线性表是具有相同特性的数据元素的有限序列。顺序存储把逻辑上相邻的元素放在物理上相邻的位置，因此可以计算地址并随机存取。",
  conceptTitle: "按位查找",
  conceptBody: "知道起始地址和元素大小，即可用 O(1) 时间定位。",
  skill: "比较存储结构",
  sourceVersion: "单元 v3 · 2.1 节",
  reviewedCount: 20,
  totalCount: 27,
  weekTasks: week408,
  questions: questions408,
  exitQuestion: exit408,
  evidenceId: "#DEMO-031",
};

const trackCet4: LearningTrack = {
  journey: "public",
  packageId: "cet4",
  subject: "英语 · CET-4",
  lessonTitle: "词汇与阅读：主旨定位",
  lessonBody:
    "四级阅读的主旨题先看整体结构与首尾句，细节题先提取题干关键词再回原文定位。词汇复习优先巩固高频词根与同义替换。",
  conceptTitle: "定位策略",
  conceptBody: "主旨看结构，细节看关键词，避免逐词翻译。",
  skill: "阅读定位",
  sourceVersion: "单元 v1 · 词汇 1.2 节",
  reviewedCount: 6,
  totalCount: 10,
  weekTasks: weekCet4,
  questions: questionsCet4,
  exitQuestion: exitCet4,
  evidenceId: "#DEMO-041",
};

const trackCet6: LearningTrack = {
  journey: "public",
  packageId: "cet6",
  subject: "英语 · CET-6",
  lessonTitle: "学术词汇与篇章结构",
  lessonBody:
    "六级阅读更强调篇章结构与作者态度。识别让步—转折信号词是判断作者最终立场的核心，翻译练习需先拆长句再重组。",
  conceptTitle: "结构信号",
  conceptBody: "让步铺垫立场，转折句常承载作者真实态度。",
  skill: "篇章结构分析",
  sourceVersion: "单元 v1 · 词汇 2.1 节",
  reviewedCount: 5,
  totalCount: 10,
  weekTasks: weekCet6,
  questions: questionsCet6,
  exitQuestion: exitCet6,
  evidenceId: "#DEMO-051",
};

const questionsPrivate: readonly LearningQuestion[] = [
  {
    id: "q-p-1",
    stem: "细胞膜的流动镶嵌模型强调膜成分具有什么特点？",
    options: ["完全刚性", "具有一定的流动性", "只能单向运输", "不含蛋白质"],
    answer: 1,
    explanation: "磷脂双分子层与膜蛋白都可侧向移动，因此膜成分具有一定的流动性。",
    source: "《细胞生物学》演示文件 · 版本 1 · PDF 第 12 页",
    status: "已审校",
  },
  {
    id: "q-p-2",
    stem: "细胞膜的基本支架是？",
    options: ["磷脂双分子层", "纤维素层", "核糖体", "细胞壁"],
    answer: 0,
    explanation: "磷脂双分子层构成膜的基本支架，蛋白质以不同方式镶嵌其中。",
    source: "AI 依据当前讲解生成 · 尚未进入正式诊断",
    status: "试用生成",
  },
];

const exitPrivate: LearningQuestion = {
  id: "exit-private",
  stem: "退出测 · 请回忆：流动镶嵌模型如何解释膜的选择透过性？",
  options: [
    "膜完全不可渗透",
    "膜蛋白与磷脂的流动性共同决定选择性运输",
    "只有水能通过",
    "膜与运输无关",
  ],
  answer: 1,
  explanation: "已记录本次作答。结果仅构成一次学习证据，不代表已经掌握该技能。",
  source: "《细胞生物学》演示文件 · 版本 1 · PDF 第 12 页",
  status: "已审校",
};

const trackPrivate: LearningTrack = {
  journey: "private",
  packageId: null,
  subject: "细胞生物学 · 私有资料",
  lessonTitle: "细胞膜的流动镶嵌模型",
  lessonBody:
    "细胞膜主要由脂质和蛋白质构成。磷脂双分子层构成膜的基本支架，蛋白质分子以不同方式镶嵌其中，膜成分具有一定的流动性。",
  conceptTitle: "结构特点",
  conceptBody: "磷脂双分子层 + 多样化膜蛋白",
  skill: "解释膜结构",
  sourceVersion: "PDF v1 · p.12",
  reviewedCount: 0,
  totalCount: 0,
  weekTasks: [],
  questions: questionsPrivate,
  exitQuestion: exitPrivate,
  evidenceId: "#DEMO-032",
};

export const privateLearningTrack = trackPrivate;

export const publicLearningTracks: Record<PackageId, LearningTrack> = {
  "408": track408,
  cet4: trackCet4,
  cet6: trackCet6,
};

/** 公共旅程各包的学习轨道；私有旅程见 `privateLearningTrack`。 */
export const learningTracks: Record<PackageId, LearningTrack> = publicLearningTracks;

/** 兼容既有导出：408 是公共旅程的默认包。 */
export const weekTasks = publicLearningTracks["408"].weekTasks;
export const questions = publicLearningTracks["408"].questions;
export const exitQuestion = publicLearningTracks["408"].exitQuestion;

/** 按旅程与包 ID 解析实际轨道；私有旅程忽略包 ID。 */
export function resolveTrack(journey: Journey, packageId: PackageId): LearningTrack {
  return journey === "private" ? trackPrivate : publicLearningTracks[packageId];
}

export function getCapacity(hours: number, tasks: readonly WeekTask[] = weekTasks) {
  const totalMinutes = tasks.reduce((sum, task) => sum + task.minutes, 0);
  const availableMinutes = Math.round(hours * 60);
  return {
    totalMinutes,
    availableMinutes,
    remainingMinutes: availableMinutes - totalMinutes,
    feasible: availableMinutes >= totalMinutes,
  };
}

// ---------------------------------------------------------------------------
// 准入闸门：把“演示导航”与“真实准入”在界面上分开。
// ---------------------------------------------------------------------------

export interface Admission {
  allowed: boolean;
  /** 不可用时必须在界面上显示的原因；为空字符串表示无需说明。 */
  reason: string;
}

/** 公共旅程进入学习：必须先确认容量，且容量可行。 */
export function getPublicLearnAdmission(input: {
  capacityConfirmed: boolean;
  capacityFeasible: boolean;
}): Admission {
  if (!input.capacityFeasible) {
    return { allowed: false, reason: "本周可用时间不足以容纳全部任务，请调整时间或先缩范围。" };
  }
  if (!input.capacityConfirmed) {
    return { allowed: false, reason: "请先确认本周容量，再进入学习与留证。" };
  }
  return { allowed: true, reason: "" };
}

/** 私有旅程进入解析：必须先载入演示文件。 */
export function getPrivateProcessAdmission(input: { fileReady: boolean }): Admission {
  if (!input.fileReady) {
    return { allowed: false, reason: "请先载入演示 PDF，再开始解析。" };
  }
  return { allowed: true, reason: "" };
}

/** 私有旅程进入学习：必须已解析且选择了可用章节。 */
export function getPrivateLearnAdmission(input: {
  fileReady: boolean;
  chapterLearnable: boolean;
}): Admission {
  if (!input.fileReady) {
    return { allowed: false, reason: "请先载入演示 PDF，再进入学习与留证。" };
  }
  if (!input.chapterLearnable) {
    return { allowed: false, reason: "请先选择一个通过质量门的章节，再进入学习与留证。" };
  }
  return { allowed: true, reason: "" };
}

/** 只有带准入闸门的旅程才受“演示模式”开关影响；旅程 C 不在此列。 */
export function journeyHasAdmissionGate(journey: "public" | "private" | "recovery"): boolean {
  return journey !== "recovery";
}

/** 演示模式按旅程分别记录，切换旅程不清除既有选择。 */
export type DemoBypassMap = Record<"public" | "private", boolean>;

export const initialDemoBypass: DemoBypassMap = { public: false, private: false };

// ---------------------------------------------------------------------------
// 私有资料的页面状态与章节可用性。
//
// 关键事实：第 7 页缺页属于 2.4，第 14 页低质量属于 3.2；3.1（10–13 页）
// 因此是完整可用的。任何“缺页导致 3.1 不可学习”的说法都与这组数据不符。
// ---------------------------------------------------------------------------

export type PagePreviewStatus = "available" | "missing" | "low-quality";

export const PRIVATE_PAGE_COUNT = 18;

/** 固定夹具的逐页状态：仅第 7 页缺页、第 14 页低质量，其余可用。 */
export function getPageStatus(page: number): PagePreviewStatus {
  if (page === 7) return "missing";
  if (page === 14) return "low-quality";
  return "available";
}

const statusLabels: Record<PagePreviewStatus, string> = {
  available: "通过质量门",
  missing: "原文件缺页",
  "low-quality": "识别质量不足",
};

export function getPageStatusLabel(page: number): string {
  return statusLabels[getPageStatus(page)];
}

export interface PrivateChapter {
  id: string;
  title: string;
  pageStart: number;
  pageEnd: number;
}

/**
 * 私有资料的章节页范围。
 *
 * 2.4 是为了容纳“第 7 页缺页”而显式建出的章节；它的标题属于原型构造，
 * 不代表真实教材目录，需产品确认后再固化。
 */
export const privateChapters: readonly PrivateChapter[] = [
  { id: "2.4", title: "膜运输概述", pageStart: 7, pageEnd: 9 },
  { id: "3.1", title: "细胞膜的结构", pageStart: 10, pageEnd: 13 },
  { id: "3.2", title: "跨膜运输", pageStart: 14, pageEnd: 16 },
];

export interface ChapterReadiness {
  chapter: PrivateChapter;
  rangeLabel: string;
  usablePages: readonly number[];
  missingPages: readonly number[];
  lowQualityPages: readonly number[];
  learnable: boolean;
  summary: string;
}

/** 章节可用性完全由页面状态推导，避免章节文案与页状态各说各话。 */
export function getChapterReadiness(chapter: PrivateChapter): ChapterReadiness {
  const pages = Array.from(
    { length: chapter.pageEnd - chapter.pageStart + 1 },
    (_, index) => chapter.pageStart + index,
  );
  const usablePages = pages.filter((page) => getPageStatus(page) === "available");
  const missingPages = pages.filter((page) => getPageStatus(page) === "missing");
  const lowQualityPages = pages.filter((page) => getPageStatus(page) === "low-quality");
  const rangeLabel = `第 ${chapter.pageStart}–${chapter.pageEnd} 页`;
  const learnable = missingPages.length === 0 && lowQualityPages.length === 0;
  const summary = learnable
    ? `${rangeLabel} · 章节内 ${usablePages.length}/${pages.length} 页通过质量门`
    : `${rangeLabel} · 章节内 ${usablePages.length}/${pages.length} 页通过质量门，缺页和低质量页不在本章范围内`;

  return { chapter, rangeLabel, usablePages, missingPages, lowQualityPages, learnable, summary };
}

/** 3.1 是原型默认选中的可用章节。 */
export function getDefaultChapter(): PrivateChapter {
  const chapter = privateChapters.find((item) => item.id === "3.1") ?? privateChapters[0];
  if (!chapter) throw new Error("privateChapters must not be empty");
  return chapter;
}

export interface PagePreview {
  page: number;
  status: PagePreviewStatus;
  statusLabel: string;
  heading: string;
  textBlocks: readonly string[];
  note: string;
}

const pageHeadings: Record<number, string> = {
  7: "2.4 膜运输概述（缺页）",
  12: "3.1 细胞膜的结构",
  13: "3.1 流动镶嵌模型要点",
  14: "3.2 跨膜运输（识别质量不足）",
};

const pageTextBlocks: Record<number, readonly string[]> = {
  7: [],
  12: [
    "细胞膜主要由脂质和蛋白质构成。",
    "磷脂双分子层构成膜的基本支架，蛋白质分子以不同方式镶嵌其中。",
    "膜成分具有一定的流动性。",
  ],
  13: ["流动镶嵌模型强调膜蛋白的分布不均匀。", "膜的整体结构可随环境变化而调整。"],
  14: ["该页识别质量不足，文本可能不完整，不作为原文事实。"],
};

/** 预览页固定为 7/12/13/14，分别覆盖缺页、可用、可用、低质量四种状态。 */
export const privatePagePreview = {
  pages: [7, 12, 13, 14] as const,
  disclaimer: "这是原型占位预览，不是真实 PDF 渲染。",
};

export function getPagePreview(page: number): PagePreview {
  const status = getPageStatus(page);
  return {
    page,
    status,
    statusLabel: statusLabels[status],
    heading: pageHeadings[page] ?? `第 ${page} 页`,
    textBlocks: pageTextBlocks[page] ?? ["该页没有可标注的可访问文本。"],
    note:
      status === "available"
        ? "该页通过质量门，可作为引用来源。"
        : status === "missing"
          ? "原文件缺页，不做模型补造。"
          : "识别质量不足，需补充清晰原稿。",
  };
}
