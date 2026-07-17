import { NextRequest, NextResponse } from "next/server";
import { parseGoal, createPlan, applyPlan, type BotPlan } from "@/lib/command/interpreter";
import { getBotSettings } from "@/lib/bot/config";
import { getAccount } from "@/lib/delta/rest";

export async function POST(req: NextRequest) {
  try {
    const { command, dryRun } = await req.json();
    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "Send { command: '...' }" }, { status: 400 });
    }

    const goal = parseGoal(command);
    const plan = await createPlan(goal);

    let result: { applied: boolean; message: string } | null = null;
    if (!dryRun) {
      result = await applyPlan(plan);
    }

    return NextResponse.json({
      parsed: goal,
      plan,
      applied: result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    let balance = 0;
    try {
      const acct = await getAccount();
      balance = parseFloat(acct.cash);
    } catch {}
    const settings = getBotSettings();
    return NextResponse.json({ balance, settings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
