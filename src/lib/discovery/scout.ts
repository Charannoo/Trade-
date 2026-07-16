/**
 * discovery/scout.ts — Dark-horse discovery engine.
 * Uses actual DB schema columns.
 */
import { db } from "@/lib/db";
import { discoveries } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface Discovery {
  id: number;
  scanId: number;
  symbol: string;
  companyName: string;
  angle: string;
  theme: string;
  thesis: string;
  whyOverlooked: string;
  catalysts: string[];
  risks: string[];
  sources: { title: string; url: string }[];
  confidence: number;
  horizonDays: number;
  status: string;
}

/**
 * Run the discovery scout.
 */
export async function runDiscoveryScout(): Promise<{
  discoveries: Discovery[];
  errors: string[];
}> {
  const errors: string[] = [];
  const results: Discovery[] = [];
  const scanId = Date.now();

  const prompt = `You are the Discovery Scout for TradeS. Find under-the-radar stocks that could be dark horses.

## Search Criteria
Look for:
1. Unusual insider buying (cluster buying)
2. Small-cap breakouts with volume surge
3. Unusual options activity
4. Sector rotation early signs
5. Earnings surprise patterns
6. Patent approvals or regulatory catalysts

## Process
Use WebSearch to find: "unusual insider buying this week", "small cap breakouts today", "unusual options activity"
For each candidate, research the catalyst and score it.

## Output Format
Return a JSON array:
[
  {
    "symbol": "TICKER",
    "companyName": "Company Name",
    "angle": "second-order" | "primary-source" | "commodity-chain" | "dislocation",
    "theme": "<short theme description>",
    "thesis": "<50+ char thesis>",
    "whyOverlooked": "<why the market is missing this>",
    "catalysts": ["<catalyst1>", ...],
    "risks": ["<risk1>", ...],
    "sources": [{"title": "<title>", "url": "https://..."}],
    "confidence": <1-10>,
    "horizonDays": <30-180>
  }
]

Return 3-5 discoveries. Empty array if nothing interesting.`;

  try {
    const { stdout } = await execFileAsync(
      "claude",
      [
        "-p", prompt,
        "--output-format", "json",
        "--permission-mode", "plan",
        "--max-turns", "5",
      ],
      {
        timeout: 180_000,
        maxBuffer: 1024 * 1024,
      }
    );

    const parsed = JSON.parse(stdout);
    const rawOutput: string = parsed.result ?? stdout;

    const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { discoveries: [], errors: ["No discoveries found"] };
    }

    const items = JSON.parse(jsonMatch[0]);
    const now = Date.now();

    for (const item of items) {
      const inserted = db.insert(discoveries)
        .values({
          scanId,
          symbol: item.symbol,
          companyName: item.companyName,
          angle: item.angle,
          theme: item.theme,
          thesis: item.thesis,
          whyOverlooked: item.whyOverlooked,
          catalysts: item.catalysts,
          risks: item.risks,
          sources: item.sources,
          confidence: item.confidence,
          horizonDays: item.horizonDays,
          status: "pending",
          createdAt: now,
        })
        .run();

      results.push({
        id: Number(inserted.lastInsertRowid),
        scanId,
        symbol: item.symbol,
        companyName: item.companyName,
        angle: item.angle,
        theme: item.theme,
        thesis: item.thesis,
        whyOverlooked: item.whyOverlooked,
        catalysts: item.catalysts,
        risks: item.risks,
        sources: item.sources,
        confidence: item.confidence,
        horizonDays: item.horizonDays,
        status: "pending",
      });
    }
  } catch (err: any) {
    errors.push(`Discovery scout: ${err.message}`);
  }

  return { discoveries: results, errors };
}

/**
 * Get recent discoveries.
 */
export function getDiscoveries(limit: number = 20) {
  return db
    .select()
    .from(discoveries)
    .orderBy(desc(discoveries.createdAt))
    .limit(limit)
    .all();
}
