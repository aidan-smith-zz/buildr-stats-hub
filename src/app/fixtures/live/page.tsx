import type { Metadata } from "next";
import { getFixturesForDateFromDbOnly } from "@/lib/fixturesService";
import { getLiveScoresForToday } from "@/lib/liveScoresService";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";
import type { FixtureSummary } from "@/lib/statsService";
import { LEAGUE_DISPLAY_NAMES, LEAGUE_GROUP_ORDER, REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { FixtureRowLink, NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";
const FIXTURES_TZ = "Europe/London";

/** statusShort values that mean the match has finished (don't treat as live list candidates).
 * Extra time (AET) and penalties (PEN) are kept in the live list.
 */
const LIVE_FINISHED_STATUSES = new Set([
  "FT",
  "ABD",
  "AWD",
  "WO",
  "CAN",
]);

export const metadata: Metadata = {
  title: "Live football scores | In-play stats & match dashboards",
  description:
    "See live football scores and in-play stats for today’s fixtures. Track goals, cards, shots and corners while you watch the match and build smarter bet builders.",
  alternates: { canonical: `${BASE_URL}/fixtures/live` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Live football scores | In-play stats & match dashboards",
    description:
      "See live football scores and in-play stats for today’s fixtures. Follow goals, cards, shots and corners in real time.",
    url: `${BASE_URL}/fixtures/live`,
    siteName: "statsBuildr",
    type: "website",
    images: [
      {
        url: `${BASE_URL}/stats-buildr.png`,
        width: 512,
        height: 160,
        alt: "Live football scores on statsBuildr",
      },
    ],
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live football scores | In-play stats & match dashboards",
    description:
      "Track live football scores and in-play stats for today’s fixtures with statsBuildr.",
    images: [`${BASE_URL}/stats-buildr.png`],
  },
};

function formatKoTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: FIXTURES_TZ,
  });
}

function isFixtureLive(fixture: FixtureSummary, now: Date): boolean {
  const kickoff = new Date(fixture.date);
  if (Number.isNaN(kickoff.getTime())) return false;
  const status = fixture.statusShort ?? "NS";
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const withinLiveWindow =
    kickoff <= now && now.getTime() - kickoff.getTime() < twoHoursMs;
  const isFinished =
    status != null && LIVE_FINISHED_STATUSES.has(status.toUpperCase());
  return withinLiveWindow && !isFinished;
}

type LiveScore = {
  homeGoals: number;
  awayGoals: number;
  elapsedMinutes: number | null;
  statusShort: string;
};

