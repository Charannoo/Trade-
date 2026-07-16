/**
 * /api/trading/equity — Equity curve data.
 * 
 * GET /api/trading/equity?limit=100
 */
import { NextRequest, NextResponse } from "next/server";
import { getEquityCurve } from "@/lib/paper/service";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "100");

  try {
    const curve = getEquityCurve(limit);
    return NextResponse.json({ curve });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
