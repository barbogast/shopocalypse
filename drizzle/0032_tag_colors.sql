ALTER TABLE `tags` ADD `color` text DEFAULT 'blue' NOT NULL;--> statement-breakpoint
-- Existing tags get the palette's colors in order of creation, like new ones would (TAG_COLORS)
UPDATE `tags` SET `color` = (
	SELECT CASE (count(*) % 12)
		WHEN 0 THEN 'blue' WHEN 1 THEN 'green' WHEN 2 THEN 'orange' WHEN 3 THEN 'grape'
		WHEN 4 THEN 'teal' WHEN 5 THEN 'red' WHEN 6 THEN 'yellow' WHEN 7 THEN 'indigo'
		WHEN 8 THEN 'lime' WHEN 9 THEN 'pink' WHEN 10 THEN 'cyan' ELSE 'violet' END
	FROM `tags` AS earlier WHERE earlier.id < `tags`.id
);
