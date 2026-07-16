/**
 * research/challenge.ts — Challenge chat for predictions.
 * 
 * Allows the user to challenge a prediction via natural language.
 * The AI responds with a revised prediction or explains why it stands.
 */
import { db } from "@/lib/db";
import { predictions, chatMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import { extractJson, validatePrediction } from "./schema";
import { getActiveStrategy, renderFullStrategy } from "./strategy";

const execFileAsync = promisify(execFile);

export interface ChallengeResponse {
  reply: string;
  revisedPrediction?: {
    outlook: string;
    confidence: number;
    thesis: string;
  };
  predictionRevised: boolean;
}

/**
 * Process a challenge to a prediction.
 */
export async function processChallenge(
  predictionId: number,
  userMessage: string
): Promise<ChallengeResponse> {
  const pred = db
    .select()
    .from(predictions)
    .where(eq(predictions.id, predictionId))
    .all()[0];

  if (!pred) {
    return { reply: "Prediction not found.", predictionRevised: false };
  }

  const strategy = getActiveStrategy();

  // Build context for the challenge
  const prompt = `You are the Market Analyst for TradeS. A user is challenging your prediction.

## Your Prediction
- Symbol: ${pred.symbol}
- Outlook: ${pred.outlook}
- Confidence: ${pred.confidence}/10
- Horizon: ${pred.horizonDays} days
- Thesis: ${pred.thesis}
- Risks: ${JSON.stringify(pred.risks)}
- Catalysts: ${JSON.stringify(pred.catalysts)}
- Generated: ${new Date(pred.createdAt).toISOString()}
- Strategy: v${pred.algoVersion ?? "unknown"}

${strategy ? renderFullStrategy(strategy) : ""}

## User Challenge
"${userMessage}"

## Your Task

1. Consider the user's challenge seriously.
2. Search the web for any new information that might support or undermine your prediction.
3. If the challenge is valid, explain why and provide a revised prediction as JSON.
4. If the challenge is not valid, explain why your original prediction stands.

## Output Format

First, write a plain-English response explaining your reasoning.

Then, if you are revising the prediction, include a JSON block:

\`\`\`json
{
  "revised": true,
  "outlook": "bullish" | "neutral" | "bearish",
  "confidence": <1-10>,
  "thesis": "<revised thesis>"
}
\`\`\`

If you are NOT revising, include:

\`\`\`json
{ "revised": false }
\`\`\``;

  try {
    const { stdout } = await execFileAsync(
      "claude",
      [
        "-p", prompt,
        "--output-format", "json",
        "--permission-mode", "plan",
        "--max-turns", "3",
      ],
      {
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      }
    );

    const parsed = JSON.parse(stdout);
    const rawOutput: string = parsed.result ?? stdout;

    // Extract the JSON block from the response
    const json = extractJson(rawOutput);
    const reply = rawOutput.replace(/```json\s*[\s\S]*?\n```/, "").trim();

    if (json && json.revised === true) {
      // Save the challenge and revision
      db.insert(chatMessages)
        .values({
          predictionId,
          role: "user",
          content: userMessage,
          createdAt: Date.now(),
        })
        .run();

      db.insert(chatMessages)
        .values({
          predictionId,
          role: "assistant",
          content: reply,
          createdAt: Date.now(),
        })
        .run();

      return {
        reply,
        revisedPrediction: {
          outlook: json.outlook,
          confidence: json.confidence,
          thesis: json.thesis,
        },
        predictionRevised: true,
      };
    }

    // No revision — just save the exchange
    db.insert(chatMessages)
      .values({
        predictionId,
        role: "user",
        content: userMessage,
        createdAt: Date.now(),
      })
      .run();

    db.insert(chatMessages)
      .values({
        predictionId,
        role: "assistant",
        content: reply,
        createdAt: Date.now(),
      })
      .run();

    return { reply, predictionRevised: false };
  } catch (err: any) {
    return {
      reply: `Error processing challenge: ${err.message}`,
      predictionRevised: false,
    };
  }
}

/**
 * Get chat history for a prediction.
 */
export function getChatHistory(predictionId: number) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.predictionId, predictionId))
    .all()
    .sort((a, b) => a.createdAt - b.createdAt);
}
