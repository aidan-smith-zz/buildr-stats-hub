import { NextResponse } from "next/server";
import { getUpcomingFixturesFromDb } from "@/lib/fixturesService";

export const dynamic = "force-dynamic";

/** GET /api/upcoming-fixtures — returns next 14 days of fixtures from DB (populated by warm-today). */
export async function GET() {
  try {
    const byDate = await getUpcomingFixturesFromDb();
    return NextResponse.json({ ok: true, byDate });
  } catch (err) {
    console.error("[upcoming-fixtures]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
