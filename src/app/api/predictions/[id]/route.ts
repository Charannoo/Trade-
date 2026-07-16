/**
 * /api/predictions/[id] — Get single prediction with outcome.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { predictions, predictionOutcomes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const predictionId = parseInt(id);

  if (isNaN(predictionId)) {
    return NextResponse.json({ error: "Invalid prediction ID" }, { status: 400 });
  }

  const pred = db
    .select()
    .from(predictions)
    .where(eq(predictions.id, predictionId))
    .all()[0];

  if (!pred) {
    return NextResponse.json({ error: "Prediction not found" }, { status: 404 });
  }

  const outcome = db
    .select()
    .from(predictionOutcomes)
    .where(eq(predictionOutcomes.predictionId, predictionId))
    .all()[0];

  return NextResponse.json({ prediction: pred, outcome: outcome ?? null });
}
