/**
 * scripts/setup-autonomous.ts — Setup for ₹59 → ₹100 autonomous trading.
 *
 * Delta Exchange India uses BTCUSD, ETHUSD, SOLUSD format.
 * Uses leverage — small capital can still trade.
 */
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || "./data/trades.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");

const now = Date.now();

console.log("Setting up autonomous trading for ₹59 → ₹100...\n");

// 1. Delta Exchange India perpetuals
const watchlistSymbols = [
  "BTCUSD", "ETHUSD", "SOLUSD", "DOGEUSD", "XRPUSD",
]; // Only USD suffix — Delta does NOT use USDT

for (const symbol of watchlistSymbols) {
  sqlite.prepare("INSERT OR IGNORE INTO watchlist (symbol, added_at) VALUES (?, ?)").run(symbol, now);
}
console.log(`✓ Watchlist: ${watchlistSymbols.join(", ")}`);

// 2. Strategy — aggressive for small capital
const existingVersions = sqlite.prepare("SELECT COUNT(*) as cnt FROM strategy_versions").get() as any;
if (existingVersions.cnt === 0) {
  sqlite.prepare(
    `INSERT INTO strategy_versions (version, full_text, quant_text, change_summary, rationale, tier, status, created_by, created_at, activated_at)
     VALUES (1, 'Initial strategy.', 'Initial.', 'Marker.', 'Baseline.', 'both', 'retired', 'human', ?, ?)`
  ).run(now, now);

  sqlite.prepare(
    `INSERT INTO strategy_versions (version, parent_version, full_text, quant_text, change_summary, rationale, tier, status, created_by, created_at, activated_at)
     VALUES (2, 1,
       'Aggressive micro-capital crypto perpetual strategy. Use high leverage (10-25x) on trending coins. Enter on RSI oversold bounce (<35) with SMA50>SMA200 trend confirmation. Exit on RSI overbought (>70) or -3% stop. Focus on momentum: buy breakouts above SMA20 with volume confirmation. Quick trades — hold 1-3 days max. Take profit at +5% to +8%.',
       'Momentum scalping: leverage 10-25x. Entry: RSI<35 + SMA trend aligned + volume spike. Exit: RSI>70, stop -3%, take profit +5-8%. Max hold 3 days. Position: 80% of capital per trade.',
       'Aggressive micro-capital strategy for ₹59 → ₹100 target. High leverage, tight stops.',
       'Small capital needs high leverage and strict risk management. Momentum + mean reversion hybrid.',
       'both', 'active', 'human', ?, ?)`
  ).run(now, now);
  console.log("✓ Strategy: aggressive micro-capital perpetual v2");
} else {
  console.log("✓ Strategy versions exist");
}

// 3. Bot config — aggressive for ₹59
const configs: [string, any][] = [
  ["enabled", true],
  ["killSwitch", false],
  ["maxPositionPct", 80],       // Use 80% of capital per trade
  ["maxDailyLossPct", 15],      // Allow 15% daily loss (high risk for small capital)
  ["maxOpenPositions", 2],      // Max 2 concurrent positions
  ["minConfidence", 3],         // Low threshold — any signal = trade
  ["maxOrderValue", 50],        // Max ₹50 per order (most of ₹59)
  ["autoBrackets", true],
  ["stopLossPct", 3],           // Tight 3% stop
  ["takeProfitPct", 6],         // 6% take profit (2:1 ratio)
];

const upsertConfig = sqlite.prepare(
  "INSERT INTO bot_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);
for (const [key, value] of configs) {
  upsertConfig.run(key, JSON.stringify(value));
}
console.log("✓ Bot config: aggressive mode for ₹59");

// 4. Trading rules — simple and aggressive
const existingRules = sqlite.prepare("SELECT COUNT(*) as cnt FROM bot_rules").get() as any;
if (existingRules.cnt === 0) {
  const rules = [
    {
      name: "Buy Oversold Bounce",
      enabled: true,
      condition: JSON.stringify({ type: "indicator", indicator: "rsi", indicatorBelow: 35 }),
      action: JSON.stringify({ type: "buy_bracket", side: "buy", orderType: "market", qtyPct: 80, stopLossPct: 3, takeProfitPct: 6 }),
    },
    {
      name: "Buy Bullish Trend",
      enabled: true,
      condition: JSON.stringify({ type: "prediction", outlook: "bullish", minConfidence: 3 }),
      action: JSON.stringify({ type: "buy_bracket", side: "buy", orderType: "market", qtyPct: 80, stopLossPct: 3, takeProfitPct: 6 }),
    },
    {
      name: "Sell Bearish Signal",
      enabled: true,
      condition: JSON.stringify({ type: "prediction", outlook: "bearish", minConfidence: 3 }),
      action: JSON.stringify({ type: "sell", side: "sell", orderType: "market", qtyPct: 100 }),
    },
    {
      name: "Sell Overbought",
      enabled: true,
      condition: JSON.stringify({ type: "indicator", indicator: "rsi", indicatorAbove: 70 }),
      action: JSON.stringify({ type: "sell", side: "sell", orderType: "market", qtyPct: 100 }),
    },
    {
      name: "Buy MACD Crossover",
      enabled: true,
      condition: JSON.stringify({ type: "indicator", indicator: "macdHistogram", indicatorAbove: 0 }),
      action: JSON.stringify({ type: "buy_bracket", side: "buy", orderType: "market", qtyPct: 60, stopLossPct: 3, takeProfitPct: 6 }),
    },
  ];

  const insertRule = sqlite.prepare(
    "INSERT INTO bot_rules (name, enabled, condition, action, version, created_at) VALUES (?, ?, ?, ?, 1, ?)"
  );
  for (const rule of rules) {
    insertRule.run(rule.name, rule.enabled ? 1 : 0, rule.condition, rule.action, now);
  }
  console.log(`✓ Bot rules: ${rules.length} aggressive trading rules`);
} else {
  // Update existing rules to be more aggressive
  sqlite.prepare("UPDATE bot_rules SET enabled = 1").run();
  console.log("✓ Bot rules: enabled all rules");
}

sqlite.close();
console.log("\n========================================");
console.log("Setup complete! Bot ready for ₹59 → ₹100");
console.log("========================================");
