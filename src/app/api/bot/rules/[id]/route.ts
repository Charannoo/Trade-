/**
 * /api/bot/rules/[id] — Update/toggle/delete a single rule.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { botRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateRule, toggleRule, deleteRule } from "@/lib/bot/rules";

// PATCH /api/bot/rules/[id] — update
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ruleId = parseInt(id);
  if (isNaN(ruleId)) {
    return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
  }

  const body = await req.json();
  const { condition, action } = body;

  if (!condition || !action) {
    return NextResponse.json(
      { error: "condition and action are required" },
      { status: 400 }
    );
  }

  updateRule(ruleId, condition, action);
  return NextResponse.json({ message: "Rule updated" });
}

// DELETE /api/bot/rules/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ruleId = parseInt(id);
  if (isNaN(ruleId)) {
    return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
  }

  deleteRule(ruleId);
  return NextResponse.json({ message: "Rule deleted" });
}
