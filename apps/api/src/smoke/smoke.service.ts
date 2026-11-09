import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { database, queryClient } from "../database/client.js";
import { jobs, smokeJobs, smokeOutbox } from "../database/schema.js";
import type { ClaimReceipt, CreateSmokeJob, FinishSmokeJob, JobRef } from "./smoke.dto.js";
import { fixture, fixtureResult, fixtureStatus } from "./smoke.fixture.js";

type Tx = Parameters<Parameters<typeof database.transaction>[0]>[0];
const terminal = new Set(["SUCCEEDED", "PARTIAL_READY", "FAILED", "CANCELLED"]);
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Input = CreateSmokeJob & { fixtureId: string };

async function findJob(tx: Tx | typeof database, id: string, lock = false) {
  const query = tx
    .select()
    .from(jobs)
    .innerJoin(smokeJobs, eq(jobs.id, smokeJobs.jobId))
    .where(eq(jobs.id, id));
  const [row] = await (lock ? query.for("update") : query);
  if (row?.jobs.kind !== "synthetic_parse") throw new NotFoundException("SMOKE_JOB_NOT_FOUND");
  return row;
}
type Row = Awaited<ReturnType<typeof findJob>>;

function view(row: Row) {
  return {
    id: row.jobs.id,
    kind: "synthetic_parse",
    status: row.jobs.status,
    snapshotId: row.smoke_jobs.snapshotId,
    traceId: row.smoke_jobs.traceId,
    workflowId: row.jobs.workflowId,
    revision: row.smoke_jobs.revision,
    epoch: row.smoke_jobs.epoch,
    terminationState: row.smoke_jobs.terminationState,
    failureCode: row.jobs.status === "FAILED" ? "PERMANENT_ERROR" : null,
    result: row.jobs.output,
    createdAt: row.jobs.createdAt.toISOString(),
    updatedAt: row.jobs.updatedAt.toISOString(),
  };
}

async function event(tx: Tx, row: Row, type: string, payload: Record<string, unknown>) {
  const eventId = randomUUID();
  await tx.insert(smokeOutbox).values({
    eventId,
    jobId: row.jobs.id,
    event: {
      event_id: eventId,
      event_type: type,
      schema_version: 1,
      aggregate_type: "job",
      aggregate_id: row.jobs.id,
      aggregate_revision: row.smoke_jobs.revision,
      space_id: fixture.spaceId,
      actor_ref: fixture.actorId,
      trace_id: row.smoke_jobs.traceId,
      occurred_at: new Date().toISOString(),
      payload,
    },
  });
}

async function finalized(tx: Tx, row: Row) {
  const result = row.jobs.output as ReturnType<typeof fixtureResult> | null;
  const usable = result?.pages.some((page) => page.status === "success");
  await event(tx, row, "job.finalized.v1", {
    job_id: row.jobs.id,
    input_snapshot_id: row.smoke_jobs.snapshotId,
    status: row.jobs.status,
    admission_epoch: row.smoke_jobs.epoch,
    result_refs: usable
      ? [
          {
            resource_type: "content_revision",
            resource_id: fixture.sourceId,
            version_id: fixture.versionId,
          },
        ]
      : [],
    cost_state: "reconciled",
    failure_code: row.jobs.status === "FAILED" ? "PERMANENT_ERROR" : null,
  });
}

function checkRef(row: Row, ref: JobRef) {
  if (row.smoke_jobs.snapshotId !== ref.snapshotId || row.smoke_jobs.epoch !== ref.epoch) {
    throw new ConflictException("SMOKE_SNAPSHOT_OR_EPOCH_CONFLICT");
  }
}

@Injectable()
export class SmokeService implements OnModuleDestroy {
  constructor() {
    if ((process.env.CANLEARN_SMOKE_TOKEN ?? "").length < 32) {
      throw new Error("CANLEARN_SMOKE_TOKEN must contain at least 32 characters");
    }
  }

  async onModuleDestroy() {
    await queryClient.end({ timeout: 5 });
  }

