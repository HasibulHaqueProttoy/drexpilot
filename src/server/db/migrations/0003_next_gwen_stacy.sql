ALTER TABLE "scheduled_posts" ADD COLUMN "media_type" varchar(50) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "media_urls" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "media_title" varchar(255);