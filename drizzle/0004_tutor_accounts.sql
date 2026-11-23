CREATE TABLE IF NOT EXISTS `tutors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`university` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`subjects` text DEFAULT '[]' NOT NULL,
	`classes` text DEFAULT '[]' NOT NULL,
	`areas` text DEFAULT '[]' NOT NULL,
	`experience` text DEFAULT '' NOT NULL,
	`fees` text DEFAULT '' NOT NULL,
	`gender` text DEFAULT 'other' NOT NULL,
	`photo_url` text,
	`verified` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `tutors_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tutor_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`tutor_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `tutor_sessions_token_unique` UNIQUE(`token`)
);
