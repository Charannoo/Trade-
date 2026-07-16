/**
 * /api/backtest — Backtest API.
 * 
 * POST /api/backtest        — run a backtest
 * GET  /api/backtest        — list backtest results
 * GET  /api/backtest/stats  — get backtest stats
 */
import { NextRequest, NextResponse } from "next/server";
import { runBacktest, runBacktestBatch, getBacktests, getBacktestStats } from "@/lib/research/backtest";

// GET /api/backtest
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  try {
    const results = getBacktests(symbol ?? undefined, limit);
    return NextResponse.json({ backtests: results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/backtest — run backtest
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, horizonDays, sampleCount, asOf } = body;

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    if (asOf) {
      // Single backtest
      const result = await runBacktest(symbol, asOf, horizonDays ?? 60);
      return NextResponse.json({ result });
    }

    // Batch backtest
    const results = await runBacktestBatch(symbol, horizonDays ?? 60, sampleCount ?? 12);
    const stats = getBacktestStats(symbol);
    return NextResponse.json({ results, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
