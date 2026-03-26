import type { Metadata } from "next";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import { RefreshInsightsButton } from "@/app/_components/refresh-insights-button";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import Image from "next/image";
import {
  generateInsights,
  getLast5StatsForDate,
  getSeasonStatsForDate,
  type Insight,
  type Last5TeamSummary,
} from "@/lib/insightsService";
import { decodeHtmlEntities } from "@/lib/text";
import { prisma } from "@/lib/prisma";
import { buildIntentTitle, toSnippetDescription } from "@/lib/seoMetadata";
import { leagueToSlug, matchSlug } from "@/lib/slugs";
import { TopPicksPanel, type TopPick } from "./top-picks-panel";

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
  const insights = await generateInsights(dateKey);
  const hasContent = insights.length > 0;
  const title = `Football AI Predictions Today – BTTS, Goals & Best Picks (${displayDate})`;
  const description = toSnippetDescription([
    "Find today’s best BTTS, over 2.5 goals, corners and cards predictions using AI-powered football stats and insights.",
  ]);
  const canonical = `${BASE_URL}/fixtures/${dateKey}/ai-insights`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: hasContent ? { index: true, follow: true } : { index: false, follow: true },
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

type FixtureForPicks = {
  id: number;
  league: string | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: { name: string; shortName: string | null };
  awayTeam: { name: string; shortName: string | null };
};

function toCategory(insight: Insight): "goals" | "corners" | "cards" | "players" {
  const text = insight.text.toLowerCase();
  if (insight.type === "player_season") return "players";
  if (text.includes("corner")) return "corners";
  if (text.includes("card") || text.includes("foul")) return "cards";
  return "goals";
}

function metricFromRows(
  teamId: number,
  last5ByTeam: Map<number, Last5TeamSummary>,
  seasonByTeam: Map<number, Last5TeamSummary>,
): Last5TeamSummary | null {
  return last5ByTeam.get(teamId) ?? seasonByTeam.get(teamId) ?? null;
}

function fixtureHref(dateKey: string, fixture: FixtureForPicks): string {
  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  return `/fixtures/${dateKey}/${leagueToSlug(fixture.league)}/${matchSlug(home, away)}`;
}

function buildTopPicksAndSummary(params: {
  dateKey: string;
  fixtures: FixtureForPicks[];
  last5: Last5TeamSummary[];
  season: Last5TeamSummary[];
}): { picks: TopPick[]; standoutSummary: string[] } {
  const { dateKey, fixtures, last5, season } = params;
  const last5ByTeam = new Map(last5.map((r) => [r.teamId, r]));
  const seasonByTeam = new Map(season.map((r) => [r.teamId, r]));

  const candidates: Array<TopPick & { score: number }> = [];
  let bttsTrending = 0;
  let highScoring = 0;
  let lowScoring = 0;

  for (const fixture of fixtures) {
    const home = metricFromRows(fixture.homeTeamId, last5ByTeam, seasonByTeam);
    const away = metricFromRows(fixture.awayTeamId, last5ByTeam, seasonByTeam);
    if (!home || !away) continue;

    const fixtureName = `${fixture.homeTeam.shortName ?? fixture.homeTeam.name} vs ${fixture.awayTeam.shortName ?? fixture.awayTeam.name}`;
    const href = fixtureHref(dateKey, fixture);
    const expectedGoals = ((home.avgGoalsFor + away.avgGoalsAgainst) / 2) + ((away.avgGoalsFor + home.avgGoalsAgainst) / 2);
    const bttsStrength = Math.min(home.avgGoalsFor, away.avgGoalsFor) + Math.min(home.avgGoalsAgainst, away.avgGoalsAgainst);
    const cornerTotal = home.avgCorners + away.avgCorners;
    const cardTotal = home.avgCards + away.avgCards;

    if (bttsStrength >= 2.2) bttsTrending += 1;
    if (expectedGoals >= 2.6) highScoring += 1;
    if (expectedGoals <= 2.0) lowScoring += 1;

    if (bttsStrength >= 2.2) {
      candidates.push({
        fixtureName,
        fixtureHref: href,
        market: "BTTS",
        confidence: bttsStrength >= 2.6 ? "High" : "Medium",
        reason: `Both sides project to score and concede regularly (combined BTTS signal ${bttsStrength.toFixed(1)} from recent form).`,
        score: bttsStrength,
      });
    }
    if (expectedGoals >= 2.4) {
      candidates.push({
        fixtureName,
        fixtureHref: href,
        market: "Over 2.5",
        confidence: expectedGoals >= 2.9 ? "High" : "Medium",
        reason: `Projected total goals is ${expectedGoals.toFixed(1)} based on each side's scoring and conceding averages.`,
        score: expectedGoals,
      });
    }
    if (cornerTotal >= 8.5) {
      candidates.push({
        fixtureName,
        fixtureHref: href,
        market: "Corners",
        confidence: cornerTotal >= 10 ? "High" : "Medium",
        reason: `Both teams combine for ${cornerTotal.toFixed(1)} average corners per match from warmed data.`,
        score: cornerTotal,
      });
    }
    if (cardTotal >= 3.8) {
      candidates.push({
        fixtureName,
        fixtureHref: href,
        market: "Cards",
        confidence: cardTotal >= 4.8 ? "High" : "Medium",
        reason: `Card trend is elevated at ${cardTotal.toFixed(1)} cards per game across both teams.`,
        score: cardTotal,
      });
    }
  }

  const byScore = [...candidates].sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "High" ? -1 : 1;
    return b.score - a.score;
  });

  const markets = ["BTTS", "Over 2.5", "Corners", "Cards"] as const;
  const picks: TopPick[] = [];
  for (const market of markets) {
    const hit = byScore.find((c) => c.market === market);
    if (hit) picks.push(hit);
  }
  for (const c of byScore) {
    if (picks.length >= 5) break;
    if (!picks.some((p) => p.fixtureName === c.fixtureName && p.market === c.market)) {
      picks.push(c);
    }
  }

  const standoutSummary = [
    `${bttsTrending} matches trending BTTS.`,
    `${highScoring} high-scoring games by modelled goal expectation.`,
    `${lowScoring} lower-scoring fixtures based on current team data.`,
  ];
  return { picks: picks.slice(0, 5), standoutSummary };
}

