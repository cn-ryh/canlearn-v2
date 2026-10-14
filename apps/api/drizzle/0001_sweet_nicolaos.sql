CREATE TABLE "smoke_jobs" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"trace_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"epoch" integer DEFAULT 1 NOT NULL,
	"receipt_hash" text,
	"run_id" uuid,
	"termination_state" text DEFAULT 'not_requested' NOT NULL,
	CONSTRAINT "smoke_jobs_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
CREATE TABLE "smoke_outbox" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"event" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claim_token" uuid,
	"lease_until" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "smoke_jobs" ADD CONSTRAINT "smoke_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smoke_outbox" ADD CONSTRAINT "smoke_outbox_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;