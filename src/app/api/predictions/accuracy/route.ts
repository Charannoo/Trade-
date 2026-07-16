/**
 * /api/predictions/accuracy — Strategy accuracy stats.
 * 
 * GET /api/predictions/accuracy?strategyVersion=2
 * GET /api/predictions/accuracy — returns all strategy versions
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { strategyVersions } from "@/lib/db/schema";
import { getStrategyStats, computeEffectiveConfidence } from "@/lib/research/grading";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const version = searchParams.get("strategyVersion");

  if (version) {
    const v = parseInt(version);
    const stats = getStrategyStats(v);
    const calibration = computeEffectiveConfidence(v);
    return NextResponse.json({ strategyVersion: v, stats, calibration });
  }

  // Return stats for all strategy versions
  const versions = db.select().from(strategyVersions).all();
  const stats = versions.map((v) => ({
    version: v.version,
    status: v.status,
    changeSummary: v.changeSummary,
    stats: getStrategyStats(v.version),
    calibration: computeEffectiveConfidence(v.version),
  }));

  return NextResponse.json({ strategies: stats });
}
