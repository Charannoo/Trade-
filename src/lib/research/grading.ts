/**
 * research/grading.ts — Prediction grading and calibration.
 * 
 * Uses actual DB schema:
 * - predictions: createdAt, algoVersion, no graded/expiresAt
 * - predictionOutcomes: directionCorrect, returnPct, neutralBandPct, benchmarkReturnPct
 */
import { db } from "@/lib/db";
import { predictions, predictionOutcomes, strategyVersions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface GradingResult {
  predictionId: number;
  directionCorrect: boolean;
  neutralBandPct: number | null;
  returnPct: number;
}

/**
 * Grade a single prediction against actual price outcome.
 */
export function gradePrediction(
  predictionId: number,
  priceAtHorizon: number,
  priceAtPrediction: number
): GradingResult {
  const pred = db
    .select()
    .from(predictions)
    .where(eq(predictions.id, predictionId))
    .all()[0];

  if (!pred) {
    throw new Error(`Prediction ${predictionId} not found`);
  }

  const returnPct = ((priceAtHorizon - priceAtPrediction) / priceAtPrediction) * 100;
  const predictedDirection = pred.outlook === "bullish" ? 1 : pred.outlook === "bearish" ? -1 : 0;
  const actualDirection = returnPct > 0.5 ? 1 : returnPct < -0.5 ? -1 : 0;

  // Direction correct: did we get the direction right?
  let directionCorrect: boolean;
  if (pred.outlook === "neutral") {
    directionCorrect = Math.abs(returnPct) <= 5;
  } else {
    directionCorrect = predictedDirection === actualDirection;
  }

  return {
    predictionId,
    directionCorrect,
    neutralBandPct: Math.abs(returnPct) <= 5 ? returnPct : null,
    returnPct,
  };
}

/**
 * Compute effective confidence for a strategy version.
 */
export function computeEffectiveConfidence(strategyVersion: number): {
  overall: { accuracy: number; count: number };
  byConfidence: Record<number, { accuracy: number; count: number }>;
  calibrationError: number;
} {
  const preds = db
    .select()
    .from(predictions)
    .where(eq(predictions.algoVersion, strategyVersion))
    .all();

  if (preds.length === 0) {
    return {
      overall: { accuracy: 0, count: 0 },
      byConfidence: {},
      calibrationError: 0,
    };
  }

  // Get outcomes for each prediction
  const outcomes = db.select().from(predictionOutcomes).all();
  const outcomeMap = new Map(outcomes.map((o) => [o.predictionId, o]));

  let correct = 0;
  const byConfidence: Record<number, { correct: number; total: number }> = {};

  for (const pred of preds) {
    const outcome = outcomeMap.get(pred.id);
    if (!outcome) continue;

    const confBucket = pred.confidence;
    if (!byConfidence[confBucket]) {
      byConfidence[confBucket] = { correct: 0, total: 0 };
    }
    byConfidence[confBucket].total++;

    if (outcome.directionCorrect) {
      correct++;
      byConfidence[confBucket].correct++;
    }
  }

  const overall = {
    accuracy: preds.length > 0 ? correct / preds.length : 0,
    count: preds.length,
  };

  // Compute by-confidence accuracy
  const byConfidenceAccuracy: Record<number, { accuracy: number; count: number }> = {};
  let calibrationError = 0;
  let calibrationCount = 0;

  for (const [conf, data] of Object.entries(byConfidence)) {
    const confNum = parseInt(conf);
    const accuracy = data.total > 0 ? data.correct / data.total : 0;
    byConfidenceAccuracy[confNum] = { accuracy, count: data.total };

    calibrationError += Math.abs(accuracy - confNum / 10);
    calibrationCount++;
  }

  return {
    overall,
    byConfidence: byConfidenceAccuracy,
    calibrationError: calibrationCount > 0 ? calibrationError / calibrationCount : 0,
  };
}

/**
 * Get historical accuracy baseline for comparison.
 */
export function getHistoricalBaseline(): {
  trendFollowAccuracy: number;
  randomAccuracy: number;
  currentAccuracy: number;
  sampleSize: number;
} {
  const preds = db.select().from(predictions).all();
  const outcomes = db.select().from(predictionOutcomes).all();
  const outcomeMap = new Map(outcomes.map((o) => [o.predictionId, o]));

  if (preds.length === 0) {
    return {
      trendFollowAccuracy: 0.55,
      randomAccuracy: 0.5,
      currentAccuracy: 0,
      sampleSize: 0,
    };
  }

  let correct = 0;
  for (const pred of preds) {
    const outcome = outcomeMap.get(pred.id);
    if (outcome?.directionCorrect) correct++;
  }

  return {
    trendFollowAccuracy: 0.55,
    randomAccuracy: 0.5,
    currentAccuracy: correct / preds.length,
    sampleSize: preds.length,
  };
}

/**
 * Compute overall stats for a strategy version.
 */
export function getStrategyStats(strategyVersion: number): {
  total: number;
  graded: number;
  correct: number;
  accuracy: number;
  avgConfidence: number;
  calibrationError: number;
} {
  const preds = db
    .select()
    .from(predictions)
    .where(eq(predictions.algoVersion, strategyVersion))
    .all();

  const outcomes = db.select().from(predictionOutcomes).all();
  const outcomeMap = new Map(outcomes.map((o) => [o.predictionId, o]));

  // "Graded" = has an outcome
  const graded = preds.filter((p) => outcomeMap.has(p.id));

  let correct = 0;
  let totalConfidence = 0;

  for (const pred of graded) {
    const outcome = outcomeMap.get(pred.id)!;
    totalConfidence += pred.confidence;
    if (outcome.directionCorrect) correct++;
  }

  return {
    total: preds.length,
    graded: graded.length,
    correct,
    accuracy: graded.length > 0 ? correct / graded.length : 0,
    avgConfidence: graded.length > 0 ? totalConfidence / graded.length : 0,
    calibrationError: computeEffectiveConfidence(strategyVersion).calibrationError,
  };
}
