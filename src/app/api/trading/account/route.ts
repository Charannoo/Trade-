/**
 * /api/trading/account — Account info + positions.
 * 
 * GET /api/trading/account — returns account info + current positions
 */
import { NextResponse } from "next/server";
import { getAccountInfo, getPositionsInfo } from "@/lib/paper/service";

export async function GET() {
  try {
    const [account, positions] = await Promise.all([
      getAccountInfo(),
      getPositionsInfo(),
    ]);

    return NextResponse.json({ account, positions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
