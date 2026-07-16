/**
 * self-improve/strategist.ts — Strategy version management.
 * 
 * The AI Strategist proposes new strategy versions based on lessons,
 * backtest results, and accuracy data. The user approves/rejects.
 */
import { db } from "@/lib/db";
import { strategyVersions, ruleSuggestions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import { getStrategyStats, computeEffectiveConfidence } from "@/lib/research/grading";
import { getLessonStats } from "./lessons";

const execFileAsync = promisify(execFile);

export interface StrategyProposal {
  version: number;
  changeSummary: string;
  rationale: string;
  fullTextDiff: string;
  quantTextDiff: string;
  expectedImprovement: string;
}

/**
 * Propose a new strategy version based on performance data.
 */
export async function proposeStrategyVersion(): Promise<StrategyProposal | null> {
  const active = db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.status, "active"))
    .all()[0];

  if (!active) return null;

  const stats = getStrategyStats(active.version);
  const calibration = computeEffectiveConfidence(active.version);
  const lessonStats = getLessonStats();

  // Only propose if we have enough data
  if (stats.graded < 10) return null;

  const prompt = `You are the AI Strategist for TradeS. Analyze performance and propose improvements.

## Current Strategy (v${active.version})
${active.fullText}

## Performance Stats
- Total predictions: ${stats.total}
- Graded: ${stats.graded}
- Accuracy: ${(stats.accuracy * 100).toFixed(1)}%
- Average confidence: ${stats.avgConfidence.toFixed(1)}
- Calibration error: ${calibration.calibrationError.toFixed(3)}

## Lesson Categories
${JSON.stringify(lessonStats, null, 2)}

## Task
Based on this data, propose a strategy improvement. Consider:
1. Are there systematic patterns in the failures?
2. Is the confidence rubric well-calibrated?
3. Are there regime-specific adjustments needed?
4. Should the timing or horizon discipline change?

Return a JSON object:
{
  "changeSummary": "<one-line summary of the change>",
  "rationale": "<why this change should improve accuracy>",
  "fullTextDiff": "<the new full strategy text, or 'NO_CHANGE' if only quant changes>",
  "quantTextDiff": "<the new quant-only strategy text, or 'NO_CHANGE'>",
  "expectedImprovement": "<what improvement you expect and why>"
}`;

  try {
    const { stdout } = await execFileAsync(
      "claude",
      [
        "-p", prompt,
        "--output-format", "json",
        "--permission-mode", "plan",
        "--max-turns", "2",
      ],
      {
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      }
    );

    const parsed = JSON.parse(stdout);
    const rawOutput: string = parsed.result ?? stdout;

    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const proposal = JSON.parse(jsonMatch[0]);
    const newVersion = active.version + 1;

    return {
      version: newVersion,
      changeSummary: proposal.changeSummary,
      rationale: proposal.rationale,
      fullTextDiff: proposal.fullTextDiff,
      quantTextDiff: proposal.quantTextDiff,
      expectedImprovement: proposal.expectedImprovement,
    };
  } catch (err: any) {
    console.error("[strategist] Proposal failed:", err.message);
    return null;
  }
}

/**
 * Apply an approved strategy proposal.
 */
export function applyStrategyProposal(proposal: StrategyProposal): void {
  const active = db
    .select()
    .from(strategyVersions)
    .where(eq(strategyVersions.status, "active"))
    .all()[0];

  if (!active) return;

  const now = Date.now();
  const fullText = proposal.fullTextDiff !== "NO_CHANGE"
    ? proposal.fullTextDiff
    : active.fullText;
  const quantText = proposal.quantTextDiff !== "NO_CHANGE"
    ? proposal.quantTextDiff
    : active.quantText;

  // Demote active to testing
  db.update(strategyVersions)
    .set({ status: "testing" })
    .where(eq(strategyVersions.version, active.version))
    .run();

  // Insert new version as testing
  db.insert(strategyVersions)
    .values({
      version: proposal.version,
      parentVersion: active.version,
      fullText,
      quantText,
      changeSummary: proposal.changeSummary,
      rationale: proposal.rationale,
      tier: "both",
      status: "testing",
      scorecard: null,
      createdBy: "strategist",
      createdAt: now,
    })
    .run();
}

/**
 * Get rule suggestions from the AI.
 */
export async function generateRuleSuggestions(): Promise<{
  suggestions: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let suggestions = 0;

  try {
    const prompt = `You are the AI Strategist for TradeS. Suggest a new trading rule.

Current bot rules focus on prediction-based entries. Suggest a rule that would improve risk management or entry timing.

Return a JSON object:
{
  "name": "<rule name>",
  "condition": { "type": "<signal|price|indicator|prediction|portfolio>", ... },
  "action": { "type": "<buy|sell|buy_bracket|skip>", ... },
  "summary": "<why this rule would help>",
  "evidence": ["<evidence1>", "<evidence2>"]
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

      db.insert(ruleSuggestions)
        .values({
          suggestedCondition: data.condition,
          suggestedAction: data.action,
          summary: data.summary,
          evidence: data.evidence,
          status: "pending",
          createdAt: Date.now(),
        })
        .run();

      suggestions++;
    }
  } catch (err: any) {
    errors.push(`Rule suggestion: ${err.message}`);
  }

  return { suggestions, errors };
}

/**
 * Get pending rule suggestions.
 */
export function getPendingSuggestions() {
  return db
    .select()
    .from(ruleSuggestions)
    .where(eq(ruleSuggestions.status, "pending"))
    .all()
    .sort((a, b) => b.createdAt - a.createdAt);
}
