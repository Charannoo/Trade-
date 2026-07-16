CREATE TABLE `account_snapshots` (
	`ts` integer PRIMARY KEY NOT NULL,
	`equity` real NOT NULL,
	`cash` real NOT NULL,
	`buying_power` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backtests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`as_of` integer NOT NULL,
	`outlook` text NOT NULL,
	`confidence` integer NOT NULL,
	`horizon_days` integer NOT NULL,
	`thesis` text NOT NULL,
	`quant_snapshot` text,
	`price_at_as_of` real NOT NULL,
	`price_at_horizon` real NOT NULL,
	`return_pct` real NOT NULL,
	`direction_correct` integer NOT NULL,
	`created_at` integer NOT NULL,
	`algo_version` integer,
	`model` text,
	`regime` text,
	`max_drawdown_pct` real,
	`max_gain_pct` real,
	`neutral_band_pct` real,
	`benchmark_return_pct` real
);
--> statement-breakpoint
CREATE INDEX `bt_symbol_asof_idx` ON `backtests` (`symbol`,`as_of`);--> statement-breakpoint
CREATE TABLE `bars_cache` (
	`symbol` text NOT NULL,
	`timeframe` text NOT NULL,
	`ts` integer NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` integer NOT NULL,
	PRIMARY KEY(`symbol`, `timeframe`, `ts`)
);
--> statement-breakpoint
CREATE INDEX `bars_symbol_tf_idx` ON `bars_cache` (`symbol`,`timeframe`);--> statement-breakpoint
CREATE TABLE `bot_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`rule_id` integer,
	`rule_version` integer,
	`symbol` text,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`order_id` text,
	`snapshot` text
);
--> statement-breakpoint
CREATE TABLE `bot_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_rule_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`condition` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`condition` text NOT NULL,
	`action` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`rule_id` integer,
	`rule_version` integer,
	`exit_rule_id` integer,
	`qty` real NOT NULL,
	`entry_order_id` text NOT NULL,
	`exit_order_id` text,
	`entry_at` integer NOT NULL,
	`exit_at` integer,
	`entry_price` real NOT NULL,
	`exit_price` real,
	`pnl_usd` real,
	`pnl_pct` real,
	`exit_kind` text
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prediction_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`related_symbol` text,
	`related_name` text NOT NULL,
	`type` text NOT NULL,
	`rationale` text NOT NULL,
	`dependency` text,
	`confidence` integer NOT NULL,
	`discovered_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discoveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`company_name` text NOT NULL,
	`angle` text,
	`theme` text NOT NULL,
	`thesis` text NOT NULL,
	`why_overlooked` text NOT NULL,
	`catalysts` text NOT NULL,
	`risks` text NOT NULL,
	`sources` text NOT NULL,
	`confidence` integer NOT NULL,
	`horizon_days` integer NOT NULL,
	`model` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`price_at_discovery` real,
	`atr_pct_at_discovery` real,
	`evaluated_at` integer,
	`price_at_horizon` real,
	`return_pct` real,
	`direction_correct` integer,
	`neutral_band_pct` real,
	`benchmark_return_pct` real
);
--> statement-breakpoint
CREATE INDEX `disc_status_created_idx` ON `discoveries` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `disc_symbol_created_idx` ON `discoveries` (`symbol`,`created_at`);--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`shares` real NOT NULL,
	`cost_basis` real NOT NULL,
	`acquired_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `jobs_status_created_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `latest_prices` (
	`symbol` text PRIMARY KEY NOT NULL,
	`price` real NOT NULL,
	`prev_close` real,
	`day_open` real,
	`ts` integer NOT NULL,
	`market_open` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'yahoo' NOT NULL,
	`delayed` integer DEFAULT true NOT NULL,
	`currency` text DEFAULT 'USD'
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prediction_id` integer,
	`backtest_id` integer,
	`source` text NOT NULL,
	`symbol` text NOT NULL,
	`regime` text,
	`algo_version` integer,
	`outlook` text NOT NULL,
	`confidence` integer NOT NULL,
	`return_pct` real NOT NULL,
	`direction_correct` integer NOT NULL,
	`root_cause` text NOT NULL,
	`evidence` text NOT NULL,
	`rule_of_thumb` text NOT NULL,
	`model` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lessons_cause_created_idx` ON `lessons` (`root_cause`,`created_at`);--> statement-breakpoint
CREATE INDEX `lessons_pred_idx` ON `lessons` (`prediction_id`);--> statement-breakpoint
CREATE INDEX `lessons_bt_idx` ON `lessons` (`backtest_id`);--> statement-breakpoint
CREATE TABLE `orders_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alpaca_order_id` text NOT NULL,
	`parent_order_id` text,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`type` text NOT NULL,
	`qty` real,
	`notional` real,
	`limit_price` real,
	`status` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`submitted_at` integer NOT NULL,
	`filled_at` integer,
	`filled_avg_price` real,
	`raw` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_log_alpaca_order_id_unique` ON `orders_log` (`alpaca_order_id`);--> statement-breakpoint
CREATE TABLE `prediction_outcomes` (
	`prediction_id` integer PRIMARY KEY NOT NULL,
	`evaluated_at` integer NOT NULL,
	`price_at_prediction` real NOT NULL,
	`price_at_horizon` real NOT NULL,
	`return_pct` real NOT NULL,
	`direction_correct` integer NOT NULL,
	`max_drawdown_pct` real,
	`max_gain_pct` real,
	`neutral_band_pct` real,
	`benchmark_return_pct` real
);
--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`created_at` integer NOT NULL,
	`outlook` text NOT NULL,
	`confidence` integer NOT NULL,
	`horizon_days` integer NOT NULL,
	`thesis` text NOT NULL,
	`risks` text NOT NULL,
	`catalysts` text NOT NULL,
	`sources` text NOT NULL,
	`quant_snapshot` text,
	`model` text,
	`duration_ms` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`raw` text,
	`revised_from_id` integer,
	`algo_version` integer,
	`regime` text
);
--> statement-breakpoint
CREATE INDEX `pred_symbol_created_idx` ON `predictions` (`symbol`,`created_at`);--> statement-breakpoint
CREATE TABLE `quant_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`computed_at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rule_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer,
	`rule_version` integer,
	`suggested_condition` text NOT NULL,
	`suggested_action` text NOT NULL,
	`summary` text NOT NULL,
	`evidence` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE TABLE `shadow_predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`created_at` integer NOT NULL,
	`strategy_version` integer NOT NULL,
	`paired_prediction_id` integer,
	`outlook` text NOT NULL,
	`confidence` integer NOT NULL,
	`horizon_days` integer NOT NULL,
	`thesis` text NOT NULL,
	`model` text,
	`regime` text,
	`evaluated_at` integer,
	`price_at_prediction` real,
	`price_at_horizon` real,
	`return_pct` real,
	`direction_correct` integer,
	`max_drawdown_pct` real,
	`max_gain_pct` real,
	`neutral_band_pct` real,
	`benchmark_return_pct` real
);
--> statement-breakpoint
CREATE INDEX `shadow_symbol_created_idx` ON `shadow_predictions` (`symbol`,`created_at`);--> statement-breakpoint
CREATE INDEX `shadow_strategy_idx` ON `shadow_predictions` (`strategy_version`);--> statement-breakpoint
CREATE TABLE `strategy_versions` (
	`version` integer PRIMARY KEY NOT NULL,
	`parent_version` integer,
	`full_text` text NOT NULL,
	`quant_text` text NOT NULL,
	`change_summary` text NOT NULL,
	`rationale` text NOT NULL,
	`tier` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`scorecard` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`activated_at` integer,
	`retired_at` integer
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`hash` text PRIMARY KEY NOT NULL,
	`lang` text NOT NULL,
	`source_text` text NOT NULL,
	`translated_text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'guest' NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`symbol` text PRIMARY KEY NOT NULL,
	`added_at` integer NOT NULL
);
