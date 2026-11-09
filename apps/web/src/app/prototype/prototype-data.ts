export type PackageId = "408" | "cet4" | "cet6";

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

export const weekTasks = [
  { day: "周一", title: "线性表：诊断与讲解", minutes: 45, done: true },
  { day: "周二", title: "栈和队列：练习与回忆", minutes: 55, done: true },
  { day: "周三", title: "树的基本概念", minutes: 60, done: false },
  { day: "周四", title: "二叉树遍历", minutes: 70, done: false },
  { day: "周五", title: "错题回顾与退出测", minutes: 50, done: false },
  { day: "周六", title: "图的存储结构", minutes: 90, done: false },
  { day: "周日", title: "本周结构化回忆", minutes: 70, done: false },
];

export const questions = [
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
] as const;

export const exitQuestion = {
  stem: "退出测 · 请回忆：顺序表与链表在按位查找上的核心差异是什么？",
  options: [
    "两者都只能顺序查找",
    "顺序表可随机存取，链表通常需顺次查找",
    "链表一定能 O(1) 按位查找",
    "二者没有差异",
  ],
  answer: 1,
  explanation: "已记录本次作答。结果仅构成一次学习证据，不代表已经掌握该技能。",
};

export function getCapacity(hours: number) {
  const totalMinutes = weekTasks.reduce((sum, task) => sum + task.minutes, 0);
  const availableMinutes = Math.round(hours * 60);
  return {
    totalMinutes,
    availableMinutes,
    remainingMinutes: availableMinutes - totalMinutes,
    feasible: availableMinutes >= totalMinutes,
  };
}
