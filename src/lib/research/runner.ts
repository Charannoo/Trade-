/**
 * research/runner.ts — Orchestrates research runs.
 * 
 * Calls buildResearchPacket + runAnalyst, writes results to DB,
 * bridges predictions to the jobs queue.
 */
import { db } from "@/lib/db";
import { predictions, jobs, strategyVersions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { buildResearchPacket } from "./packet";
import { runAnalyst, quantHeuristic, type AgentResult } from "./ai-engine";
import { getActiveStrategy, getTestingVersion } from "./strategy";

export interface RunResult {
  symbol: string;
  predictionId: number | null;
  outlook: string | null;
  confidence: number | null;
  error?: string;
}

/**
 * Run analyst on a single symbol.
 */
export async function runResearchSingle(
  symbol: string,
  opts?: { horizonDays?: number; quantOnly?: boolean }
): Promise<RunResult> {
  const horizon = opts?.horizonDays ?? 60;
  const active = getActiveStrategy();

  try {
    // Build packet
    const packet = await buildResearchPacket(symbol);

    // Run analyst (API or fallback)
    let result = await runAnalyst(symbol, opts);

    // Fall back to quant heuristic if no prediction
    if (!result.prediction) {
      const heuristic = quantHeuristic(symbol, packet.quantSnapshot?.indicators);
      result = {
        prediction: heuristic.prediction,
        reasoning: heuristic.rawOutput,
        rawOutput: heuristic.rawOutput,
      };
    }

    if (!result.prediction) {
      return {
        symbol,
        predictionId: null,
        outlook: null,
        confidence: null,
        error: result.error ?? "No prediction returned",
      };
    }

    const pred = result.prediction;
    const now = Date.now();

    // Write prediction to DB — match actual schema columns
    const inserted = db
      .insert(predictions)
      .values({
        symbol: symbol.toUpperCase(),
        createdAt: now,
        outlook: pred.outlook,
        confidence: pred.confidence,
        horizonDays: pred.horizonDays,
        thesis: pred.thesis,
        risks: pred.risks,
        catalysts: pred.catalysts,
        sources: pred.sources,
        quantSnapshot: packet.quantSnapshot,
        algoVersion: active?.version ?? null,
        status: "ok",
        regime: packet.quantSnapshot?.indicators?.regime ?? null,
      })
      .run();

    const predictionId = Number(inserted.lastInsertRowid);

    return {
      symbol,
      predictionId,
      outlook: pred.outlook,
      confidence: pred.confidence,
    };
  } catch (err: any) {
    return {
      symbol,
      predictionId: null,
      outlook: null,
      confidence: null,
      error: err.message ?? "Unknown error",
    };
  }
}

/**
 * Run analyst on multiple symbols.
 */
export async function runResearchBatch(
  symbols: string[],
  opts?: { horizonDays?: number; quantOnly?: boolean; parallel?: number }
): Promise<RunResult[]> {
  const maxParallel = opts?.parallel ?? 3;
  const results: RunResult[] = [];

  for (let i = 0; i < symbols.length; i += maxParallel) {
    const batch = symbols.slice(i, i + maxParallel);
    const batchResults = await Promise.allSettled(
      batch.map((s) => runResearchSingle(s, opts))
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        results.push({
          symbol: "UNKNOWN",
          predictionId: null,
          outlook: null,
          confidence: null,
          error: r.reason?.message ?? "Promise rejected",
        });
      }
    }
  }

  return results;
}

/**
 * Check if a symbol was already predicted within the cooldown window.
 */
export function hasFreshPrediction(symbol: string, cooldownHours: number = 12): boolean {
  const cutoff = Date.now() - cooldownHours * 60 * 60 * 1000;
  const recent = db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.symbol, symbol.toUpperCase()),
      )
    )
    .all();

  return recent.some((r) => r.createdAt > cutoff);
}
