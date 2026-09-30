CREATE TYPE "public"."job_status" AS ENUM('QUEUED', 'RUNNING', 'WAITING_REVIEW', 'PARTIAL_READY', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"workflow_id" text,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_workflow_id_unique" UNIQUE("workflow_id")
);
