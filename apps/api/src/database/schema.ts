import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("job_status", [
  "QUEUED",
  "RUNNING",
  "WAITING_REVIEW",
  "PARTIAL_READY",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull(),
  status: jobStatus("status").default("QUEUED").notNull(),
  workflowId: text("workflow_id").unique(),
  input: jsonb("input").notNull(),
  output: jsonb("output"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// CL-013a local synthetic metadata. These tables confer no production resource access.
export const smokeJobs = pgTable("smoke_jobs", {
  jobId: uuid("job_id")
    .primaryKey()
    .references(() => jobs.id),
  requestKey: text("request_key").unique().notNull(),
  requestHash: text("request_hash").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  traceId: text("trace_id").notNull(),
  revision: integer("revision").default(1).notNull(),
  epoch: integer("epoch").default(1).notNull(),
  receiptHash: text("receipt_hash"),
  runId: uuid("run_id"),
  terminationState: text("termination_state").default("not_requested").notNull(),
});

export const smokeOutbox = pgTable("smoke_outbox", {
  eventId: uuid("event_id").primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id),
  event: jsonb("event").notNull(),
  state: text("state").default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  claimToken: uuid("claim_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  lastErrorCode: text("last_error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// CL-010 isolated parser probe: reference-only checkpoints; no production resource authorization.
export const mineruProbeJobs = pgTable("mineru_probe_jobs", {
  jobId: uuid("job_id")
    .primaryKey()
    .references(() => jobs.id),
  requestKey: uuid("request_key").unique().notNull(),
  requestHash: text("request_hash").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  traceId: text("trace_id").notNull(),
  epoch: integer("epoch").default(1).notNull(),
  revision: integer("revision").default(1).notNull(),
  phase: text("phase").default("new").notNull(),
  fileId: text("file_id"),
  upstreamJobId: text("upstream_job_id"),
  receiptHash: text("receipt_hash"),
  failureCode: text("failure_code"),
  terminationState: text("termination_state").default("not_requested").notNull(),
});
