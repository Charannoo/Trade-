/**
 * research/schema.ts — Zod schemas for prediction output contract.
 * The analyst outputs ONLY English (base language).
 * Other languages come from the translations cache (display-only).
 */
import { z } from "zod";

export const PredictionSchema = z.object({
  outlook: z.enum(["bullish", "neutral", "bearish"]),
  confidence: z.number().int().min(0).max(10),
  horizonDays: z.number().int().min(1).max(365),
  thesis: z.string().min(50),
  risks: z.array(z.string()).min(1).max(8),
  catalysts: z.array(z.string()).max(8),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
    })
  ).max(15),
});

export type Prediction = z.infer<typeof PredictionSchema>;

/**
 * Extract JSON from LLM response (may be wrapped in ``` fences).
 */
export function extractJson(text: string): Record<string, any> | null {
  // Try to find a JSON block in fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Fall through
    }
  }

  // Try to find the outermost { ... }
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      return JSON.parse(text.slice(braceStart, braceEnd + 1));
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * Validate a prediction object against the schema.
 * Returns { success, data, error }.
 */
export function validatePrediction(raw: Record<string, any>): {
  success: boolean;
  data?: Prediction;
  error?: string;
} {
  const result = PredictionSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}
