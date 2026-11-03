PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shopping_list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopping_list_id` integer NOT NULL,
	`item_id` integer,
	`name` text,
	`store_id` integer,
	`category_id` integer,
	`amounts` text NOT NULL,
	`notes` text DEFAULT '[]' NOT NULL,
	`bought` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`shopping_list_id`) REFERENCES `shopping_lists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `item_categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shopping_list_items_item_or_name" CHECK((item_id is null) <> (name is null))
);
--> statement-breakpoint
INSERT INTO `__new_shopping_list_items`("id", "shopping_list_id", "item_id", "amounts", "notes", "bought", "source") SELECT "id", "shopping_list_id", "item_id", "amounts", "notes", "bought", "source" FROM `shopping_list_items`;--> statement-breakpoint
DROP TABLE `shopping_list_items`;--> statement-breakpoint
ALTER TABLE `__new_shopping_list_items` RENAME TO `shopping_list_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `shopping_list_items_list_item` ON `shopping_list_items` (`shopping_list_id`,`item_id`);