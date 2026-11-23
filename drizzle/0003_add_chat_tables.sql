CREATE TABLE IF NOT EXISTS `chat_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visitor_name` text DEFAULT '' NOT NULL,
	`visitor_phone` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT 'ai' NOT NULL,
	`needs_admin` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`sender` text DEFAULT 'visitor' NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
