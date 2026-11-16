import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  acceptanceDecision,
  cancelDecision,
  requestFingerprint,
  resolvePageScope,
  strongEtag,
  syntheticOutcome,
  terminalStatuses,
} from "./local-parse.domain.js";
import type { CreateLocalParseJob } from "./local-parse.dto.js";

const input: CreateLocalParseJob = {
  documentId: "10500000-0000-4000-8000-000000000001",
  versionId: "10500000-0000-4000-8000-000000000002",
  sourceRevision: 3,
  profileId: "local-synthetic-v1",
  fixture: "success",
  all: true,
};

describe("CL-105 local parse admission semantics (pure, no DB/HTTP)", () => {
  it("requires exactly one of all or an explicit page set", () => {
    expect(resolvePageScope(input)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(resolvePageScope({ ...input, all: undefined, pages: [2, 4] })).toEqual([2, 4]);
    expect(() => resolvePageScope({ ...input, pages: [1, 2] })).toThrow(
      UnprocessableEntityException,
    );
    expect(() => resolvePageScope({ ...input, all: undefined, pages: undefined })).toThrow(
      UnprocessableEntityException,
    );
    expect(() => resolvePageScope({ ...input, all: undefined, pages: [1, 1] })).toThrow(
      UnprocessableEntityException,
    );
  });

  it("keeps the request fingerprint stable across page order but distinct across payloads", () => {
    const a = requestFingerprint({ ...input, all: undefined, pages: [3, 1] }, [3, 1]);
    const b = requestFingerprint({ ...input, all: undefined, pages: [1, 3] }, [1, 3]);
    const other = requestFingerprint({ ...input, sourceRevision: 4 }, [1, 2, 3, 4, 5, 6]);
    expect(a).toBe(b);
    expect(other).not.toBe(a);
  });

  it("maps fixtures onto the existing seven statuses and the requested-page denominator", () => {
    expect(syntheticOutcome("success", [1, 2, 3, 4, 5, 6])).toMatchObject({ status: "SUCCEEDED" });
    expect(syntheticOutcome("blank", [1, 2, 3, 4, 5, 6])).toMatchObject({ status: "SUCCEEDED" });
    expect(syntheticOutcome("fail", [1, 2])).toEqual({
      status: "FAILED",
      pageResults: [
        { pageIndex: 1, status: "failed" },
        { pageIndex: 2, status: "failed" },
      ],
    });
    // 显式页集合只回报请求页，分母不因夹具全量而改变。
    expect(syntheticOutcome("partial", [1, 2]).pageResults).toEqual([
      { pageIndex: 1, status: "success" },
      { pageIndex: 2, status: "failed" },
    ]);
    expect(syntheticOutcome("pending", [1])).toEqual({ status: "QUEUED", pageResults: null });
  });

  it("uses PARTIAL_READY only for a bounded mix of usable and broken pages", () => {
    expect(syntheticOutcome("partial", [1, 2, 3, 4, 5, 6]).status).toBe("PARTIAL_READY");
    expect(syntheticOutcome("partial", [1, 2])).toEqual({
      status: "PARTIAL_READY",
      pageResults: [
        { pageIndex: 1, status: "success" },
        { pageIndex: 2, status: "failed" },
      ],
    });
    // 分母是请求集合：只请求页 1（该页成功）时，本次有界尝试范围内没有失败，故为 SUCCEEDED。
    // 这不是"整个文档已完成"，客户端必须同时展示 requestedPages 与页结果。
    expect(syntheticOutcome("partial", [1]).status).toBe("SUCCEEDED");
  });

  it("treats every terminal state as non-revivable and idempotent on cancel", () => {
    for (const status of terminalStatuses) {
      expect(
        cancelDecision({
          status,
          epoch: 2,
          snapshotId: "s",
          requestedPages: [1],
          pageResults: null,
        }),
      ).toEqual({ changed: false });
    }
    expect(
      cancelDecision({
        status: "QUEUED",
        epoch: 1,
        snapshotId: "s",
        requestedPages: [1],
        pageResults: null,
      }),
    ).toEqual({ changed: true, epoch: 2, terminationState: "requested" });
  });

  it("fences late receipts by snapshot/epoch and rejects any post-cancel admission", () => {
    const state = {
      status: "QUEUED",
      epoch: 1,
      snapshotId: "00000000-0000-4000-8000-000000000009",
      requestedPages: [1, 2],
      pageResults: null,
    };
    expect(() =>
      acceptanceDecision(state, { snapshotId: state.snapshotId, epoch: 2, pages: [] }),
    ).toThrow(ConflictException);
    expect(() =>
      acceptanceDecision(
        { ...state, status: "CANCELLED", epoch: 2 },
        {
          snapshotId: state.snapshotId,
          epoch: 2,
          pages: [
            { pageIndex: 1, status: "success" },
            { pageIndex: 2, status: "success" },
          ],
        },
      ),
    ).toThrow(ConflictException);
    // 页集合必须恰等于请求范围；越界/缺页/重复都拒收，不补造。
    expect(() =>
      acceptanceDecision(state, {
        snapshotId: state.snapshotId,
        epoch: 1,
        pages: [{ pageIndex: 1, status: "success" }],
      }),
    ).toThrow(ConflictException);
    expect(() =>
      acceptanceDecision(state, {
        snapshotId: state.snapshotId,
        epoch: 1,
        pages: [
          { pageIndex: 1, status: "success" },
          { pageIndex: 3, status: "success" },
        ],
      }),
    ).toThrow(ConflictException);
    expect(
      acceptanceDecision(state, {
        snapshotId: state.snapshotId,
        epoch: 1,
        pages: [
          { pageIndex: 1, status: "success" },
          { pageIndex: 2, status: "missing" },
        ],
      }),
    ).toEqual({
      status: "PARTIAL_READY",
      pageResults: [
        { pageIndex: 1, status: "success" },
        { pageIndex: 2, status: "missing" },
      ],
    });
  });

  it("derives a strong ETag that changes with the visible job state", () => {
    const base = {
      id: "00000000-0000-4000-8000-000000000001",
      status: "QUEUED",
      revision: 1,
      epoch: 1,
      terminationState: "not_requested",
      pageResults: null,
    };
    expect(strongEtag(base)).toMatch(/^"[0-9a-f]{64}"$/);
    expect(strongEtag({ ...base, epoch: 2, terminationState: "requested" })).not.toBe(
      strongEtag(base),
    );
  });
});
