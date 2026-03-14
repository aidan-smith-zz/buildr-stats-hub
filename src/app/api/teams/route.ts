import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPoolRetry } from "@/lib/poolRetry";

export async function GET() {
  try {
    const teams = await withPoolRetry(() =>
      prisma.team.findMany({
        orderBy: { createdAt: "desc" },
      }),
    );

    return NextResponse.json({ teams });
  } catch (error) {
    console.error("[API /teams] Error fetching teams", error);

    return NextResponse.json(
      {
        error:
          "Unable to fetch teams. Make sure your DATABASE_URL is set and migrations have been applied.",
      },
      { status: 500 },
    );
  }
}

