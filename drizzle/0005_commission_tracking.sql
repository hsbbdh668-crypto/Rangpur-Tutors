ALTER TABLE `applications` ADD COLUMN `commission_amount` integer;
--> statement-breakpoint
ALTER TABLE `applications` ADD COLUMN `commission_status` text DEFAULT 'pending' NOT NULL;
