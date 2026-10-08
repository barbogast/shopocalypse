-- SQLite can't add a NOT NULL column without a default; '' is never kept, the update below fills every row
ALTER TABLE `recipes` ADD `created_at` text NOT NULL DEFAULT '';--> statement-breakpoint
-- The real dates are unknown: count back one second per id from now, so the dates keep the id order
UPDATE `recipes` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ((SELECT max(`id`) FROM `recipes`) - `id`) || ' seconds');
