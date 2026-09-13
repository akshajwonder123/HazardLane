CREATE TABLE `weather_budget` (
	`id` text PRIMARY KEY NOT NULL,
	`minute_start` integer NOT NULL,
	`minute_used` integer NOT NULL,
	`hour_start` integer NOT NULL,
	`hour_used` integer NOT NULL,
	`day_start` integer NOT NULL,
	`day_used` integer NOT NULL,
	`blocked_until` integer NOT NULL
);
