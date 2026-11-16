CREATE TABLE "local_parse_jobs" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"trace_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"fixture" text NOT NULL,
	"requested_pages" jsonb NOT NULL,
	"page_results" jsonb,
	"revision" integer DEFAULT 1 NOT NULL,
	"epoch" integer DEFAULT 1 NOT NULL,
	"failure_code" text,
	"termination_state" text DEFAULT 'not_requested' NOT NULL,
	CONSTRAINT "local_parse_jobs_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
ALTER TABLE "local_parse_jobs" ADD CONSTRAINT "local_parse_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;