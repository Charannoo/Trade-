/**
 * schema.ts — Full Drizzle schema for TradeS.
 *
 * WRITER-OWNERSHIP CONTRACT (never violate this):
 *   WORKER writes: latest_prices, bars_cache, quant_signals, predictions,
 *     prediction_outcomes, backtests, account_snapshots, bot_activity,
 *     bot_trades (derived), lessons, strategy_versions, discoveries (rows + grading),
 *     assistant chat_messages, translations.
 *   NEXT.js writes: holdings, watchlist, jobs, orders_log (on submit),
 *     bot_config, bot_rules, bot_rule_versions, rule_suggestions status,
 *     discoveries status (approve/dismiss), user chat_messages.
 */
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ============================================================================
// MARKET DATA & UNIVERSE
// ============================================================================

/** User's portfolio — manual entry, no brokerage sync. */
export const holdings = sqliteTable("holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  shares: real("shares").notNull(),
  costBasis: real("cost_basis").notNull(), // per share in listing currency
  acquiredAt: integer("acquired_at", { mode: "number" }),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

/** Tickers to track. Prediction universe = holdings ∪ watchlist. */
export const watchlist = sqliteTable("watchlist", {
  symbol: text("symbol").primaryKey(),
  addedAt: integer("added_at", { mode: "number" }).notNull(),
});

/** Hot row per symbol — latest price from any source. */
export const latestPrices = sqliteTable("latest_prices", {
  symbol: text("symbol").primaryKey(),
  price: real("price").notNull(),
  prevClose: real("prev_close"),
  dayOpen: real("day_open"),
  ts: integer("ts", { mode: "number" }).notNull(),
  marketOpen: integer("market_open", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull().default("yahoo"), // "alpaca" | "yahoo"
  delayed: integer("delayed", { mode: "boolean" }).notNull().default(true),
  currency: text("currency").default("USD"),
});

/** Cached OHLCV bars. */
export const barsCache = sqliteTable(
  "bars_cache",
  {
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").notNull(), // "1Day", "15Min", etc.
    ts: integer("ts", { mode: "number" }).notNull(),
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    volume: integer("volume").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.symbol, t.timeframe, t.ts] }),
    index("bars_symbol_tf_idx").on(t.symbol, t.timeframe),
  ]
);

/** Deterministic technical indicator snapshots. */
export const quantSignals = sqliteTable("quant_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  computedAt: integer("computed_at", { mode: "number" }).notNull(),
  payload: text("payload", { mode: "json" }).notNull(), // { indicators, patterns }
});

// ============================================================================
// PREDICTIONS & GRADING
// ============================================================================

/**
 * Append-only — NEVER update a prediction row.
 * This IS the accuracy dataset.
 */
export const predictions = sqliteTable(
  "predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    outlook: text("outlook").notNull(), // "bullish" | "neutral" | "bearish"
    confidence: integer("confidence").notNull(), // 0..10
    horizonDays: integer("horizon_days").notNull(),
    thesis: text("thesis").notNull(), // English base — always
    risks: text("risks", { mode: "json" }).notNull(), // string[]
    catalysts: text("catalysts", { mode: "json" }).notNull(), // string[]
    sources: text("sources", { mode: "json" }).notNull(), // {title, url}[]
    quantSnapshot: text("quant_snapshot", { mode: "json" }), // { indicators, patterns }
    model: text("model"),
    durationMs: integer("duration_ms"),
    status: text("status").notNull().default("ok"), // "ok" | "error"
    raw: text("raw"), // kept only when parsing failed
    revisedFromId: integer("revised_from_id"), // linked via challenge chat
    algoVersion: integer("algo_version"), // null = v1 era
    regime: text("regime"), // "bull-calm" | "bull-vol" | "bear" | "chop"
  },
  (t) => [index("pred_symbol_created_idx").on(t.symbol, t.createdAt)]
);

/** Graded outcomes for live predictions — populated after horizon elapses. */
export const predictionOutcomes = sqliteTable("prediction_outcomes", {
  predictionId: integer("prediction_id").primaryKey(),
  evaluatedAt: integer("evaluated_at", { mode: "number" }).notNull(),
  priceAtPrediction: real("price_at_prediction").notNull(),
  priceAtHorizon: real("price_at_horizon").notNull(),
  returnPct: real("return_pct").notNull(),
  directionCorrect: integer("direction_correct", { mode: "boolean" }).notNull(),
  maxDrawdownPct: real("max_drawdown_pct"),
  maxGainPct: real("max_gain_pct"),
  neutralBandPct: real("neutral_band_pct"),
  benchmarkReturnPct: real("benchmark_return_pct"),
});

