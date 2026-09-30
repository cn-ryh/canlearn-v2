import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
