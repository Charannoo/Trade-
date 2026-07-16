/**
 * API: GET /api/bars/[symbol] — Get cached daily bars for charting.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { barsCache } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  const rows = db
    .select()
    .from(barsCache)
    .where(eq(barsCache.symbol, upperSymbol))
    .all()
    .filter((r) => r.timeframe === "1Day")
    .sort((a, b) => a.ts - b.ts);

  return NextResponse.json({
    symbol: upperSymbol,
    timeframe: "1Day",
    bars: rows.map((r) => ({
      time: r.ts,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    })),
  });
}
