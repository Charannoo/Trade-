/**
 * worker/research-runner.ts — Periodic research runs.
 * 
 * Runs the analyst on tracked symbols, checks cooldown, grades expired predictions.
 */
import { db } from "@/lib/db";
import { holdings, watchlist, jobs, botActivity } from "@/lib/db/schema";
import { runResearchSingle, hasFreshPrediction } from "@/lib/research/runner";
import { gradeExpiredPredictions, checkStrategySwap } from "@/lib/research/outcome-runner";

const RESEARCH_COOLDOWN_HOURS = 12;
const GRADE_INTERVAL_MS = 60 * 60 * 1000;
const SWAP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let lastGradeRun = 0;
let lastSwapCheck = 0;

/**
 * Run research on all tracked symbols.
 */
export async function runResearchCycle(): Promise<{
  processed: number;
  newPredictions: number;
  skipped: number;
  errors: string[];
}> {
  const now = Date.now();
  const errors: string[] = [];
  let processed = 0;
  let newPredictions = 0;
  let skipped = 0;

  // Get all unique tracked symbols
  const trackedSymbols = new Set<string>();

  const holdingsRows = db.select().from(holdings).all();
  for (const h of holdingsRows) {
    if (h.symbol) trackedSymbols.add(h.symbol.toUpperCase());
  }

  const watchlistRows = db.select().from(watchlist).all();
  for (const w of watchlistRows) {
    if (w.symbol) trackedSymbols.add(w.symbol.toUpperCase());
  }

  for (const symbol of trackedSymbols) {
    processed++;

    if (hasFreshPrediction(symbol, RESEARCH_COOLDOWN_HOURS)) {
      skipped++;
      continue;
    }

    // Queue a job
    try {
      db.insert(jobs)
        .values({
          type: "research",
          payload: JSON.stringify({ symbol, horizonDays: 60 }),
          status: "queued",
          createdAt: now,
        })
        .run();
    } catch (err: any) {
      errors.push(`Job queue error for ${symbol}: ${err.message}`);
    }

    // Run immediately
    const result = await runResearchSingle(symbol);
    if (result.predictionId) {
      newPredictions++;
    } else if (result.error) {
      errors.push(`${symbol}: ${result.error}`);
    }
  }

  // Grade expired predictions periodically
  if (now - lastGradeRun > GRADE_INTERVAL_MS) {
    lastGradeRun = now;
    const gradeResult = await gradeExpiredPredictions();
    if (gradeResult.graded > 0) {
      console.log(`[research-runner] Graded ${gradeResult.graded} predictions`);
    }
    errors.push(...gradeResult.errors);
  }

  // Check strategy swap periodically
  if (now - lastSwapCheck > SWAP_CHECK_INTERVAL_MS) {
    lastSwapCheck = now;
    const swapResult = checkStrategySwap();
    if (swapResult.swapped) {
      console.log(`[research-runner] Strategy swap: ${swapResult.reason}`);
    }
  }

  return { processed, newPredictions, skipped, errors };
}

/**
 * Run research on a single symbol (manual trigger).
 */
export async function runManualResearch(symbol: string) {
  return runResearchSingle(symbol);
}
