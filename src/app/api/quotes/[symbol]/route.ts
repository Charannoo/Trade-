/**
 * API: GET /api/quotes/[symbol] — Get latest quote for a symbol.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { latestPrices } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  const row = db
    .select()
    .from(latestPrices)
    .where(eq(latestPrices.symbol, upperSymbol))
    .get();

  if (!row) {
    return NextResponse.json(
      { error: "No price data for this symbol" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    symbol: row.symbol,
    price: row.price,
    prevClose: row.prevClose,
    dayOpen: row.dayOpen,
    source: row.source,
    delayed: row.delayed,
    currency: row.currency,
    ts: row.ts,
  });
}
