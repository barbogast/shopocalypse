PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_recipe_ingredients` (
	`recipe_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`recipe_id`, `item_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_recipe_ingredients`("recipe_id", "item_id", "quantity") SELECT "recipe_id", "item_id", "quantity" FROM `recipe_ingredients`;--> statement-breakpoint
DROP TABLE `recipe_ingredients`;--> statement-breakpoint
ALTER TABLE `__new_recipe_ingredients` RENAME TO `recipe_ingredients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;