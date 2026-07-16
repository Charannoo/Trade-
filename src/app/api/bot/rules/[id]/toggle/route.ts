/**
 * /api/bot/rules/[id]/toggle — Toggle a rule's enabled state.
 */
import { NextRequest, NextResponse } from "next/server";
import { toggleRule } from "@/lib/bot/rules";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ruleId = parseInt(id);
  if (isNaN(ruleId)) {
    return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
  }

  const enabled = toggleRule(ruleId);
  return NextResponse.json({ enabled, message: `Rule ${enabled ? "enabled" : "disabled"}` });
}
