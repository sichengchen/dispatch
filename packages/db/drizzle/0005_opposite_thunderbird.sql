ALTER TABLE `sources` ADD `consecutive_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `health_status` text DEFAULT 'healthy' NOT NULL;