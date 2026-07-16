/**
 * /api/strategy/gauntlet/[version] — Run gauntlet on a strategy version.
 */
import { NextRequest, NextResponse } from "next/server";
import { runGauntlet, promoteStrategy, rejectStrategy } from "@/lib/self-improve/gauntlet";

// POST /api/strategy/gauntlet/[version] — run gauntlet
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ version: string }> }
) {
  const { version } = await params;
  const v = parseInt(version);
  if (isNaN(v)) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  try {
    const result = await runGauntlet(v);
    return NextResponse.json({ result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/strategy/gauntlet/[version] — promote or reject
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ version: string }> }
) {
  const { version } = await params;
  const v = parseInt(version);
  const body = await req.json();
  const { action } = body;

  if (action === "promote") {
    promoteStrategy(v);
    return NextResponse.json({ message: `Strategy v${v} promoted to active` });
  }

  if (action === "reject") {
    rejectStrategy(v);
    return NextResponse.json({ message: `Strategy v${v} rejected` });
  }

  return NextResponse.json({ error: "action must be 'promote' or 'reject'" }, { status: 400 });
}
