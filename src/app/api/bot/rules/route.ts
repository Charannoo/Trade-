/**
 * /api/bot/rules — CRUD for bot rules.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { botRules } from "@/lib/db/schema";
import {
  createRule,
  toggleRule,
  deleteRule,
} from "@/lib/bot/rules";

// GET /api/bot/rules
export async function GET() {
  const rules = db.select().from(botRules).all();
  return NextResponse.json({ rules });
}

// POST /api/bot/rules — create
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, condition, action } = body;

  if (!name || !condition || !action) {
    return NextResponse.json(
      { error: "name, condition, and action are required" },
      { status: 400 }
    );
  }

  const id = createRule(name, condition, action);
  return NextResponse.json({ id, message: "Rule created" });
}