/** Point-in-time sims graded immediately. */
export const backtests = sqliteTable(
  "backtests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    asOf: integer("as_of", { mode: "number" }).notNull(),
    outlook: text("outlook").notNull(),
    confidence: integer("confidence").notNull(),
    horizonDays: integer("horizon_days").notNull(),
    thesis: text("thesis").notNull(),
    quantSnapshot: text("quant_snapshot", { mode: "json" }),
    priceAtAsOf: real("price_at_as_of").notNull(),
    priceAtHorizon: real("price_at_horizon").notNull(),
    returnPct: real("return_pct").notNull(),
    directionCorrect: integer("direction_correct", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    algoVersion: integer("algo_version"),
    model: text("model"),
    regime: text("regime"),
    maxDrawdownPct: real("max_drawdown_pct"),
    maxGainPct: real("max_gain_pct"),
    neutralBandPct: real("neutral_band_pct"),
    benchmarkReturnPct: real("benchmark_return_pct"),
  },
  (t) => [index("bt_symbol_asof_idx").on(t.symbol, t.asOf)]
);

/** Shadow predictions — separate table so bot/track-record NEVER trades on unvalidated. */
export const shadowPredictions = sqliteTable(
  "shadow_predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    strategyVersion: integer("strategy_version").notNull(),
    pairedPredictionId: integer("paired_prediction_id"),
    outlook: text("outlook").notNull(),
    confidence: integer("confidence").notNull(),
    horizonDays: integer("horizon_days").notNull(),
    thesis: text("thesis").notNull(),
    model: text("model"),
    regime: text("regime"),
    // In-place grading columns
    evaluatedAt: integer("evaluated_at", { mode: "number" }),
    priceAtPrediction: real("price_at_prediction"),
    priceAtHorizon: real("price_at_horizon"),
    returnPct: real("return_pct"),
    directionCorrect: integer("direction_correct", { mode: "boolean" }),
    maxDrawdownPct: real("max_drawdown_pct"),
    maxGainPct: real("max_gain_pct"),
    neutralBandPct: real("neutral_band_pct"),
    benchmarkReturnPct: real("benchmark_return_pct"),
  },
  (t) => [
    index("shadow_symbol_created_idx").on(t.symbol, t.createdAt),
    index("shadow_strategy_idx").on(t.strategyVersion),
  ]
);

// ============================================================================
// DISCOVERIES
// ============================================================================

export const discoveries = sqliteTable(
  "discoveries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanId: integer("scan_id").notNull(), // ms timestamp grouping one scan's picks
    symbol: text("symbol").notNull(),
    companyName: text("company_name").notNull(),
    angle: text("angle"), // "second-order" | "primary-source" | "commodity-chain" | "dislocation"
    theme: text("theme").notNull(),
    thesis: text("thesis").notNull(), // English base
    whyOverlooked: text("why_overlooked").notNull(),
    catalysts: text("catalysts", { mode: "json" }).notNull(),
    risks: text("risks", { mode: "json" }).notNull(),
    sources: text("sources", { mode: "json" }).notNull(),
    confidence: integer("confidence").notNull(),
    horizonDays: integer("horizon_days").notNull(),
    model: text("model"),
    status: text("status").notNull().default("pending"), // "pending" | "approved" | "dismissed"
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    resolvedAt: integer("resolved_at", { mode: "number" }),
    priceAtDiscovery: real("price_at_discovery"),
    atrPctAtDiscovery: real("atr_pct_at_discovery"),
    // In-place grading
    evaluatedAt: integer("evaluated_at", { mode: "number" }),
    priceAtHorizon: real("price_at_horizon"),
    returnPct: real("return_pct"),
    directionCorrect: integer("direction_correct", { mode: "boolean" }),
    neutralBandPct: real("neutral_band_pct"),
    benchmarkReturnPct: real("benchmark_return_pct"),
  },
  (t) => [
    index("disc_status_created_idx").on(t.status, t.createdAt),
    index("disc_symbol_created_idx").on(t.symbol, t.createdAt),
  ]
);

// ============================================================================
// SELF-IMPROVEMENT
// ============================================================================

export const lessons = sqliteTable(
  "lessons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    predictionId: integer("prediction_id"),
    backtestId: integer("backtest_id"),
    source: text("source").notNull(), // "live" | "sim"
    symbol: text("symbol").notNull(),
    regime: text("regime"),
    algoVersion: integer("algo_version"),
    outlook: text("outlook").notNull(),
    confidence: integer("confidence").notNull(),
    returnPct: real("return_pct").notNull(),
    directionCorrect: integer("direction_correct", { mode: "boolean" }).notNull(),
    rootCause: text("root_cause").notNull(), // enum of root causes
    evidence: text("evidence").notNull(),
    ruleOfThumb: text("rule_of_thumb").notNull(), // English base
    model: text("model"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("lessons_cause_created_idx").on(t.rootCause, t.createdAt),
    index("lessons_pred_idx").on(t.predictionId),
    index("lessons_bt_idx").on(t.backtestId),
  ]
);

