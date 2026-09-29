ALTER TABLE "generations" ADD COLUMN "provider_job_id" text;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "queue_position" integer;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "eta_sec" integer;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "checked_at" timestamp with time zone;