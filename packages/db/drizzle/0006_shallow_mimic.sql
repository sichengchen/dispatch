CREATE INDEX `articles_source_id_idx` ON `articles` (`source_id`);--> statement-breakpoint
CREATE INDEX `articles_published_at_idx` ON `articles` (`published_at`);--> statement-breakpoint
CREATE INDEX `articles_is_read_idx` ON `articles` (`is_read`);--> statement-breakpoint
CREATE INDEX `articles_grade_idx` ON `articles` (`grade`);