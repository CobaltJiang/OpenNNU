CREATE TABLE `maintainers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publish_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`state` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires` integer NOT NULL,
	`actor` text NOT NULL,
	`review` text NOT NULL,
	`created` integer NOT NULL,
	`receipt` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `review_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`detail` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`metadata` text NOT NULL,
	`actor` text NOT NULL,
	`updated` integer NOT NULL
);
