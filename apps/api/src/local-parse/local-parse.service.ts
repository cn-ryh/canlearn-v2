import { randomBytes, randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { database, queryClient } from "../database/client.js";
import { jobs, localParseJobs } from "../database/schema.js";
import {
  acceptanceDecision,
  cancelDecision,
  type PageResult,
  requestFingerprint,
  resolvePageScope,
  strongEtag,
  syntheticOutcome,
} from "./local-parse.domain.js";
import type { CreateLocalParseJob } from "./local-parse.dto.js";

type Tx = Parameters<Parameters<typeof database.transaction>[0]>[0];

async function findJob(tx: Tx | typeof database, id: string, lock = false) {
  const query = tx
    .select()
    .from(jobs)
    .innerJoin(localParseJobs, eq(jobs.id, localParseJobs.jobId))
    .where(eq(jobs.id, id));
  const [row] = await (lock ? query.for("update") : query);
  if (row?.jobs.kind !== "local_parse") throw new NotFoundException("LOCAL_PARSE_JOB_NOT_FOUND");
  return row;
}
type Row = Awaited<ReturnType<typeof findJob>>;

// 视图只暴露契约字段；documentId/versionId 是客户端提供的引用，不证明资源归属。
function view(row: Row) {
  const input = row.jobs.input as {
    sourceRevision: number;
    fixture: string;
    requestedPages: number[];
  };
  return {
    id: row.jobs.id,
    kind: "local_parse",
    status: row.jobs.status,
    snapshotId: row.local_parse_jobs.snapshotId,
    traceId: row.local_parse_jobs.traceId,
    documentId: row.local_parse_jobs.documentId,
    versionId: row.local_parse_jobs.versionId,
    sourceRevision: input.sourceRevision,
    profileId: row.local_parse_jobs.profileId,
    fixture: input.fixture,
    requestedPages: row.local_parse_jobs.requestedPages,
    pageResults: row.local_parse_jobs.pageResults,
    revision: row.local_parse_jobs.revision,
    epoch: row.local_parse_jobs.epoch,
    terminationState: row.local_parse_jobs.terminationState,
    failureCode: row.local_parse_jobs.failureCode,
    createdAt: row.jobs.createdAt.toISOString(),
    updatedAt: row.jobs.updatedAt.toISOString(),
  };
}
type View = ReturnType<typeof view>;

@Injectable()
export class LocalParseService implements OnModuleDestroy {
  constructor() {
    if (process.env.CANLEARN_LOCAL_PARSE_ENABLED !== "true") {
      // 模块只在开关开启时装配；这里再核一次，避免被误导入到生产运行面。
      throw new Error("CANLEARN_LOCAL_PARSE_ENABLED must be true for the local parse module");
    }
  }

  async onModuleDestroy() {
    await queryClient.end({ timeout: 5 });
  }

  async create(requestKey: string, input: CreateLocalParseJob): Promise<JobResponse> {
    const requestedPages = resolvePageScope(input);
    const requestHash = requestFingerprint(input, requestedPages);
    return database.transaction(async (tx) => {
      // 同一请求键串行：并发首请求只有一个赢家，其余走重放分支。
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`local-parse/create/${requestKey}`}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(localParseJobs)
        .where(eq(localParseJobs.requestKey, requestKey));
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException("IDEMPOTENCY_KEY_REUSED");
        // 重放不重新执行合成解析、不写新 revision；只按当前状态返回。
        return job(await findJob(tx, existing.jobId), true);
      }
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('local-parse/capacity', 0))`,
      );
      const [capacity] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(jobs)
        .where(and(eq(jobs.kind, "local_parse"), inArray(jobs.status, ["QUEUED", "RUNNING"])));
      if (!capacity || capacity.count >= 10)
        throw new ServiceUnavailableException("LOCAL_PARSE_CAPACITY_REACHED");
      const id = randomUUID();
      const outcome = syntheticOutcome(input.fixture, requestedPages);
      await tx.insert(jobs).values({
        id,
        kind: "local_parse",
        status: outcome.status,
        // 本切片不派发 Temporal：workflow_id 留空，避免与真实编排混淆。
        input: {
          sourceRevision: input.sourceRevision,
          fixture: input.fixture,
          requestedPages,
        },
        output: outcome.pageResults ? { pages: outcome.pageResults } : null,
      });
      await tx.insert(localParseJobs).values({
        jobId: id,
        requestKey,
        requestHash,
        snapshotId: randomUUID(),
        traceId: randomBytes(16).toString("hex"),
        documentId: input.documentId.toLowerCase(),
        versionId: input.versionId.toLowerCase(),
        profileId: input.profileId,
        fixture: input.fixture,
        requestedPages,
        pageResults: outcome.pageResults,
        failureCode: outcome.status === "FAILED" ? "PERMANENT_ERROR" : null,
      });
      return job(await findJob(tx, id), false);
    });
  }

  async get(id: string) {
    return job(await findJob(database, id), false);
  }

  // 内部晚到结果接纳（仅 /v1/internal/local-parse，受回环与 service token 限制）。
  // 与取消共用同一 Job 行锁：只有一个终态，晚到结果不能复活已取消 Job。
  async admit(id: string, receipt: { snapshotId: string; epoch: number; pages: PageResult[] }) {
    return database.transaction(async (tx) => {
      const row = await findJob(tx, id, true);
      if (row.local_parse_jobs.pageResults)
        throw new ConflictException("LOCAL_PARSE_RESULT_ALREADY_ACCEPTED");
      const accepted = acceptanceDecision(
        {
          status: row.jobs.status,
          epoch: row.local_parse_jobs.epoch,
          snapshotId: row.local_parse_jobs.snapshotId,
          requestedPages: row.local_parse_jobs.requestedPages,
          pageResults: row.local_parse_jobs.pageResults,
        },
        { ...receipt, snapshotId: receipt.snapshotId.toLowerCase() },
      );
      await tx
        .update(jobs)
        .set({
          status: accepted.status,
          output: { pages: accepted.pageResults },
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, id));
      await tx
        .update(localParseJobs)
        .set({
          pageResults: accepted.pageResults,
          revision: row.local_parse_jobs.revision + 1,
          failureCode: accepted.status === "FAILED" ? "PERMANENT_ERROR" : null,
        })
        .where(eq(localParseJobs.jobId, id));
      return job(await findJob(tx, id), false);
    });
  }

  async cancel(id: string) {
    return database.transaction(async (tx) => {
      const row = await findJob(tx, id, true);
      const decision = cancelDecision({
        status: row.jobs.status,
        epoch: row.local_parse_jobs.epoch,
        snapshotId: row.local_parse_jobs.snapshotId,
        requestedPages: row.local_parse_jobs.requestedPages,
        pageResults: row.local_parse_jobs.pageResults,
      });
      // 已终态原样返回：不写历史、不提升 epoch、不复活结果。
      if (!decision.changed) return job(row, false);
      await tx
        .update(jobs)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(jobs.id, id));
      await tx
        .update(localParseJobs)
        .set({
          epoch: decision.epoch,
          revision: row.local_parse_jobs.revision + 1,
          terminationState: decision.terminationState,
        })
        .where(eq(localParseJobs.jobId, id));
      return job(await findJob(tx, id), false);
    });
  }
}

export type JobResponse = {
  view: View;
  replayed: boolean;
  etag: string;
};

function job(row: Row, replayed: boolean): JobResponse {
  const current = view(row);
  return { view: current, replayed, etag: strongEtag(current) };
}
