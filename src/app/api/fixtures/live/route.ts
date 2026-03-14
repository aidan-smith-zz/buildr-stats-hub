import { NextResponse } from "next/server";
import { getLiveScoresForToday } from "@/lib/liveScoresService";

/**
 * GET /api/fixtures/live
 *
 * Returns live scores for today's in-window fixtures (one external API call, cache updated).
 * The live dashboard calls getLiveScoresForToday() directly; this route is for API consumers.
 */
export async function GET() {
  const { scores, error } = await getLiveScoresForToday();
  return NextResponse.json(
    { scores, ...(error && { error }) },
    {
      status: 200,
      headers: { "Cache-Control": "public, max-age=90" },
    },
  );
}
