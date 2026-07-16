/**
 * API: GET /api/signals/[symbol] — Get latest quant signals for a symbol.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quantSignals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  // Get most recent signal for this symbol
  const row = db
    .select()
    .from(quantSignals)
    .where(eq(quantSignals.symbol, upperSymbol))
    .all()
    .sort((a, b) => b.computedAt - a.computedAt)[0];

  if (!row) {
    return NextResponse.json({ indicators: null, patterns: [] });
  }

  return NextResponse.json(row.payload);
}
