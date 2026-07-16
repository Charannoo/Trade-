/**
 * self-improve/lessons.ts — Lesson extraction from losses.
 * 
 * Uses actual schema: rootCause, evidence, ruleOfThumb, returnPct, directionCorrect.
 */
import { db } from "@/lib/db";
import { predictions, predictionOutcomes, lessons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Extract lessons from incorrect predictions.
 */
export async function extractLessons(): Promise<{
  extracted: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let extracted = 0;

  // Find incorrect predictions that haven't been lessoned yet
  const incorrect = db
    .select()
    .from(predictions)
    .all()
    .filter((p) => {
      const outcome = db
        .select()
        .from(predictionOutcomes)
        .where(eq(predictionOutcomes.predictionId, p.id))
        .all()[0];
      return outcome && !outcome.directionCorrect;
    });

  const existingLessons = db.select().from(lessons).all();
  const lessonedIds = new Set(existingLessons.map((l) => l.predictionId).filter(Boolean));

  for (const pred of incorrect) {
    if (lessonedIds.has(pred.id)) continue;

    try {
      const outcome = db
        .select()
        .from(predictionOutcomes)
        .where(eq(predictionOutcomes.predictionId, pred.id))
        .all()[0];

      if (!outcome) continue;

      const prompt = `You are the Market Analyst reviewing a failed prediction.

## Failed Prediction
- Symbol: ${pred.symbol}
- Outlook: ${pred.outlook}
- Confidence: ${pred.confidence}/10
- Thesis: ${pred.thesis}
- Actual move: ${outcome.returnPct >= 0 ? "+" : ""}${outcome.returnPct.toFixed(1)}%
- Direction correct: ${outcome.directionCorrect}

## Task
Analyze why this prediction was wrong. Return a JSON object:
{
  "rootCause": "regime" | "timing" | "catalyst" | "confidence" | "signal" | "other",
  "evidence": "<specific evidence of what went wrong>",
  "ruleOfThumb": "<concise lesson for future predictions>"
}`;

      const { stdout } = await execFileAsync(
        "claude",
        [
          "-p", prompt,
          "--output-format", "json",
          "--max-turns", "1",
        ],
        {
          timeout: 60_000,
          maxBuffer: 1024 * 1024,
        }
      );

      const parsed = JSON.parse(stdout);
      const rawOutput: string = parsed.result ?? stdout;

      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);

        db.insert(lessons)
          .values({
            predictionId: pred.id,
            source: "live",
            symbol: pred.symbol,
            algoVersion: pred.algoVersion,
            outlook: pred.outlook,
            confidence: pred.confidence,
            returnPct: outcome.returnPct,
            directionCorrect: outcome.directionCorrect,
            rootCause: data.rootCause,
            evidence: data.evidence,
            ruleOfThumb: data.ruleOfThumb,
            createdAt: Date.now(),
          })
          .run();

        extracted++;
      }
    } catch (err: any) {
      errors.push(`Lesson extraction for ${pred.symbol}: ${err.message}`);
    }
  }

  return { extracted, errors };
}

/**
 * Get lessons for a symbol or all symbols.
 */
export function getLessons(symbol?: string, limit: number = 50) {
  if (symbol) {
    return db
      .select()
      .from(lessons)
      .where(eq(lessons.symbol, symbol.toUpperCase()))
      .all()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  return db
    .select()
    .from(lessons)
    .all()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Get lesson stats by root cause.
 */
export function getLessonStats(): Record<string, { count: number; avgReturn: number }> {
  const allLessons = db.select().from(lessons).all();
  const stats: Record<string, { count: number; totalReturn: number }> = {};

  for (const lesson of allLessons) {
    if (!stats[lesson.rootCause]) {
      stats[lesson.rootCause] = { count: 0, totalReturn: 0 };
    }
    stats[lesson.rootCause].count++;
    stats[lesson.rootCause].totalReturn += lesson.returnPct;
  }

  // Compute averages
  const result: Record<string, { count: number; avgReturn: number }> = {};
  for (const [key, data] of Object.entries(stats)) {
    result[key] = {
      count: data.count,
      avgReturn: data.totalReturn / data.count,
    };
  }

  return result;
}