export default async function LiveFixturesPage() {
  const todayKey = todayDateKey();
  const fixtures = await getFixturesForDateFromDbOnly(todayKey);
  const now = new Date();

  const baseLiveCandidates = fixtures
    .filter(
      (f) =>
        f.leagueId != null &&
        (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId),
    )
    .filter((f) => isFixtureLive(f, now))
    .sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

  // Call live scores logic directly (no self-fetch) so it works in dev and prod.
  const { scores: liveScoresList } = await getLiveScoresForToday();
  const scoresByFixtureId = new Map<number, LiveScore>();
  for (const s of liveScoresList) {
    scoresByFixtureId.set(s.fixtureId, {
      homeGoals: s.homeGoals,
      awayGoals: s.awayGoals,
      elapsedMinutes: s.elapsedMinutes,
      statusShort: s.statusShort,
    });
  }

  const liveWithScores: { fixture: FixtureSummary; liveScore: LiveScore | null }[] =
    [];
  for (const fixture of baseLiveCandidates) {
    const liveScore = scoresByFixtureId.get(fixture.id) ?? null;
    const statusUpper = (liveScore?.statusShort ?? "").toUpperCase();
    const isEnded =
      statusUpper.length > 0 && LIVE_FINISHED_STATUSES.has(statusUpper);
    if (isEnded) continue;

    liveWithScores.push({
      fixture,
      liveScore: liveScore ?? null,
    });
  }

  // Group by league and sort by homepage priority (LEAGUE_GROUP_ORDER).
  const leagueOrderIndex = (leagueId: number | null) => {
    if (leagueId == null) return LEAGUE_GROUP_ORDER.length;
    const i = LEAGUE_GROUP_ORDER.indexOf(leagueId);
    return i === -1 ? LEAGUE_GROUP_ORDER.length : i;
  };
  const byLeague = new Map<number | null, { fixture: FixtureSummary; liveScore: LiveScore | null }[]>();
  for (const entry of liveWithScores) {
    const id = entry.fixture.leagueId ?? null;
    if (!byLeague.has(id)) byLeague.set(id, []);
    byLeague.get(id)!.push(entry);
  }
  for (const arr of byLeague.values()) {
    arr.sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime());
  }
  const sortedLeagueIds = Array.from(byLeague.keys()).sort(
    (a, b) => leagueOrderIndex(a) - leagueOrderIndex(b),
  );

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs
          items={[
            { href: "/", label: "Home" },
            { href: "/fixtures/live", label: "Live scores" },
          ]}
          className="mb-3"
        />

        <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Today&apos;s in-play matches
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                Live football scores &amp; in-play stats
              </h1>
            </div>
            <span className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-emerald-500">
              Live dashboards
            </span>
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Jump straight into live match dashboards with real-time scores, lineups and in-play stats
            for goals, cards, shots and corners.
          </p>
        </header>

        {liveWithScores.length === 0 ? (
          <section className="mt-6">
            <div className="rounded-3xl border border-dashed border-neutral-300 bg-gradient-to-br from-neutral-50 via-neutral-100 to-neutral-50 p-6 text-center shadow-sm dark:border-neutral-700 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="text-lg font-semibold">⏱</span>
              </div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 sm:text-lg">
                No fixtures are live right now
              </h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                We&apos;ll list matches here as soon as kick-off passes and live stats are available. In the
                meantime you can browse today&apos;s fixtures, check team form or look ahead to upcoming games.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <NavLinkWithOverlay
                  href="/"
                  className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 sm:text-sm"
                >
                  View today&apos;s fixtures →
                </NavLinkWithOverlay>
                <NavLinkWithOverlay
                  href="/fixtures/upcoming"
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-sky-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-emerald-400 sm:text-sm"
                >
                  Upcoming fixtures (14 days) →
                </NavLinkWithOverlay>
                <NavLinkWithOverlay
                  href="/fixtures/past"
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-violet-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-violet-400 sm:text-sm"
                >
                  Past results (14 days) →
                </NavLinkWithOverlay>
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-4 space-y-8">
            {sortedLeagueIds.map((leagueId) => {
              const entries = byLeague.get(leagueId)!;
              const leagueName =
                leagueId != null
                  ? (LEAGUE_DISPLAY_NAMES[leagueId] ?? entries[0]?.fixture.league ?? "Football")
                  : entries[0]?.fixture.league ?? "Football";
              return (
                <div key={leagueId ?? "other"} className="space-y-3">
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
                    {leagueName}
                  </h2>
                  <ul className="space-y-3">
                    {entries.map(({ fixture, liveScore }) => {
                      const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
                      const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
                      const leagueSlug = leagueToSlug(fixture.league);
                      const match = matchSlug(home, away);
                      const href = `/fixtures/${todayKey}/${leagueSlug}/${match}/live`;
                      const kickoff = new Date(fixture.date);
                      const koTime = formatKoTime(kickoff);
                      const matchHasStarted = !Number.isNaN(kickoff.getTime()) && kickoff.getTime() <= Date.now();
                      const scoreLabel =
                        liveScore != null
                          ? `${liveScore.homeGoals} – ${liveScore.awayGoals}`
                          : null;
                      const timeLabel =
                        liveScore != null
                          ? liveScore.elapsedMinutes != null
                            ? `${liveScore.elapsedMinutes}'`
                            : liveScore.statusShort
                          : null;
                      const scoreTimeDisplay =
                        scoreLabel != null && timeLabel != null
                          ? `${scoreLabel} · ${timeLabel}`
                          : matchHasStarted
                            ? `Started ${koTime} · –`
                            : `Kick-off ${koTime}`;

                      return (
                        <FixtureRowLink
                          key={fixture.id}
                          href={href}
                          className="group flex flex-col gap-1.5 rounded-2xl border border-emerald-200 bg-white px-3 py-3 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:border-emerald-800/60 dark:bg-neutral-900 dark:hover:border-emerald-600/80 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3"
                        >
                          <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.35)]" />
                              Live now
                            </span>
                            <span className="hidden text-xs text-neutral-500 dark:text-neutral-400 sm:inline">
                              {koTime}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                              <span className="min-w-0 truncate text-left text-xs font-semibold text-neutral-900 dark:text-neutral-50 sm:text-sm">
                                {home}
                              </span>
                              <span className="shrink-0 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 sm:text-xs">
                                vs
                              </span>
                              <span className="min-w-0 truncate text-left text-xs font-semibold text-neutral-900 dark:text-neutral-50 sm:text-sm">
                                {away}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 sm:px-2.5 sm:py-1 sm:text-xs">
                                {scoreTimeDisplay}
                              </span>
                              <span className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors group-hover:bg-emerald-500 sm:px-3 sm:py-1.5 sm:text-sm">
                                View live stats →
                              </span>
                            </div>
                          </div>
                        </FixtureRowLink>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}

