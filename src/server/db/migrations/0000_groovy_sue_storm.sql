CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publishing_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"event" varchar(50) NOT NULL,
	"response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_account_id" uuid NOT NULL,
	"platform" varchar(50) DEFAULT 'linkedin' NOT NULL,
	"content" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"timezone" varchar(100) DEFAULT 'Asia/Dhaka' NOT NULL,
	"status" varchar(50) DEFAULT 'scheduled' NOT NULL,
	"external_post_id" varchar(255),
	"published_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(50) DEFAULT 'linkedin' NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"status" varchar(50) DEFAULT 'connected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publishing_logs" ADD CONSTRAINT "publishing_logs_post_id_scheduled_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishing_logs_post_id_idx" ON "publishing_logs" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishing_logs_event_idx" ON "publishing_logs" USING btree ("event");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_posts_status_idx" ON "scheduled_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_posts_scheduled_at_idx" ON "scheduled_posts" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_posts_social_account_idx" ON "scheduled_posts" USING btree ("social_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_accounts_platform_account_idx" ON "social_accounts" USING btree ("platform","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_accounts_status_idx" ON "social_accounts" USING btree ("status");