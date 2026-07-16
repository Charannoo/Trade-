/**
 * research/outcome-runner.ts — Grades expired predictions.
 * 
 * Runs periodically to check predictions that have passed their horizon,
 * fetch the actual price, grade the outcome, and write to prediction_outcomes.
 */
import { db } from "@/lib/db";
import { predictions, predictionOutcomes, strategyVersions, botActivity } from "@/lib/db/schema";
import { eq, and, lt, isNull } from "drizzle-orm";
import { getDailyBars } from "@/lib/yahoo/poller";
import { gradePrediction, computeEffectiveConfidence, getStrategyStats } from "./grading";

/**
 * Grade all predictions whose horizon has elapsed and have no outcome yet.
 * A prediction is "expired" if createdAt + horizonDays * 86400000 < now
 * and no matching row in prediction_outcomes.
 */
export async function gradeExpiredPredictions(): Promise<{
  graded: number;
  errors: string[];
}> {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const errors: string[] = [];
  let graded = 0;

  // Find predictions without an outcome
  const allPreds = db.select().from(predictions).all();
  const outcomes = db.select().from(predictionOutcomes).all();
  const outcomeIds = new Set(outcomes.map((o) => o.predictionId));

  const expired = allPreds.filter((p) => {
    const expiresAt = p.createdAt + p.horizonDays * DAY_MS;
    return expiresAt < now && !outcomeIds.has(p.id);
  });

  for (const pred of expired) {
    try {
      // Get the price at horizon time
      const bars = await getDailyBars(pred.symbol, 5);
      if (bars.length === 0) {
        errors.push(`No price data for ${pred.symbol} at expiry`);
        continue;
      }

      const horizonTime = pred.createdAt + pred.horizonDays * DAY_MS;
      const expiryBar = bars.find(
        (b) => Math.abs(b.time * 1000 - horizonTime) < 2 * DAY_MS
      );
      if (!expiryBar) {
        errors.push(`No bar near expiry for ${pred.symbol}`);
        continue;
      }

      // Get the price at generation time
      const genBars = await getDailyBars(pred.symbol, 260);
      const genBar = genBars.find(
        (b) => Math.abs(b.time * 1000 - pred.createdAt) < 2 * DAY_MS
      );
      if (!genBar) {
        errors.push(`No bar near generation for ${pred.symbol}`);
        continue;
      }

      // Grade
      const grading = gradePrediction(pred.id, expiryBar.close, genBar.close);

      // Write outcome — match actual schema columns
      db.insert(predictionOutcomes)
        .values({
          predictionId: pred.id,
          evaluatedAt: now,
          priceAtPrediction: genBar.close,
          priceAtHorizon: expiryBar.close,
          returnPct: grading.returnPct,
          directionCorrect: grading.directionCorrect,
          neutralBandPct: grading.neutralBandPct,
        })
        .run();

      graded++;

      // Log activity
      db.insert(botActivity)
        .values({
          ts: now,
          symbol: pred.symbol,
          decision: grading.directionCorrect ? "skip" : "blocked",
          reason: `Graded: ${grading.directionCorrect ? "CORRECT" : "WRONG"} (${grading.returnPct >= 0 ? "+" : ""}${grading.returnPct.toFixed(1)}%)`,
        })
        .run();
    } catch (err: any) {
      errors.push(`Error grading ${pred.symbol}: ${err.message}`);
    }
  }

  return { graded, errors };
}

/**
 * Check if a strategy swap is warranted.
 * If a testing version has 20+ graded predictions and outperforms active,
 * promote it to active and demote the current active.
 */
export function checkStrategySwap(): {
  swapped: boolean;
  from?: number;
  to?: number;
  reason?: string;
} {
  const active = db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.status, "active"))
    .all()[0];

  const testing = db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.status, "testing"))
    .all()[0];

  if (!active || !testing) {
    return { swapped: false };
  }

  const activeStats = getStrategyStats(active.version);
  const testingStats = getStrategyStats(testing.version);

  if (testingStats.graded < 20) {
    return { swapped: false };
  }

  const delta = testingStats.accuracy - activeStats.accuracy;
  if (delta > 0.03) {
    const now = Date.now();

    // Demote active
    db.update(strategyVersions)
      .set({ status: "retired", retiredAt: now })
      .where(eq(strategyVersions.version, active.version))
      .run();

    // Promote testing
    db.update(strategyVersions)
      .set({ status: "active", activatedAt: now })
      .where(eq(strategyVersions.version, testing.version))
      .run();

    // Log
    db.insert(botActivity)
      .values({
        ts: now,
        symbol: "SYSTEM",
        decision: "skip",
        reason: `Strategy swap: v${active.version} → v${testing.version} (accuracy ${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}%)`,
      })
      .run();

    return {
      swapped: true,
      from: active.version,
      to: testing.version,
      reason: `Testing v${testing.version} outperformed active v${active.version} by ${(delta * 100).toFixed(1)}% over ${testingStats.graded} graded predictions`,
    };
  }

  return { swapped: false };
}
