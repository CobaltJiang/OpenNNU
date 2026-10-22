CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`metadata` text NOT NULL,
	`files` text NOT NULL,
	`receipt` text
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`ip` text NOT NULL,
	`created` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
