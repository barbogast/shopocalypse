ALTER TABLE `recipe_ingredients` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- The original order wasn't stored, so existing recipes start out alphabetical, as they were shown
UPDATE `recipe_ingredients` SET `position` = (
  SELECT count(*) FROM `recipe_ingredients` AS `other`
  INNER JOIN `items` ON `items`.`id` = `other`.`item_id`
  WHERE `other`.`recipe_id` = `recipe_ingredients`.`recipe_id`
    AND `items`.`name` < (SELECT `name` FROM `items` WHERE `id` = `recipe_ingredients`.`item_id`)
) + 1;
