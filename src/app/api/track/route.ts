/**
 * API: CRUD for holdings and watchlist.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { holdings, watchlist } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const h = db.select().from(holdings).all();
  const w = db.select().from(watchlist).all();
  return NextResponse.json({ holdings: h, watchlist: w });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { type, symbol, shares, costBasis, notes } = body;

  if (type === "holding") {
    const now = Date.now();
    const result = db
      .insert(holdings)
      .values({
        symbol: String(symbol).toUpperCase(),
        shares: Number(shares),
        costBasis: Number(costBasis),
        notes: notes || null,
        acquiredAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return NextResponse.json({ id: result.lastInsertRowid });
  }

  if (type === "watchlist") {
    db.insert(watchlist)
      .values({
        symbol: String(symbol).toUpperCase(),
        addedAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const symbol = searchParams.get("symbol");

  if (!type || !symbol) {
    return NextResponse.json({ error: "Missing type or symbol" }, { status: 400 });
  }

  if (type === "holding") {
    const id = searchParams.get("id");
    if (id) {
      db.delete(holdings).where(eq(holdings.id, Number(id))).run();
    }
  }

  if (type === "watchlist") {
    db.delete(watchlist).where(eq(watchlist.symbol, symbol.toUpperCase())).run();
  }

  return NextResponse.json({ ok: true });
}
