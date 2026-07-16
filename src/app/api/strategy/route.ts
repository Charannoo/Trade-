/**
 * /api/strategy — Strategy management API.
 * 
 * GET  /api/strategy              — list all strategy versions
 * POST /api/strategy/propose      — AI proposes a new version
 * POST /api/strategy/apply        — apply a proposal
 * POST /api/strategy/promote/:v   — promote testing to active
 * POST /api/strategy/reject/:v    — reject a testing version
 * POST /api/strategy/gauntlet/:v  — run gauntlet on a version
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { strategyVersions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  proposeStrategyVersion,
  applyStrategyProposal,
} from "@/lib/self-improve/strategist";
import { runGauntlet, promoteStrategy, rejectStrategy } from "@/lib/self-improve/gauntlet";
import { getStrategyStats } from "@/lib/research/grading";

// GET /api/strategy
export async function GET() {
  const versions = db.select().from(strategyVersions).all();
  const enriched = versions.map((v) => ({
    ...v,
    stats: getStrategyStats(v.version),
  }));
  return NextResponse.json({ strategies: enriched });
}
