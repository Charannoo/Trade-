/**
 * research/strategy.ts — DB-backed, versioned investment strategy.
 * The analyst's philosophy lives in the strategy_versions table,
 * not as a code constant. The self-improvement engine can propose,
 * test, promote, and roll back strategy versions.
 */
import { db } from "@/lib/db";
import { strategyVersions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Strategy body — the investment philosophy.
 * Stored WITHOUT the "## Investment strategy (vN)" header.
 */
const V2_FULL_TEXT = `**Philosophy:** you are estimating probabilities, not telling stories. Think in base rates and expected value. A thesis must name what would prove it wrong. Process over outcome; capital preservation over excitement. When evidence conflicts across timeframes, the higher timeframe wins.

1. **Regime first.** Establish market and stock regime before any setup: price vs 200-day SMA, VIX regime, relative strength vs sector and S&P. Long setups need an uptrend or early-reversal evidence; do not call bullish below a falling 200-day SMA, nor bearish on a strong uptrend without a concrete catalyst — trends persist more often than they reverse.

2. **Direction from fundamentals + flow of information,** in rough order: earnings surprise + raised guidance (post-earnings drift 30–60d); analyst estimate revisions (follow the revisions, not the target level); insider cluster buying (multiple insiders, real size); improving profitability/quality supports longs, deteriorating quality + rising leverage supports shorts.

3. **Timing from technicals:** uptrend pullback to 20/50-day SMA with RSI 35–50 resuming up; breakout above resistance/52w high on volume ≥150% of the 20-day average; oversold quality (RSI<30 above 200-day SMA) for a mean-reversion long; distribution/breakdown (falling OBV, volume breakdown below support) for bearish.

4. **Crowding check.** Extreme one-sided retail sentiment, parabolic extension, or "everyone agrees" narratives lower expected value — cut confidence.

5. **Confidence rubric** (start at 3, adjust, justify each point): +1 regime aligned; +1 confirmed fundamental catalyst; +1 clean technical setup with volume; +1 insider cluster or persistent revisions your way; −1 crowded/extended; −1 timeframes conflict; −1 measured track record shows this segment underperforming. Cap at 8 unless nearly everything aligns. Below 4 = "lean, don't bet."

6. **Horizon discipline.** Mean-reversion 10–30d, breakout/PEAD 30–60d, trend continuation 60–90d. Only call neutral when you truly expect a flat range; on a high-vol stock (ATR>3%) prefer a low-confidence directional call.

7. **Falsification.** End every thesis with the invalidation level/event/data.`;

const V2_QUANT_TEXT = `**Technicals-only playbook** (no fundamentals, no news — for point-in-time sims):

1. **Regime from price:** above 200-day SMA = uptrend; below = downtrend; within 3% = neutral zone. Do not call bullish below a falling 200-day SMA.

2. **Direction from trend:** price above 50-day SMA with rising 20-day SMA = bullish; below with falling = bearish. MACD histogram sign confirms momentum direction.

3. **Timing from technicals:** pullback to 20/50 SMA with RSI 35–50 and RSI turning up = entry; breakout above 20-bar high on volume ≥150% of 20-day average = entry; oversold (RSI<30 above 200 SMA) for mean-reversion long; breakdown below 20-bar low on volume = bearish.

4. **Volume confirmation:** price moves without volume increase (below 20-day avg) are suspect. Volume spikes (≥2x average) confirm breakout/breakdown.

5. **Confidence rubric** (start at 3): +1 trend aligned; +1 clean setup with volume; +1 RSI confirms direction; −1 conflicting signals across timeframes; −1 low volume on signal. Cap at 7.

6. **Horizon:** 10–30d for mean-reversion, 30–60d for breakouts.

7. **Falsification:** name the level that invalidates the setup.`;

/**
 * Seed v1 (marker) and v2 (real playbook) idempotently on first run.
 */
export function seedStrategyVersions(): void {
  const existing = db.select().from(strategyVersions).all();
  if (existing.length > 0) return; // Already seeded

  const now = Date.now();

  // v1: marker (the old era)
  db.insert(strategyVersions)
    .values({
      version: 1,
      fullText: "Initial strategy (pre-versioning). No formal strategy body.",
      quantText: "Initial quant strategy.",
      changeSummary: "Initial version — marker for pre-versioning predictions.",
      rationale: "Establishes baseline for accuracy tracking.",
      tier: "both",
      status: "retired",
      createdBy: "human",
      createdAt: now,
    })
    .run();

  // v2: the real playbook
  db.insert(strategyVersions)
    .values({
      version: 2,
      parentVersion: 1,
      fullText: V2_FULL_TEXT,
      quantText: V2_QUANT_TEXT,
      changeSummary: "Initial formal strategy: regime-first, fundamentals for direction, technicals for timing, confidence rubric with falsification.",
      rationale: "Based on well-replicated market research. Regime-aware, falsifiable, conservative.",
      tier: "both",
      status: "active",
      createdBy: "human",
      createdAt: now,
      activatedAt: now,
    })
    .run();

  console.log("[strategy] Seeded v1 (marker) and v2 (active playbook)");
}

/**
 * Get the currently active strategy version.
 */
export function getActiveStrategy(): typeof strategyVersions.$inferSelect | null {
  const row = db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.status, "active"))
    .all()[0];
  return row ?? null;
}

/**
 * Get the testing version (if any).
 */
export function getTestingVersion(): typeof strategyVersions.$inferSelect | null {
  const row = db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.status, "testing"))
    .all()[0];
  return row ?? null;
}

/**
 * Get a specific strategy version by number.
 */
export function getStrategyVersion(version: number): typeof strategyVersions.$inferSelect | null {
  const row = db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.version, version))
    .all()[0];
  return row ?? null;
}

/**
 * Render the full strategy with header for the analyst prompt.
 */
export function renderFullStrategy(strategy: typeof strategyVersions.$inferSelect): string {
  return `## Investment strategy (v${strategy.version})\n\n${strategy.fullText}`;
}

/**
 * Render the quant-only strategy with header for sims.
 */
export function renderQuantStrategy(strategy: typeof strategyVersions.$inferSelect): string {
  return `## Technicals-only strategy (v${strategy.version})\n\n${strategy.quantText}`;
}
