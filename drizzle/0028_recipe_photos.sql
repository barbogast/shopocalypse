CREATE TABLE `recipe_photos` (
	`recipe_id` integer PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
