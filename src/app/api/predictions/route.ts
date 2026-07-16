/**
 * /api/predictions — CRUD for predictions.
 * 
 * GET  /api/predictions           — list all (with filters)
 * POST /api/predictions           — trigger research on a symbol
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { predictions, predictionOutcomes } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { runResearchSingle } from "@/lib/research/runner";

// GET /api/predictions
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const outlook = searchParams.get("outlook");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  let query = db.select().from(predictions);

  const conditions = [];
  if (symbol) conditions.push(eq(predictions.symbol, symbol.toUpperCase()));
  if (outlook) conditions.push(eq(predictions.outlook, outlook));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const rows = query
    .orderBy(desc(predictions.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  // Attach outcomes
  const outcomeRows = db.select().from(predictionOutcomes).all();
  const outcomeMap = new Map(outcomeRows.map((o) => [o.predictionId, o]));

  const enriched = rows.map((r) => ({
    ...r,
    outcome: outcomeMap.get(r.id) ?? null,
  }));

  return NextResponse.json({ predictions: enriched, count: enriched.length });
}

// POST /api/predictions — trigger research
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, horizonDays, quantOnly } = body;

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const result = await runResearchSingle(symbol, { horizonDays, quantOnly });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    predictionId: result.predictionId,
    outlook: result.outlook,
    confidence: result.confidence,
  });
}
