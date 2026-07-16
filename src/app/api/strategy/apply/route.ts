/**
 * /api/strategy/apply — Apply a strategy proposal.
 */
import { NextRequest, NextResponse } from "next/server";
import { applyStrategyProposal } from "@/lib/self-improve/strategist";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { proposal } = body;

  if (!proposal) {
    return NextResponse.json({ error: "proposal required" }, { status: 400 });
  }

  try {
    applyStrategyProposal(proposal);
    return NextResponse.json({ message: "Strategy proposal applied" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
