CREATE TABLE `shopping_list_recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopping_list_id` integer NOT NULL,
	`recipe_id` integer NOT NULL,
	FOREIGN KEY (`shopping_list_id`) REFERENCES `shopping_lists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
