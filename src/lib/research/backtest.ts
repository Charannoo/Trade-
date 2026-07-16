/**
 * research/backtest.ts — Self-backtest loop.
 * 
 * Takes past predictions, replays them point-in-time,
 * and generates backtest results for strategy comparison.
 */
import { db } from "@/lib/db";
import { backtests, predictions, strategyVersions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getDailyBars } from "@/lib/yahoo/poller";
import { computeSnapshot } from "./indicators";
import { getActiveStrategy } from "./strategy";

export interface BacktestResult {
  id: number;
  symbol: string;
  asOf: number;
  outlook: string;
  confidence: number;
  horizonDays: number;
  thesis: string;
  priceAtAsOf: number;
  priceAtHorizon: number;
  returnPct: number;
  directionCorrect: boolean;
  regime: string | null;
}

/**
 * Run a backtest for a single prediction.
 * Replays the prediction at its generatedAt time and checks the outcome.
 */
export async function runBacktest(
  symbol: string,
  asOf: number,
  horizonDays: number
): Promise<BacktestResult | null> {
  const bars = await getDailyBars(symbol, 365);
  if (bars.length < horizonDays + 20) {
    return null;
  }

  // Find the bar closest to asOf
  const asOfBar = bars.find(
    (b) => Math.abs(b.time * 1000 - asOf) < 2 * 24 * 60 * 60 * 1000
  );
  if (!asOfBar) return null;

  // Find the bar at horizon
  const horizonTime = asOf + horizonDays * 24 * 60 * 60 * 1000;
  const horizonBar = bars.find(
    (b) => Math.abs(b.time * 1000 - horizonTime) < 2 * 24 * 60 * 60 * 1000
  );
  if (!horizonBar) return null;

  // Compute indicators at asOf time
  const barsUpToAsOf = bars.filter((b) => b.time * 1000 <= asOf);
  const snapshot = computeSnapshot(barsUpToAsOf);
  const { indicators } = snapshot;

  // Simple strategy: use regime + trend to determine outlook
  let outlook = "neutral";
  let confidence = 3;

  const price = asOfBar.close;
  const sma20 = indicators.sma20;
  const sma50 = indicators.sma50;
  const rsi = indicators.rsi;
  const regime = (indicators as any).regime ?? null;

  if (sma20 && sma50) {
    if (price > sma20 && sma20 > sma50) {
      outlook = "bullish";
      confidence = 5;
    } else if (price < sma20 && sma20 < sma50) {
      outlook = "bearish";
      confidence = 5;
    }
  }

  if (rsi) {
    if (rsi < 30) { outlook = "bullish"; confidence = Math.min(7, confidence + 2); }
    if (rsi > 70) { outlook = "bearish"; confidence = Math.min(7, confidence + 2); }
  }

  const returnPct = ((horizonBar.close - asOfBar.close) / asOfBar.close) * 100;
  const actualDirection = returnPct > 0 ? 1 : -1;
  const predictedDirection = outlook === "bullish" ? 1 : outlook === "bearish" ? -1 : 0;
  const directionCorrect = outlook === "neutral"
    ? Math.abs(returnPct) <= 5
    : predictedDirection === actualDirection;

  // Write to backtests table
  const inserted = db.insert(backtests)
    .values({
      symbol,
      asOf,
      outlook,
      confidence,
      horizonDays,
      thesis: `Backtest: ${outlook} at $${price.toFixed(2)} (RSI ${rsi?.toFixed(0) ?? "N/A"})`,
      quantSnapshot: snapshot,
      priceAtAsOf: asOfBar.close,
      priceAtHorizon: horizonBar.close,
      returnPct,
      directionCorrect,
      createdAt: Date.now(),
      algoVersion: getActiveStrategy()?.version ?? null,
      regime: regime,
    })
    .run();

  return {
    id: Number(inserted.lastInsertRowid),
    symbol,
    asOf,
    outlook,
    confidence,
    horizonDays,
    thesis: `Backtest: ${outlook}`,
    priceAtAsOf: asOfBar.close,
    priceAtHorizon: horizonBar.close,
    returnPct,
    directionCorrect,
    regime,
  };
}

/**
 * Run a batch of backtests over historical data.
 * Samples dates at regular intervals over the past year.
 */
export async function runBacktestBatch(
  symbol: string,
  horizonDays: number = 60,
  sampleCount: number = 12
): Promise<BacktestResult[]> {
  const bars = await getDailyBars(symbol, 365);
  if (bars.length < horizonDays + 30) return [];

  const results: BacktestResult[] = [];
  const step = Math.floor((bars.length - horizonDays) / sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const barIndex = Math.floor(bars.length * 0.2) + i * step; // Start from 20% to avoid look-ahead
    if (barIndex + horizonDays >= bars.length) break;

    const bar = bars[barIndex];
    const result = await runBacktest(symbol, bar.time * 1000, horizonDays);
    if (result) results.push(result);
  }

  return results;
}

/**
 * Get backtest results for a symbol.
 */
export function getBacktests(symbol?: string, limit: number = 50) {
  if (symbol) {
    return db
      .select()
      .from(backtests)
      .where(eq(backtests.symbol, symbol.toUpperCase()))
      .orderBy(desc(backtests.createdAt))
      .limit(limit)
      .all();
  }

  return db
    .select()
    .from(backtests)
    .orderBy(desc(backtests.createdAt))
    .limit(limit)
    .all();
}

/**
 * Get backtest accuracy stats.
 */
export function getBacktestStats(symbol?: string): {
  total: number;
  correct: number;
  accuracy: number;
  avgReturnPct: number;
  avgConfidence: number;
} {
  const rows = symbol ? getBacktests(symbol, 1000) : getBacktests(undefined, 1000);

  if (rows.length === 0) {
    return { total: 0, correct: 0, accuracy: 0, avgReturnPct: 0, avgConfidence: 0 };
  }

  const correct = rows.filter((r) => r.directionCorrect).length;
  const totalReturn = rows.reduce((sum, r) => sum + r.returnPct, 0);
  const totalConf = rows.reduce((sum, r) => sum + r.confidence, 0);

  return {
    total: rows.length,
    correct,
    accuracy: correct / rows.length,
    avgReturnPct: totalReturn / rows.length,
    avgConfidence: totalConf / rows.length,
  };
}
