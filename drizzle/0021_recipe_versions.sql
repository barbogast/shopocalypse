CREATE TABLE `recipe_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`saved_at` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recipe_versions_recipe` ON `recipe_versions` (`recipe_id`,`saved_at`);