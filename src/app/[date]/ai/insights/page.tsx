import Link from "next/link";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import { generateInsights } from "@/lib/insightsService";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** statusShort values that mean the match is finished (we only show these to avoid wrong "live" minutes). */
const FINISHED_STATUS = new Set(["FT", "AET", "PEN", "ABD", "AWD", "WO", "CAN"]);

/** Validate and normalize date param to YYYY-MM-DD (defaults to today Europe/London). */
function normalizeDateKey(param: string | undefined): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const d = new Date(param + "T12:00:00.000Z");
    if (!Number.isNaN(d.getTime())) return param;
  }
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export default async function AIInsightsPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date: dateParam } = await params;
  const dateKey = normalizeDateKey(dateParam);

  const [insights, liveScores] = await Promise.all([
    generateInsights(dateKey),
    loadLiveScoresForDate(dateKey),
  ]);

  const displayDate = new Date(dateKey + "T12:00:00.000Z").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <main className="mx-auto max-w-2xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              ← Back to fixtures
            </Link>
            <ShareUrlButton className="rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            AI Insights
          </h1>
          <p className="mt-1 text-slate-400">{displayDate}</p>
          <span className="mt-2 inline-flex items-center rounded-full bg-violet-500/20 px-3 py-1 text-xs font-medium text-violet-300 ring-1 ring-violet-500/30">
            <span>Powered by AI - as of <b>now</b></span>
          </span>
        </div>

        {liveScores.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-slate-500">
              Some of today's full-time results:
            </h2>
            <ul className="space-y-2">
              {liveScores.map((s) => (
                <li
                  key={s.fixtureId}
                  className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-emerald-200">
                    {s.homeTeam} {s.homeGoals}–{s.awayGoals} {s.awayTeam}
                  </span>
                  <span className="text-slate-500">{s.statusShort}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {insights.length === 0 ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-6 py-10 text-center">
            <p className="text-slate-400">
              No insights yet for this date. Stats are generated from fixtures and team/player data
              in the database — warm a few fixtures first to see insights here.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm font-medium text-violet-400 hover:text-violet-300"
            >
              View today&apos;s fixtures →
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {insights.map((insight, i) => (
              <li
                key={`${insight.type}-${i}`}
                className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-4 shadow-lg transition hover:border-slate-600/50 hover:bg-slate-800/50"
              >
                <p className="text-slate-100 leading-relaxed">{insight.text}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {insight.type === "team_last5"
                      ? "Last 5"
                      : insight.type === "team_season"
                        ? "Season"
                        : "Player · Season"}
                  </span>
                  {insight.href && (
                    <Link
                      href={insight.href}
                      className="text-xs font-medium text-violet-400 hover:text-violet-300"
                    >
                      View fixture →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

async function loadLiveScoresForDate(
  dateKey: string
): Promise<{ fixtureId: number; homeTeam: string; awayTeam: string; homeGoals: number; awayGoals: number; statusShort: string }[]> {
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayEnd = new Date(nextDay.getTime() + 60 * 60 * 1000);

  const fixturesWithLive = await prisma.fixture.findMany({
    where: {
      date: { gte: dayStart, lte: dayEnd },
      liveScoreCache: { isNot: null },
    },
    include: { homeTeam: true, awayTeam: true, liveScoreCache: true },
  });

  return fixturesWithLive
    .filter((f) => f.liveScoreCache != null && FINISHED_STATUS.has(f.liveScoreCache!.statusShort))
    .map((f) => ({
      fixtureId: f.id,
      homeTeam: f.homeTeam.shortName ?? f.homeTeam.name,
      awayTeam: f.awayTeam.shortName ?? f.awayTeam.name,
      homeGoals: f.liveScoreCache!.homeGoals,
      awayGoals: f.liveScoreCache!.awayGoals,
      statusShort: f.liveScoreCache!.statusShort,
    }));
}
