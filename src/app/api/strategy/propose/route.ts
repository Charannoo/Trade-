/**
 * /api/strategy/propose — AI proposes a new strategy version.
 */
import { NextResponse } from "next/server";
import { proposeStrategyVersion } from "@/lib/self-improve/strategist";

export async function POST() {
  try {
    const proposal = await proposeStrategyVersion();
    if (!proposal) {
      return NextResponse.json(
        { error: "Not enough data to propose a new version" },
        { status: 400 }
      );
    }
    return NextResponse.json({ proposal });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
