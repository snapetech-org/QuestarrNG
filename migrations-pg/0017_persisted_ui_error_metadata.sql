ALTER TABLE "rss_feeds" ADD COLUMN "error_message_i18n" text;--> statement-breakpoint
ALTER TABLE "import_tasks" ADD COLUMN "error_message_i18n" text;--> statement-breakpoint
ALTER TABLE "import_task_items" ADD COLUMN "error_message_i18n" text;
