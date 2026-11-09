import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { database } from "../database/client.js";
import { jobs, mineruProbeJobs } from "../database/schema.js";
import type {
  CheckpointProbe,
  CreateProbe,
  FinishProbe,
  ProbeRef,
  StopProbe,
} from "./mineru-probe.dto.js";

function fixtures() {
  return JSON.parse(
    readFileSync(
      new URL("../../../../contracts/fixtures/mineru-probe.v1.json", import.meta.url),
      "utf8",
    ),
  ).fixtures as Record<string, { path: string; sha256: string; pages: number }>;
}
const terminal = new Set(["SUCCEEDED", "PARTIAL_READY", "FAILED", "CANCELLED"]);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Tx = Parameters<Parameters<typeof database.transaction>[0]>[0];
async function find(client: Tx | typeof database, id: string, locked = false) {
  const query = client
    .select()
    .from(jobs)
    .innerJoin(mineruProbeJobs, eq(jobs.id, mineruProbeJobs.jobId))
    .where(eq(jobs.id, id));
  const [row] = await (locked ? query.for("update") : query);
  if (row?.jobs.kind !== "mineru_parse_probe") throw new NotFoundException("PROBE_NOT_FOUND");
  return row;
}
type Row = Awaited<ReturnType<typeof find>>;
function view(row: Row) {
  return {
    id: row.jobs.id,
    kind: row.jobs.kind,
    status: row.jobs.status,
    workflowId: row.jobs.workflowId,
    input: row.jobs.input,
    result: row.jobs.output,
    ...row.mineru_probe_jobs,
  };
}
function fence(row: Row, ref: ProbeRef) {
  if (
    row.mineru_probe_jobs.snapshotId !== ref.snapshotId.toLowerCase() ||
    row.mineru_probe_jobs.epoch !== ref.epoch ||
    terminal.has(row.jobs.status)
  )
    throw new ConflictException("PROBE_FENCED");
}
async function update(
  client: Tx,
  row: Row,
  changes: Partial<typeof mineruProbeJobs.$inferInsert>,
  status?: typeof jobs.$inferInsert.status,
  output?: unknown,
) {
  await client
    .update(mineruProbeJobs)
    .set({ ...changes, revision: row.mineru_probe_jobs.revision + 1 })
    .where(eq(mineruProbeJobs.jobId, row.jobs.id));
  await client
    .update(jobs)
    .set({
      updatedAt: new Date(),
      ...(status ? { status } : {}),
      ...(output !== undefined ? { output } : {}),
    })
    .where(eq(jobs.id, row.jobs.id));
  return view(await find(client, row.jobs.id));
}

