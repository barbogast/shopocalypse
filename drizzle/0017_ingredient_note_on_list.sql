ALTER TABLE `recipe_ingredients` ADD `note_on_list` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `shopping_list_items` ADD `notes` text DEFAULT '[]' NOT NULL;