export const strategyVersions = sqliteTable("strategy_versions", {
  version: integer("version").primaryKey(),
  parentVersion: integer("parent_version"),
  fullText: text("full_text").notNull(),
  quantText: text("quant_text").notNull(),
  changeSummary: text("change_summary").notNull(), // English base
  rationale: text("rationale").notNull(),
  tier: text("tier").notNull(), // "quant" | "full" | "both"
  status: text("status").notNull().default("proposed"),
  scorecard: text("scorecard", { mode: "json" }),
  createdBy: text("created_by").notNull(), // "strategist" | "human"
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  activatedAt: integer("activated_at", { mode: "number" }),
  retiredAt: integer("retired_at", { mode: "number" }),
});

// ============================================================================
// TRADING / BOT
// ============================================================================

export const ordersLog = sqliteTable("orders_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  alpacaOrderId: text("alpaca_order_id").unique().notNull(),
  parentOrderId: text("parent_order_id"),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // "buy" | "sell"
  type: text("type").notNull(),
  qty: real("qty"),
  notional: real("notional"),
  limitPrice: real("limit_price"),
  status: text("status").notNull(),
  source: text("source").notNull().default("manual"), // "manual" | "bot"
  submittedAt: integer("submitted_at", { mode: "number" }).notNull(),
  filledAt: integer("filled_at", { mode: "number" }),
  filledAvgPrice: real("filled_avg_price"),
  raw: text("raw", { mode: "json" }),
});

export const accountSnapshots = sqliteTable("account_snapshots", {
  ts: integer("ts", { mode: "number" }).primaryKey(),
  equity: real("equity").notNull(),
  cash: real("cash").notNull(),
  buyingPower: real("buying_power").notNull(),
});

export const botConfig = sqliteTable("bot_config", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const botRules = sqliteTable("bot_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  condition: text("condition", { mode: "json" }).notNull(),
  action: text("action", { mode: "json" }).notNull(),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const botRuleVersions = sqliteTable("bot_rule_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id").notNull(),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  condition: text("condition", { mode: "json" }).notNull(),
  action: text("action", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const ruleSuggestions = sqliteTable("rule_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id"),
  ruleVersion: integer("rule_version"),
  suggestedCondition: text("suggested_condition", { mode: "json" }).notNull(),
  suggestedAction: text("suggested_action", { mode: "json" }).notNull(),
  summary: text("summary").notNull(), // English base
  evidence: text("evidence", { mode: "json" }).notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "applied" | "dismissed"
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  resolvedAt: integer("resolved_at", { mode: "number" }),
});

/** Derived realized round trips — rebuilt from orders_log + bot_activity. */
export const botTrades = sqliteTable("bot_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  ruleId: integer("rule_id"),
  ruleVersion: integer("rule_version"),
  exitRuleId: integer("exit_rule_id"),
  qty: real("qty").notNull(),
  entryOrderId: text("entry_order_id").notNull(),
  exitOrderId: text("exit_order_id"),
  entryAt: integer("entry_at", { mode: "number" }).notNull(),
  exitAt: integer("exit_at", { mode: "number" }),
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  pnlUsd: real("pnl_usd"),
  pnlPct: real("pnl_pct"),
  exitKind: text("exit_kind"), // "stop-loss" | "take-profit" | "sell-rule" | "other"
});

/** Full audit log incl. blocked/halt decisions. */
export const botActivity = sqliteTable("bot_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: integer("ts", { mode: "number" }).notNull(),
  ruleId: integer("rule_id"),
  ruleVersion: integer("rule_version"),
  symbol: text("symbol"),
  decision: text("decision").notNull(), // "buy" | "sell" | "skip" | "blocked" | "halt"
  reason: text("reason").notNull(),
  orderId: text("order_id"),
  snapshot: text("snapshot", { mode: "json" }),
});

// ============================================================================
// SUPPORT
// ============================================================================

/** On-demand display-only translation cache. One table serves every non-base language. */
export const translations = sqliteTable("translations", {
  hash: text("hash").primaryKey(), // sha256(lang + "\n" + sourceText)
  lang: text("lang").notNull(),
  sourceText: text("source_text").notNull(),
  translatedText: text("translated_text").notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("guest"), // "owner" | "guest"
  lang: text("lang").notNull().default("en"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  predictionId: integer("prediction_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const companyLinks = sqliteTable("company_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  relatedSymbol: text("related_symbol"),
  relatedName: text("related_name").notNull(),
  type: text("type").notNull(), // "supplier" | "customer" | "peer"
  rationale: text("rationale").notNull(), // English base
  dependency: text("dependency"), // "high" | "medium" | "low"
  confidence: integer("confidence").notNull(),
  discoveredAt: integer("discovered_at", { mode: "number" }).notNull(),
});

/** Async UI→worker bridge. */
export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(), // "research" | "chat" | "postmortem" | "backtest" | "relations" | "discovery"
    payload: text("payload", { mode: "json" }).notNull(),
    status: text("status").notNull().default("queued"), // "queued" | "running" | "done" | "error"
    result: text("result", { mode: "json" }),
    error: text("error"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    startedAt: integer("started_at", { mode: "number" }),
    finishedAt: integer("finished_at", { mode: "number" }),
  },
  (t) => [index("jobs_status_created_idx").on(t.status, t.createdAt)]
);
