ALTER TABLE `sync_jobs` ADD COLUMN `node_uid` text;
--> statement-breakpoint
CREATE TABLE `remote_state` (
	`node_uid` text NOT NULL,
	`parent_node_uid` text NOT NULL,
	`remote_path` text NOT NULL,
	`name` text NOT NULL,
	`is_directory` integer NOT NULL,
	`revision_uid` text,
	`size` integer,
	`modification_time` integer,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_state_node_uid` ON `remote_state` (`node_uid`);
--> statement-breakpoint
CREATE INDEX `idx_remote_state_remote_path` ON `remote_state` (`remote_path`);
