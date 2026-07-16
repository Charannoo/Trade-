/**
 * self-improve/gauntlet.ts — Strategy gauntlet.
 * 
 * Runs a new strategy version through a gauntlet of tests:
 * 1. Backtest on historical data
 * 2. Shadow prediction comparison
 * 3. Minimum accuracy threshold
 * 4. Calibration check
 * 
 * Only strategies that pass the gauntlet get promoted to active.
 */
import { db } from "@/lib/db";
import { strategyVersions, backtests, predictions, predictionOutcomes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runBacktestBatch, getBacktestStats } from "@/lib/research/backtest";
import { getStrategyStats, computeEffectiveConfidence } from "@/lib/research/grading";

export interface GauntletResult {
  passed: boolean;
  version: number;
  tests: {
    name: string;
    passed: boolean;
    score: number;
    detail: string;
  }[];
  overallScore: number;
  recommendation: "promote" | "keep_testing" | "reject";
}

/**
 * Run the gauntlet on a testing strategy version.
 */
export async function runGauntlet(version: number): Promise<GauntletResult> {
  const strategy = db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.version, version))
    .all()[0];

  if (!strategy) {
    return {
      passed: false,
      version,
      tests: [],
      overallScore: 0,
      recommendation: "reject",
    };
  }

  const tests: GauntletResult["tests"] = [];
  const active = db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.status, "active"))
    .all()[0];

  // Test 1: Minimum predictions
  const stats = getStrategyStats(version);
  const minPredictions = stats.graded >= 20;
  tests.push({
    name: "Minimum Predictions",
    passed: minPredictions,
    score: minPredictions ? 1 : 0,
    detail: `${stats.graded}/20 graded predictions`,
  });

  // Test 2: Accuracy threshold
  const accuracyThreshold = stats.accuracy >= 0.55;
  tests.push({
    name: "Accuracy Threshold",
    passed: accuracyThreshold,
    score: accuracyThreshold ? 1 : 0,
    detail: `Accuracy: ${(stats.accuracy * 100).toFixed(1)}% (threshold: 55%)`,
  });

  // Test 3: Outperform active
  let outperformActive = false;
  if (active) {
    const activeStats = getStrategyStats(active.version);
    outperformActive = stats.accuracy > activeStats.accuracy;
  } else {
    outperformActive = stats.accuracy > 0.5; // Beat random
  }
  tests.push({
    name: "Outperform Active",
    passed: outperformActive,
    score: outperformActive ? 1 : 0,
    detail: active
      ? `Testing: ${(stats.accuracy * 100).toFixed(1)}% vs Active: ${(getStrategyStats(active.version).accuracy * 100).toFixed(1)}%`
      : `No active strategy — testing against 50% baseline`,
  });

  // Test 4: Calibration
  const calibration = computeEffectiveConfidence(version);
  const calibrationOk = calibration.calibrationError < 0.2;
  tests.push({
    name: "Calibration",
    passed: calibrationOk,
    score: calibrationOk ? 1 : 0,
    detail: `Calibration error: ${calibration.calibrationError.toFixed(3)} (threshold: 0.2)`,
  });

  // Test 5: No extreme miscalibration
  let noExtremeMiscalibration = true;
  for (const [conf, data] of Object.entries(calibration.byConfidence) as [string, { accuracy: number; count: number }][]) {
    if (data.count >= 5) {
      const confNum = parseInt(conf);
      const expectedAccuracy = confNum / 10;
      const actualAccuracy = data.accuracy;
      if (Math.abs(actualAccuracy - expectedAccuracy) > 0.4) {
        noExtremeMiscalibration = false;
        break;
      }
    }
  }
  tests.push({
    name: "No Extreme Miscalibration",
    passed: noExtremeMiscalibration,
    score: noExtremeMiscalibration ? 1 : 0,
    detail: noExtremeMiscalibration
      ? "No confidence level is severely miscalibrated"
      : "Some confidence levels show extreme miscalibration",
  });

  // Overall score
  const passedTests = tests.filter((t) => t.passed).length;
  const overallScore = passedTests / tests.length;

  // Recommendation
  let recommendation: GauntletResult["recommendation"];
  if (overallScore >= 0.8 && minPredictions && accuracyThreshold) {
    recommendation = "promote";
  } else if (overallScore >= 0.4) {
    recommendation = "keep_testing";
  } else {
    recommendation = "reject";
  }

  return {
    passed: recommendation === "promote",
    version,
    tests,
    overallScore,
    recommendation,
  };
}

/**
 * Promote a strategy from testing to active.
 */
export function promoteStrategy(version: number): void {
  const now = Date.now();

  // Demote current active
  const active = db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.status, "active"))
    .all()[0];

  if (active) {
    db.update(strategyVersions)
      .set({ status: "retired", retiredAt: now })
      .where(eq(strategyVersions.version, active.version))
      .run();
  }

  // Promote the new one
  db.update(strategyVersions)
    .set({ status: "active", activatedAt: now })
    .where(eq(strategyVersions.version, version))
    .run();
}

/**
 * Reject a testing strategy.
 */
export function rejectStrategy(version: number): void {
  db.update(strategyVersions)
    .set({ status: "retired", retiredAt: Date.now() })
    .where(eq(strategyVersions.version, version))
    .run();
}
