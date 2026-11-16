// Fixed synthetic page results for the CL-105 local slice. No real PDF, MinerU call or model is involved.

import type { LocalParseFixture } from "./local-parse.dto.js";
import { localParsePageCount } from "./local-parse.dto.js";

export const localParseFixture = {
  id: "cl105-synthetic-v1",
  documentId: "10500000-0000-4000-8000-000000000001",
  versionId: "10500000-0000-4000-8000-000000000002",
  spaceId: "10500000-0000-4000-8000-000000000003",
  actorId: "10500000-0000-4000-8000-000000000004",
} as const;

const statuses: Record<LocalParseFixture, (string | null)[]> = {
  success: Array.from({ length: localParsePageCount }, () => "success"),
  partial: ["success", "failed", "success", "missing", "failed", "success"],
  blank: Array.from({ length: localParsePageCount }, () => "blank"),
  fail: Array.from({ length: localParsePageCount }, () => "failed"),
  // 未完成：本地模拟"已派发但未回执"，仅用于取消/晚到结果验证。
  pending: Array.from({ length: localParsePageCount }, () => null),
};

export type LocalPageStatus = "success" | "blank" | "failed" | "missing";

// 只按请求页返回逐页结果；分母始终是请求集合，不因失败页缩小。
export function fixturePages(fixture: LocalParseFixture, requested: number[]) {
  const all = statuses[fixture];
  if (all.some((status) => status === null)) return null;
  return requested.map((pageIndex) => ({
    pageIndex,
    status: all[pageIndex - 1] as LocalPageStatus,
  }));
}

// 沿用 CL-008a 七状态：全成功或全空白为 SUCCEEDED，有成功且有失败/缺页为 PARTIAL_READY，
// 无任何可用页（含全失败）为 FAILED。
export function fixtureStatus(pages: { status: string }[]) {
  const usable = pages.filter((page) => page.status === "success").length;
  const broken = pages.filter(
    (page) => page.status === "failed" || page.status === "missing",
  ).length;
  if (usable > 0 && broken > 0) return "PARTIAL_READY" as const;
  if (broken > 0) return "FAILED" as const;
  return "SUCCEEDED" as const;
}
