CREATE TABLE `__new_item_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`store_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Each shelf goes to the store most of its items are in (else the first store), numbered alphabetically per store
INSERT INTO `__new_item_categories` (`id`, `name`, `store_id`, `position`)
SELECT `id`, `name`, `store_id`, ROW_NUMBER() OVER (PARTITION BY `store_id` ORDER BY `name`)
FROM (
	SELECT c.`id`, c.`name`, COALESCE(
		(SELECT i.`store_id` FROM `items` i
			WHERE i.`category_id` = c.`id` AND i.`store_id` IS NOT NULL
			GROUP BY i.`store_id` ORDER BY count(*) DESC, i.`store_id` LIMIT 1),
		(SELECT s.`id` FROM `stores` s ORDER BY s.`name` LIMIT 1)
	) AS `store_id`
	FROM `item_categories` c
)
WHERE `store_id` IS NOT NULL;
--> statement-breakpoint
-- Foreign keys stay enforced inside the migration transaction (PRAGMA foreign_keys=OFF is ignored there),
-- so detach items from the old table before dropping it and reattach them afterwards
CREATE TEMP TABLE `item_shelves` AS SELECT `id`, `category_id` FROM `items` WHERE `category_id` IS NOT NULL;--> statement-breakpoint
UPDATE `items` SET `category_id` = NULL;--> statement-breakpoint
DROP TABLE `item_categories`;--> statement-breakpoint
ALTER TABLE `__new_item_categories` RENAME TO `item_categories`;--> statement-breakpoint
UPDATE `items` SET `category_id` = (SELECT `category_id` FROM `item_shelves` WHERE `item_shelves`.`id` = `items`.`id`)
WHERE `id` IN (SELECT `id` FROM `item_shelves`)
	AND (SELECT `category_id` FROM `item_shelves` WHERE `item_shelves`.`id` = `items`.`id`) IN (SELECT `id` FROM `item_categories`);--> statement-breakpoint
DROP TABLE `item_shelves`;--> statement-breakpoint
-- Keep items consistent: a shelf implies its store
UPDATE `items` SET `store_id` = (SELECT `store_id` FROM `item_categories` WHERE `id` = `items`.`category_id`)
WHERE `category_id` IS NOT NULL AND `store_id` IS NULL;--> statement-breakpoint
UPDATE `items` SET `category_id` = NULL
WHERE `category_id` IS NOT NULL
	AND `store_id` != (SELECT `store_id` FROM `item_categories` WHERE `id` = `items`.`category_id`);