  async create(requestKey: string, input: CreateSmokeJob) {
    const normalized = { fixtureId: fixture.id, mode: input.mode, delayMs: input.delayMs };
    const requestHash = digest({ mode: input.mode, delayMs: input.delayMs });
    return database.transaction(async (tx) => {
      // Fixed local actor/operation scope; a different production actor is never accepted here.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`smoke/create/${requestKey}`}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(smokeJobs)
        .where(eq(smokeJobs.requestKey, requestKey));
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException("IDEMPOTENCY_KEY_REUSED");
        return view(await findJob(tx, existing.jobId));
      }
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('smoke/capacity', 0))`);
      const [capacity] = await tx.execute<{ count: number }>(
        sql`select count(*)::int as count from jobs where kind='synthetic_parse' and status in ('QUEUED','RUNNING')`,
      );
      if (!capacity || capacity.count >= 10)
        throw new ServiceUnavailableException("SMOKE_QUEUE_FULL");
      const id = randomUUID();
      await tx
        .insert(jobs)
        .values({ id, kind: "synthetic_parse", workflowId: `cl-job/${id}`, input: normalized });
      await tx.insert(smokeJobs).values({
        jobId: id,
        requestKey,
        requestHash,
        snapshotId: randomUUID(),
        traceId: randomBytes(16).toString("hex"),
      });
      const row = await findJob(tx, id);
      await event(tx, row, "job.accepted.v1", {
        job_id: id,
        input_snapshot_id: row.smoke_jobs.snapshotId,
        kind: "parse",
        admission_epoch: 1,
      });
      return view(row);
    });
  }

  async get(id: string) {
    const row = await findJob(database, id);
    const delivery = await database
      .select({
        eventId: smokeOutbox.eventId,
        state: smokeOutbox.state,
        attempts: smokeOutbox.attempts,
        lastErrorCode: smokeOutbox.lastErrorCode,
      })
      .from(smokeOutbox)
      .where(eq(smokeOutbox.jobId, id));
    return { ...view(row), delivery };
  }

  async internalGet(id: string) {
    const row = await findJob(database, id);
    return { ...view(row), input: row.jobs.input as Input, runId: row.smoke_jobs.runId };
  }

  async start(id: string, ref: JobRef) {
    return database.transaction(async (tx) => {
      const row = await findJob(tx, id, true);
      // A cancelled Job is visible but never admitted, including a late initial dispatch.
      if (row.jobs.status === "CANCELLED") return { ...view(row), input: null };
      checkRef(row, ref);
      if (row.jobs.status === "QUEUED") {
        await tx
          .update(jobs)
          .set({ status: "RUNNING", updatedAt: new Date() })
          .where(eq(jobs.id, id));
        await tx
          .update(smokeJobs)
          .set({ revision: row.smoke_jobs.revision + 1 })
          .where(eq(smokeJobs.jobId, id));
      }
      const current = await findJob(tx, id);
      return {
        ...view(current),
        input: terminal.has(current.jobs.status) ? null : (current.jobs.input as Input),
      };
    });
  }

  async finish(id: string, receipt: FinishSmokeJob) {
    return database.transaction(async (tx) => {
      const row = await findJob(tx, id, true);
      checkRef(row, receipt);
      const input = row.jobs.input as Input;
      const expected = fixtureResult(input.mode);
      const pages = receipt.pages.map(({ pageIndex, status }) => ({ pageIndex, status }));
      if (JSON.stringify(pages) !== JSON.stringify(expected.pages))
        throw new ConflictException("SMOKE_MANIFEST_REJECTED");
      const hash = digest({
        snapshotId: receipt.snapshotId,
        epoch: receipt.epoch,
        pages: expected.pages,
      });
      if (row.smoke_jobs.receiptHash) {
        if (row.smoke_jobs.receiptHash !== hash)
          throw new ConflictException("SMOKE_RECEIPT_CONFLICT");
        return view(row);
      }
      if (row.jobs.status !== "RUNNING") throw new ConflictException("SMOKE_JOB_NOT_RUNNING");
      await tx
        .update(jobs)
        .set({ status: fixtureStatus(input.mode), output: expected, updatedAt: new Date() })
        .where(eq(jobs.id, id));
      await tx
        .update(smokeJobs)
        .set({ revision: row.smoke_jobs.revision + 1, receiptHash: hash })
        .where(eq(smokeJobs.jobId, id));
      const current = await findJob(tx, id);
      await finalized(tx, current);
      return view(current);
    });
  }

  async cancel(id: string) {
    return database.transaction(async (tx) => {
      const row = await findJob(tx, id, true);
      if (terminal.has(row.jobs.status)) return view(row);
      await tx
        .update(jobs)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(jobs.id, id));
      await tx
        .update(smokeJobs)
        .set({
          revision: row.smoke_jobs.revision + 1,
          epoch: row.smoke_jobs.epoch + 1,
          terminationState: "requested",
        })
        .where(eq(smokeJobs.jobId, id));
      const current = await findJob(tx, id);
      await event(tx, current, "job.cancel_requested.v1", {
        job_id: id,
        operation_id: randomUUID(),
        admission_epoch: current.smoke_jobs.epoch,
        reason_code: "user_cancel",
        termination_state: "requested",
      });
      await finalized(tx, current);
      return view(current);
    });
  }

  async stopped(id: string) {
    return database.transaction(async (tx) => {
      const row = await findJob(tx, id, true);
      if (row.jobs.status !== "CANCELLED") throw new ConflictException("SMOKE_JOB_NOT_CANCELLED");
      if (row.smoke_jobs.terminationState !== "confirmed") {
        await tx
          .update(smokeJobs)
          .set({ terminationState: "confirmed", revision: row.smoke_jobs.revision + 1 })
          .where(eq(smokeJobs.jobId, id));
      }
      return view(await findJob(tx, id));
    });
  }

  async claim() {
    return database.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(smokeOutbox)
        .where(
          sql`(${smokeOutbox.state} = 'pending' and ${smokeOutbox.nextAttemptAt} <= now()) or (${smokeOutbox.state} = 'claimed' and ${smokeOutbox.leaseUntil} < now())`,
        )
        .orderBy(smokeOutbox.createdAt, smokeOutbox.eventId)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!row) return { delivery: null };
      const [claimed] = await tx
        .update(smokeOutbox)
        .set({
          state: "claimed",
          claimToken: randomUUID(),
          attempts: row.attempts + 1,
          leaseUntil: new Date(Date.now() + 10000),
        })
        .where(eq(smokeOutbox.eventId, row.eventId))
        .returning();
      return { delivery: claimed };
    });
  }

  async abandon(id: string, ref: JobRef) {
    return database.transaction(async (tx) => {
      const row = await findJob(tx, id, true);
      if (terminal.has(row.jobs.status)) return view(row);
      checkRef(row, ref);
      await tx.update(jobs).set({ status: "FAILED", updatedAt: new Date() }).where(eq(jobs.id, id));
      await tx
        .update(smokeJobs)
        .set({ revision: row.smoke_jobs.revision + 1 })
        .where(eq(smokeJobs.jobId, id));
      const current = await findJob(tx, id);
      await finalized(tx, current);
      return view(current);
    });
  }

  async ack(eventId: string, receipt: ClaimReceipt) {
    return database.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(smokeOutbox)
        .where(eq(smokeOutbox.eventId, eventId))
        .for("update");
      if (!row) throw new NotFoundException("SMOKE_EVENT_NOT_FOUND");
      if (
        row.claimToken !== receipt.claimToken ||
        row.state !== "claimed" ||
        !row.leaseUntil ||
        row.leaseUntil.getTime() < Date.now()
      )
        throw new ConflictException("SMOKE_CLAIM_EXPIRED");
      const body = row.event as { event_type: string };
      if (body.event_type === "job.accepted.v1") {
        if (!receipt.runId) throw new ConflictException("SMOKE_RUN_RECEIPT_REQUIRED");
        const [meta] = await tx
          .select()
          .from(smokeJobs)
          .where(eq(smokeJobs.jobId, row.jobId))
          .for("update");
        if (!meta || (meta.runId && meta.runId !== receipt.runId))
          throw new ConflictException("SMOKE_RUN_MAPPING_CONFLICT");
        await tx
          .update(smokeJobs)
          .set({ runId: receipt.runId })
          .where(eq(smokeJobs.jobId, row.jobId));
      }
      await tx
        .update(smokeOutbox)
        .set({ state: "sent", leaseUntil: null, lastErrorCode: null })
        .where(eq(smokeOutbox.eventId, eventId));
      return { acknowledged: true };
    });
  }

  async fail(eventId: string, claimToken: string) {
    const [row] = await database
      .update(smokeOutbox)
      .set({
        state: sql`case when attempts >= 10 then 'quarantined' else 'pending' end`,
        nextAttemptAt: new Date(Date.now() + 1000),
        leaseUntil: null,
        lastErrorCode: "SMOKE_DISPATCH_UNCONFIRMED",
      })
      .where(
        and(
          eq(smokeOutbox.eventId, eventId),
          eq(smokeOutbox.claimToken, claimToken),
          eq(smokeOutbox.state, "claimed"),
          sql`${smokeOutbox.leaseUntil} > now()`,
        ),
      )
      .returning();
    if (!row) throw new ConflictException("SMOKE_CLAIM_EXPIRED");
    return { deferred: true };
  }

  async replay(eventId: string) {
    const [row] = await database
      .update(smokeOutbox)
      .set({ state: "pending", nextAttemptAt: new Date(), claimToken: null, leaseUntil: null })
      .where(and(eq(smokeOutbox.eventId, eventId), eq(smokeOutbox.state, "quarantined")))
      .returning();
    if (!row) throw new ConflictException("SMOKE_EVENT_NOT_QUARANTINED");
    return { replayRequested: true };
  }
}
