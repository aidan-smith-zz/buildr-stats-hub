import type { Metadata } from "next";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import { RefreshInsightsButton } from "@/app/_components/refresh-insights-button";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { generateInsights } from "@/lib/insightsService";
import { decodeHtmlEntities } from "@/lib/text";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

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

function formatDisplayDate(dateKey: string): string {
  return new Date(dateKey + "T12:00:00.000Z").toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date: dateParam } = await params;
  const dateKey = normalizeDateKey(dateParam);
  const displayDate = formatDisplayDate(dateKey);
  const title = `AI football insights & bet builder stats for ${displayDate}`;
  const description = `AI-powered football insights and bet builder stats for ${displayDate}: xG, corners, cards, shots per 90 and over 1.5 / over 2.5 / BTTS trends across today's fixtures.`;
  const canonical = `${BASE_URL}/fixtures/${dateKey}/ai-insights`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "statsBuildr",
      type: "website",
      images: [
        {
          url: `${BASE_URL}/stats-buildr.png`,
          width: 512,
          height: 160,
          alt: `AI football insights and bet builder stats for ${displayDate} on statsBuildr`,
        },
      ],
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/stats-buildr.png`],
    },
  };
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

  const fixturesHref = `/fixtures/${dateKey}`;
  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: fixturesHref, label: displayDate },
    { href: `/fixtures/${dateKey}/ai-insights`, label: "AI insights" },
  ];

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: `${BASE_URL}${item.href === "/" ? "" : item.href}`,
    })),
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="mx-auto max-w-2xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12">
        <Breadcrumbs items={breadcrumbItems} className="mb-3" />
        <div className="mb-8">
          <div className="flex items-center justify-end">
            <ShareUrlButton className="rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" />
          </div>
          <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-900/80 px-4 py-3 shadow-sm backdrop-blur-sm sm:px-5 sm:py-4">
            <div className="flex items-center gap-3">
              <img
                src="/stats-buildr-mini.png"
                alt="statsBuildr"
                className="h-9 w-9 rounded-2xl border border-slate-600 bg-slate-950 p-1 shadow-md sm:h-10 sm:w-10"
              />
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                  AI insights
                </span>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
                  AI football insights &amp; bet builder stats
                </h1>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 sm:text-[13px]">
                  statsBuildr · AI insights for {displayDate}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 sm:text-sm">
              We scan today&apos;s fixtures, xG, corners, cards, shots and player stats to surface AI-powered angles and bet builder ideas before kick-off.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-500 via-emerald-400 to-violet-600 px-3 py-1 text-xs font-medium text-white shadow-sm">
              Powered by AI – as of <b className="ml-1">now</b>
            </span>
            <RefreshInsightsButton className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/60 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-900 hover:border-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed" />
          </div>
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
            <NavLinkWithOverlay
              href={fixturesHref}
              className="mt-4 inline-block text-sm font-medium text-violet-400 hover:text-violet-300"
            >
              View today&apos;s fixtures →
            </NavLinkWithOverlay>
          </div>
        ) : (
          <>
            <ul className="space-y-4">
              {insights.map((insight, i) => (
                <li
                  key={`${insight.type}-${i}`}
                  className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-4 shadow-lg transition hover:border-slate-600/50 hover:bg-slate-800/50"
                >
                  <p className="text-slate-100 leading-relaxed">
                    {decodeHtmlEntities(insight.text)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-xs text-slate-500">
                      {insight.type === "team_last5"
                        ? "Last 5"
                        : insight.type === "team_last10"
                          ? "Last 10"
                          : insight.type === "team_season"
                            ? "Season"
                            : "Player · Season"}
                    </span>
                    {insight.href && (
                      <NavLinkWithOverlay
                        href={insight.href}
                        className="text-xs font-medium text-violet-400 hover:text-violet-300"
                      >
                        View fixture →
                      </NavLinkWithOverlay>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <section className="mt-8 text-xs text-slate-400 sm:text-sm">
              <p>
                For more detailed numbers on {displayDate}, see{" "}
                <NavLinkWithOverlay
                  href={fixturesHref}
                  className="font-medium text-violet-300 hover:text-violet-200"
                >
                  today&apos;s fixtures
                </NavLinkWithOverlay>
                ,{" "}
                <NavLinkWithOverlay
                  href={`/fixtures/${dateKey}/form`}
                  className="font-medium text-violet-300 hover:text-violet-200"
                >
                  today&apos;s form table
                </NavLinkWithOverlay>{" "}
                and{" "}
                <NavLinkWithOverlay
                  href={`/fixtures/${dateKey}/matchday-insights`}
                  className="font-medium text-violet-300 hover:text-violet-200"
                >
                  matchday insights
                </NavLinkWithOverlay>
                .
              </p>
            </section>
          </>
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