export default async function AIInsightsPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date: dateParam } = await params;
  const dateKey = normalizeDateKey(dateParam);

  const [insights, liveScores, fixturesForPicks, last5Rows, seasonRows] = await Promise.all([
    generateInsights(dateKey),
    loadLiveScoresForDate(dateKey),
    loadFixturesForTopPicks(dateKey),
    getLast5StatsForDate(dateKey),
    getSeasonStatsForDate(dateKey),
  ]);
  const groupedInsights = {
    goals: insights.filter((i) => toCategory(i) === "goals"),
    corners: insights.filter((i) => toCategory(i) === "corners"),
    cards: insights.filter((i) => toCategory(i) === "cards"),
    players: insights.filter((i) => toCategory(i) === "players"),
  };
  const { picks, standoutSummary } = buildTopPicksAndSummary({
    dateKey,
    fixtures: fixturesForPicks,
    last5: last5Rows,
    season: seasonRows,
  });

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
          <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-900/80 px-4 py-3 shadow-sm backdrop-blur-sm sm:px-5 sm:py-4">
            <div className="flex items-center gap-3">
              <Image
                src="/stats-buildr-mini.png"
                alt="statsBuildr"
                width={40}
                height={40}
                className="h-9 w-9 rounded-2xl border border-slate-600 bg-slate-950 p-1 shadow-md sm:h-10 sm:w-10"
                priority
              />
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                  AI insights
                </span>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
                  AI Football Insights &amp; Best Picks – {displayDate}
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

        <TopPicksPanel picks={picks} dateKey={dateKey} standoutSummary={standoutSummary} />

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
            <InsightsSection
              title="⚽ Goals Insights"
              insights={groupedInsights.goals}
            />
            <InsightsSection
              title="🚩 Corners Insights"
              insights={groupedInsights.corners}
              className="mt-6"
            />
            <InsightsSection
              title="🟥 Cards Insights"
              insights={groupedInsights.cards}
              className="mt-6"
            />
            <InsightsSection
              title="👤 Player Insights"
              insights={groupedInsights.players}
              className="mt-6"
            />
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
              <p className="mt-2">
                <NavLinkWithOverlay
                  href={`/fixtures/${dateKey}/matchday-insights`}
                  className="font-medium text-violet-300 hover:text-violet-200"
                >
                  📊 View full stat leaders → /fixtures/{dateKey}/matchday-insights
                </NavLinkWithOverlay>
              </p>
            </section>
          </>
        )}

        <div className="mt-8 flex justify-center">
          <ShareUrlButton className="rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" />
        </div>
      </main>
    </div>
  );
}

function insightTypeLabel(insight: Insight): string {
  if (insight.type === "team_last5") return "Last 5";
  if (insight.type === "team_last10") return "Last 10";
  if (insight.type === "team_season") return "Season";
  return "Player · Season";
}

function InsightsSection({
  title,
  insights,
  className = "",
}: {
  title: string;
  insights: Insight[];
  className?: string;
}) {
  if (insights.length === 0) return null;
  return (
    <section className={className}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      <ul className="space-y-4">
        {insights.map((insight, i) => (
          <li
            key={`${insight.type}-${title}-${i}`}
            className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-4 shadow-lg transition hover:border-slate-600/50 hover:bg-slate-800/50"
          >
            <p className="text-slate-100 leading-relaxed">{decodeHtmlEntities(insight.text)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-500">{insightTypeLabel(insight)}</span>
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
    </section>
  );
}

async function loadFixturesForTopPicks(dateKey: string): Promise<FixtureForPicks[]> {
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayEnd = new Date(nextDay.getTime() + 60 * 60 * 1000);
  return prisma.fixture.findMany({
    where: { date: { gte: dayStart, lte: dayEnd } },
    select: {
      id: true,
      league: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true, shortName: true } },
      awayTeam: { select: { name: true, shortName: true } },
    },
  });
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
