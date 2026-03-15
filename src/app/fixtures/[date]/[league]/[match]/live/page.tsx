import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getFixturesForDateFromDbOnly,
  getOrRefreshTodayFixtures,
} from "@/lib/fixturesService";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";
import type { FixtureSummary } from "@/lib/statsService";
import { isFixtureInRequiredLeagues } from "@/lib/leagues";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { InPlayFixtureClient } from "./in-play-fixture-client";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";
const FIXTURES_TZ = "Europe/London";

function normalizeDateKey(param: string | undefined): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const d = new Date(param + "T12:00:00.000Z");
    if (!Number.isNaN(d.getTime())) return param;
  }
  return new Date().toLocaleDateString("en-CA", { timeZone: FIXTURES_TZ });
}

function findFixture(
  fixtures: FixtureSummary[],
  leagueSlug: string,
  matchSlugParam: string
): FixtureSummary | null {
  const filtered = fixtures.filter((f) =>
    isFixtureInRequiredLeagues({ leagueId: f.leagueId ?? null, league: f.league }),
  );
  return (
    filtered.find((f) => {
      const slug = leagueToSlug(f.league);
      const home = f.homeTeam.shortName ?? f.homeTeam.name;
      const away = f.awayTeam.shortName ?? f.awayTeam.name;
      const m = matchSlug(home, away);
      return slug === leagueSlug && m === matchSlugParam;
    }) ?? null
  );
}

function formatDisplayDate(dateKey: string): string {
  try {
    const d = new Date(dateKey + "T12:00:00.000Z");
    return d.toLocaleDateString("en-GB", {
      timeZone: FIXTURES_TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateKey;
  }
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string; league: string; match: string }>;
}): Promise<Metadata> {
  const { date: dateParam, league: leagueSlug, match: matchSlugParam } =
    await params;
  const dateKey = normalizeDateKey(dateParam);
  const fixtures =
    dateKey === todayDateKey()
      ? await getOrRefreshTodayFixtures(new Date())
      : await getFixturesForDateFromDbOnly(dateKey);
  const fixture = findFixture(fixtures, leagueSlug, matchSlugParam);
  if (!fixture) {
    return { title: "Fixture not found", robots: { index: false, follow: true } };
  }
  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  const league = fixture.league ?? "Football";
  const title = `${home} vs ${away} Live | ${league} | statsBuildr`;
  const description = `Live score and lineups for ${home} vs ${away}. In-play stats and match updates.`;
  const canonical = `${BASE_URL}/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}/live`;
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
      images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: `${home} vs ${away} live` }],
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

export default async function LiveFixturePage({
  params,
}: {
  params: Promise<{ date: string; league: string; match: string }>;
}) {
  const { date: dateParam, league: leagueSlug, match: matchSlugParam } =
    await params;
  const dateKey = normalizeDateKey(dateParam);

  const fixtures =
    dateKey === todayDateKey()
      ? await getOrRefreshTodayFixtures(new Date())
      : await getFixturesForDateFromDbOnly(dateKey);
  const fixture = findFixture(fixtures, leagueSlug, matchSlugParam);

  if (!fixture) {
    redirect(`/fixtures/${dateKey}`);
  }

  const displayDate = formatDisplayDate(dateKey);
  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: `/fixtures/${dateKey}`, label: displayDate },
    { href: `/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`, label: `${fixture.homeTeam.shortName ?? fixture.homeTeam.name} vs ${fixture.awayTeam.shortName ?? fixture.awayTeam.name}` },
    { href: `/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}/live`, label: "Live" },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Breadcrumbs items={breadcrumbItems} className="flex-1" />
          <NavLinkWithOverlay
            href={`/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`}
            className="hidden text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 sm:inline"
          >
            ← Full stats
          </NavLinkWithOverlay>
        </div>
        <h1 className="sr-only">
          {fixture.homeTeam.shortName ?? fixture.homeTeam.name} vs{" "}
          {fixture.awayTeam.shortName ?? fixture.awayTeam.name} – live
        </h1>
        <InPlayFixtureClient
          fixtureId={fixture.id}
          dateKey={dateKey}
          leagueSlug={leagueSlug}
          matchSlugParam={matchSlugParam}
          fixture={fixture}
        />
      </main>
    </div>
  );
}
