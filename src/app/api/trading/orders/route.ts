/**
 * /api/trading/orders — Order history.
 * 
 * GET /api/trading/orders?limit=50&source=bot
 */
import { NextRequest, NextResponse } from "next/server";
import { getOrdersLog } from "@/lib/paper/service";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const source = searchParams.get("source") ?? undefined;

  try {
    const orders = getOrdersLog({ limit, source });
    return NextResponse.json({ orders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
