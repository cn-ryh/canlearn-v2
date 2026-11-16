// CL-105 本地隔离切片的纯判定逻辑：与数据库/HTTP 无关，便于逐条验证准入、范围、幂等与终态语义。
import { createHash } from "node:crypto";
import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import {
  type CreateLocalParseJob,
  type LocalParseFixture,
  localParsePageCount,
} from "./local-parse.dto.js";
import { fixturePages, fixtureStatus, type LocalPageStatus } from "./local-parse.fixture.js";

// 沿用既有 job_status：四个终态不可复活。
export const terminalStatuses = new Set(["SUCCEEDED", "PARTIAL_READY", "FAILED", "CANCELLED"]);

export type PageResult = { pageIndex: number; status: LocalPageStatus };

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// 请求指纹只覆盖有业务意义的语义字段；页集合排序后再散列，避免顺序差异造成假冲突。
export function requestFingerprint(input: CreateLocalParseJob, requestedPages: number[]) {
  return digest({
    documentId: input.documentId.toLowerCase(),
    versionId: input.versionId.toLowerCase(),
    sourceRevision: input.sourceRevision,
    profileId: input.profileId,
    fixture: input.fixture,
    requestedPages: [...requestedPages].sort((a, b) => a - b),
  });
}

// `all` 与显式页集合二选一；两者同给或都不给都属于语义错误（422），不是结构错误（400）。
export function resolvePageScope(input: CreateLocalParseJob): number[] {
  if (input.all === true && input.pages !== undefined)
    throw new UnprocessableEntityException("LOCAL_PARSE_PAGE_SCOPE_AMBIGUOUS");
  if (input.all !== true && input.pages === undefined)
    throw new UnprocessableEntityException("LOCAL_PARSE_PAGE_SCOPE_REQUIRED");
  if (input.all === true)
    return Array.from({ length: localParsePageCount }, (_, index) => index + 1);
  const pages = [...(input.pages ?? [])];
  if (new Set(pages).size !== pages.length)
    throw new UnprocessableEntityException("LOCAL_PARSE_PAGE_SCOPE_DUPLICATED");
  return pages;
}

// 固定夹具产生的终态与逐页结果。`pending` 表示尚未回执，交给取消/晚到结果路径。
export function syntheticOutcome(fixture: LocalParseFixture, requestedPages: number[]) {
  const pages = fixturePages(fixture, requestedPages);
  if (!pages) return { status: "QUEUED" as const, pageResults: null };
  return { status: fixtureStatus(pages), pageResults: pages };
}

// 强 ETag 由当前视图的稳定字段计算；不包含 createdAt/updatedAt 之外的易变顺序差异。
export function strongEtag(view: {
  id: string;
  status: string;
  revision: number;
  epoch: number;
  terminationState: string;
  pageResults: unknown;
}) {
  return `"${digest({
    id: view.id,
    status: view.status,
    revision: view.revision,
    epoch: view.epoch,
    terminationState: view.terminationState,
    pageResults: view.pageResults,
  })}"`;
}

export type JobState = {
  status: string;
  epoch: number;
  snapshotId: string;
  requestedPages: number[];
  pageResults: PageResult[] | null;
};

// 取消只对非终态生效；已终态原样返回，不写历史、不提升 epoch。
export function cancelDecision(state: JobState) {
  if (terminalStatuses.has(state.status)) return { changed: false as const };
  return { changed: true as const, epoch: state.epoch + 1, terminationState: "requested" as const };
}

// 晚到回执必须先过快照/准入代围栏，再确认 Job 未被取消；终态一律拒绝接纳，不复活结果。
export function acceptanceDecision(
  state: JobState,
  receipt: { snapshotId: string; epoch: number; pages: PageResult[] },
) {
  if (state.snapshotId !== receipt.snapshotId || state.epoch !== receipt.epoch)
    throw new ConflictException("LOCAL_PARSE_ADMISSION_FENCED");
  if (terminalStatuses.has(state.status)) throw new ConflictException("LOCAL_PARSE_JOB_TERMINAL");
  const expected = [...state.requestedPages].sort((a, b) => a - b);
  const actual = receipt.pages.map((page) => page.pageIndex).sort((a, b) => a - b);
  const statuses = new Set(["success", "blank", "failed", "missing"]);
  if (
    expected.length !== actual.length ||
    expected.some((page, index) => page !== actual[index]) ||
    receipt.pages.some((page) => !statuses.has(page.status))
  )
    throw new ConflictException("LOCAL_PARSE_MANIFEST_REJECTED");
  const pageResults = state.requestedPages.map((pageIndex) => ({
    pageIndex,
    status: receipt.pages.find((page) => page.pageIndex === pageIndex)?.status as LocalPageStatus,
  }));
  return { pageResults, status: fixtureStatus(pageResults) };
}
