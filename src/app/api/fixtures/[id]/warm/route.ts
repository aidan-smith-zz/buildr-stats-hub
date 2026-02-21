import { NextResponse } from "next/server";
import { warmFixturePart } from "@/lib/statsService";

/** Chunked warm: 60s max (Vercel Hobby). Call ?part=home then ?part=away per fixture. */
export const maxDuration = 60;

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  { params }: RouteParams
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  const part = new URL(request.url).searchParams.get("part");

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid fixture id" }, { status: 400 });
  }
  const validParts = ["home", "away", "teamstats-home", "teamstats-away", "lineup"];
  if (!part || !validParts.includes(part)) {
    return NextResponse.json(
      { error: "Missing or invalid query: part=home|away|teamstats-home|teamstats-away|lineup" },
      { status: 400 }
    );
  }

  try {
    const result = await warmFixturePart(id, part as "home" | "away" | "teamstats-home" | "teamstats-away" | "lineup");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[warm]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
