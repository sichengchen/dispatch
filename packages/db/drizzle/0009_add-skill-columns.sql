ALTER TABLE `sources` ADD `has_skill` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `skill_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `skill_generated_at` integer;