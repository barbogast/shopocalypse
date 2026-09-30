PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_recipe_ingredients` (
	`recipe_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`quantity` real,
	`unit` text,
	PRIMARY KEY(`recipe_id`, `item_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Existing unit-less quantities become pieces
INSERT INTO `__new_recipe_ingredients`("recipe_id", "item_id", "quantity", "unit") SELECT "recipe_id", "item_id", "quantity", 'pcs' FROM `recipe_ingredients`;--> statement-breakpoint
DROP TABLE `recipe_ingredients`;--> statement-breakpoint
ALTER TABLE `__new_recipe_ingredients` RENAME TO `recipe_ingredients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `items` ADD `default_unit` text;--> statement-breakpoint
-- The '[]' default only lets existing rows be added; the app always sets amounts
ALTER TABLE `shopping_list_items` ADD `amounts` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `shopping_list_items` ADD `bought` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `shopping_list_items` SET
	`amounts` = json_array(json_object('quantity', `quantity_needed`, 'unit', 'pcs')),
	`bought` = `quantity_bought` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `shopping_list_items` DROP COLUMN `quantity_needed`;--> statement-breakpoint
ALTER TABLE `shopping_list_items` DROP COLUMN `quantity_bought`;