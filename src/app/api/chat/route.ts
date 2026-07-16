/**
 * /api/chat — Challenge chat API.
 * 
 * POST /api/chat — send a challenge message
 * GET  /api/chat?predictionId=123 — get chat history
 */
import { NextRequest, NextResponse } from "next/server";
import { processChallenge, getChatHistory } from "@/lib/research/challenge";

// GET /api/chat — get history
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const predictionId = parseInt(searchParams.get("predictionId") ?? "0");

  if (!predictionId) {
    return NextResponse.json({ error: "predictionId required" }, { status: 400 });
  }

  try {
    const history = getChatHistory(predictionId);
    return NextResponse.json({ history });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/chat — send challenge
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { predictionId, message } = body;

  if (!predictionId || !message) {
    return NextResponse.json(
      { error: "predictionId and message required" },
      { status: 400 }
    );
  }

  try {
    const response = await processChallenge(predictionId, message);
    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
