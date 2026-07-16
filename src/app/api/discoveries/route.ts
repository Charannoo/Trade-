/**
 * /api/discoveries — Discovery API.
 * 
 * GET  /api/discoveries          — list recent discoveries
 * POST /api/discoveries          — run discovery scout
 */
import { NextRequest, NextResponse } from "next/server";
import { runDiscoveryScout, getDiscoveries } from "@/lib/discovery/scout";

// GET /api/discoveries
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "20");

  try {
    const discoveries = getDiscoveries(limit);
    return NextResponse.json({ discoveries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/discoveries — run scout
export async function POST() {
  try {
    const result = await runDiscoveryScout();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
