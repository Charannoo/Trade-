/**
 * /api/backtest/stats — Backtest accuracy stats.
 * 
 * GET /api/backtest/stats?symbol=AAPL
 */
import { NextRequest, NextResponse } from "next/server";
import { getBacktestStats } from "@/lib/research/backtest";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");

  try {
    const stats = getBacktestStats(symbol ?? undefined);
    return NextResponse.json(stats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
