import type { SmokeMode } from "./smoke.dto.js";

export const fixture = {
  id: "cl013-original-v1",
  sourceId: "01300000-0000-4000-8000-000000000001",
  versionId: "01300000-0000-4000-8000-000000000002",
  spaceId: "01300000-0000-4000-8000-000000000003",
  actorId: "01300000-0000-4000-8000-000000000004",
} as const;

export function fixtureResult(mode: SmokeMode) {
  const statuses = {
    success: ["success", "success", "success"],
    partial: ["success", "failed", "missing"],
    blank: ["blank", "blank", "blank"],
    fail: ["failed", "failed", "failed"],
  } as const;
  return {
    fixtureId: fixture.id,
    pages: statuses[mode].map((status, index) => ({ pageIndex: index + 1, status })),
  };
}

export function fixtureStatus(mode: SmokeMode) {
  if (mode === "partial") return "PARTIAL_READY" as const;
  if (mode === "fail") return "FAILED" as const;
  return "SUCCEEDED" as const;
}
