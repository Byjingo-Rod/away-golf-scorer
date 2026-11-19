CREATE TABLE `matchplay_reviews` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`revision` integer NOT NULL,
	`record` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `matchplay_review_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`event` text NOT NULL,
	`role` text NOT NULL,
	`player_id` text,
	`expires` integer NOT NULL
);
