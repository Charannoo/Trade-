/**
 * /api/bot — Bot control and status.
 * 
 * GET  /api/bot          — get bot status + settings
 * POST /api/bot          — update settings
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getBotSettings,
  updateBotSettings,
  engageKillSwitch,
  disengageKillSwitch,
  isBotEnabled,
} from "@/lib/bot/config";

// GET /api/bot
export async function GET() {
  const settings = getBotSettings();
  return NextResponse.json({ settings, running: isBotEnabled() });
}

// POST /api/bot — update settings
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { killSwitch, ...updates } = body;

  if (killSwitch === true) {
    engageKillSwitch();
    return NextResponse.json({ killSwitch: true, message: "Kill switch engaged" });
  }

  if (killSwitch === false) {
    disengageKillSwitch();
    return NextResponse.json({ killSwitch: false, message: "Kill switch disengaged" });
  }

  if (Object.keys(updates).length > 0) {
    updateBotSettings(updates);
  }

  const settings = getBotSettings();
  return NextResponse.json({ settings });
}