@Injectable()
export class MineruProbeService {
  async create(body: CreateProbe) {
    const requestKey = body.requestKey.toLowerCase();
    const fixture = fixtures()[body.fixtureId];
    if (!fixture) throw new BadRequestException("PROBE_FIXED_FIXTURE_REQUIRED");
    const input = {
      fixtureId: body.fixtureId,
      sha256: fixture.sha256,
      pages: fixture.pages,
      pageRange: `1-${fixture.pages}`,
      tier: body.tier,
      pollSeconds: body.pollSeconds,
    };
    return database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`probe:${requestKey}`},0))`,
      );
      const [prior] = await tx
        .select()
        .from(mineruProbeJobs)
        .where(eq(mineruProbeJobs.requestKey, requestKey));
      if (prior) {
        if (prior.requestHash !== hash(input))
          throw new ConflictException("PROBE_REQUEST_KEY_CONFLICT");
        return view(await find(tx, prior.jobId));
      }
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('mineru-probe-capacity',0))`,
      );
      const [capacity] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(jobs)
        .where(
          and(eq(jobs.kind, "mineru_parse_probe"), inArray(jobs.status, ["QUEUED", "RUNNING"])),
        );
      if (!capacity || capacity.count >= 10)
        throw new ServiceUnavailableException("PROBE_CAPACITY_REACHED");
      const id = randomUUID();
      await tx
        .insert(jobs)
        .values({ id, kind: "mineru_parse_probe", workflowId: `cl-mineru/${id}`, input });
      await tx.insert(mineruProbeJobs).values({
        jobId: id,
        requestKey,
        requestHash: hash(input),
        snapshotId: randomUUID(),
        traceId: randomBytes(16).toString("hex"),
      });
      return view(await find(tx, id));
    });
  }
  async get(id: string) {
    return view(await find(database, id));
  }
  async start(id: string, ref: ProbeRef) {
    return database.transaction(async (tx) => {
      const row = await find(tx, id, true);
      fence(row, ref);
      return row.jobs.status === "QUEUED" ? update(tx, row, {}, "RUNNING") : view(row);
    });
  }
  async checkpoint(id: string, body: CheckpointProbe) {
    return database.transaction(async (tx) => {
      const row = await find(tx, id, true);
      fence(row, body);
      const current = row.mineru_probe_jobs;
      if (current.revision !== body.revision)
        throw new ConflictException("PROBE_REVISION_CONFLICT");
      const next: Record<string, string[]> = {
        new: ["source_ready"],
        source_ready: ["create_pending"],
        create_pending: ["submitted", "create_unknown"],
        submitted: ["poll_timeout", "upstream_lost"],
        poll_timeout: ["submitted", "upstream_lost"],
      };
      if (body.phase !== "failed" && !next[current.phase]?.includes(body.phase))
        throw new ConflictException("PROBE_PHASE_CONFLICT");
      if (
        (current.fileId && body.fileId && current.fileId !== body.fileId) ||
        (current.upstreamJobId &&
          body.upstreamJobId &&
          current.upstreamJobId !== body.upstreamJobId)
      )
        throw new ConflictException("PROBE_MAPPING_IMMUTABLE");
      if (
        (body.phase === "source_ready" && !body.fileId) ||
        (body.phase === "submitted" && !body.upstreamJobId && !current.upstreamJobId)
      )
        throw new BadRequestException("PROBE_MAPPING_REQUIRED");
      if (
        (body.fileId && body.phase !== "source_ready") ||
        (body.upstreamJobId && body.phase !== "submitted")
      )
        throw new BadRequestException("PROBE_MAPPING_PHASE_REQUIRED");
      const failed = ["failed", "create_unknown", "upstream_lost"].includes(body.phase);
      if (failed && !body.failureCode) throw new BadRequestException("PROBE_FAILURE_CODE_REQUIRED");
      return update(
        tx,
        row,
        {
          phase: body.phase,
          ...(body.fileId ? { fileId: body.fileId } : {}),
          ...(body.upstreamJobId ? { upstreamJobId: body.upstreamJobId } : {}),
          failureCode: body.failureCode ?? null,
        },
        failed ? "FAILED" : "RUNNING",
      );
    });
  }
  async finish(id: string, body: FinishProbe) {
    return database.transaction(async (tx) => {
      const row = await find(tx, id, true);
      if (
        row.mineru_probe_jobs.receiptHash === hash(body) &&
        ["SUCCEEDED", "PARTIAL_READY"].includes(row.jobs.status)
      )
        return view(row);
      fence(row, body);
      const input = row.jobs.input as { pages: number };
      if (
        !["submitted", "poll_timeout"].includes(row.mineru_probe_jobs.phase) ||
        row.mineru_probe_jobs.upstreamJobId !== body.upstreamJobId ||
        body.pageIndices.some((index) => index > input.pages) ||
        new Set(body.artifacts.map((artifact) => artifact.format)).size !== 3
      )
        throw new ConflictException("PROBE_MANIFEST_CONFLICT");
      const status = body.pageIndices.length === input.pages ? "SUCCEEDED" : "PARTIAL_READY";
      return update(tx, row, { phase: "completed", receiptHash: hash(body) }, status, {
        upstreamJobId: body.upstreamJobId,
        parserVersion: body.parserVersion,
        pageIndices: body.pageIndices,
        artifacts: body.artifacts,
      });
    });
  }
  async cancel(id: string) {
    return database.transaction(async (tx) => {
      const row = await find(tx, id, true);
      if (terminal.has(row.jobs.status)) return view(row);
      return update(
        tx,
        row,
        { epoch: row.mineru_probe_jobs.epoch + 1, terminationState: "requested" },
        "CANCELLED",
      );
    });
  }
  async stopped(id: string, body: StopProbe) {
    return database.transaction(async (tx) => {
      const row = await find(tx, id, true);
      if (
        row.jobs.status !== "CANCELLED" ||
        row.mineru_probe_jobs.snapshotId !== body.snapshotId ||
        row.mineru_probe_jobs.epoch !== body.epoch
      )
        throw new ConflictException("PROBE_STOP_FENCED");
      if (row.mineru_probe_jobs.terminationState === body.terminationState) return view(row);
      return update(tx, row, { terminationState: body.terminationState });
    });
  }
  async resume(id: string) {
    return database.transaction(async (tx) => {
      const row = await find(tx, id, true);
      if (
        row.jobs.status !== "RUNNING" ||
        row.mineru_probe_jobs.phase !== "poll_timeout" ||
        !row.mineru_probe_jobs.upstreamJobId
      )
        throw new ConflictException("PROBE_NOT_RESUMABLE");
      const epoch = row.mineru_probe_jobs.epoch + 1;
      await tx
        .update(jobs)
        .set({ workflowId: `cl-mineru/${id}/resume/${epoch}` })
        .where(eq(jobs.id, id));
      return update(tx, row, { epoch, phase: "submitted" });
    });
  }
}
