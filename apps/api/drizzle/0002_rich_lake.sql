CREATE TABLE "mineru_probe_jobs" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"trace_id" text NOT NULL,
	"epoch" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"phase" text DEFAULT 'new' NOT NULL,
	"file_id" text,
	"upstream_job_id" text,
	"receipt_hash" text,
	"failure_code" text,
	"termination_state" text DEFAULT 'not_requested' NOT NULL,
	CONSTRAINT "mineru_probe_jobs_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
ALTER TABLE "mineru_probe_jobs" ADD CONSTRAINT "mineru_probe_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;