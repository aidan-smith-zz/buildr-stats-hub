import type { Metadata } from "next";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import {
  getMatchdayInsightsData,
  type MatchdayInsightsData,
} from "@/lib/matchdayInsightsService";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

export const dynamic = "force-dynamic";

function normalizeDateKey(param: string | undefined): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const d = new Date(param + "T12:00:00.000Z");
    if (!Number.isNaN(d.getTime())) return param;
  }
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date: dateParam } = await params;
  const dateKey = normalizeDateKey(dateParam);
  const displayDate = new Date(dateKey + "T12:00:00.000Z").toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const title = `Matchday insights for ${displayDate} | Football stats`;
  const description = `Top players and teams across today's fixtures: shots on target, shots, fouls, xG and cards per 90. Data leaders for ${displayDate}.`;
  const canonical = `${BASE_URL}/fixtures/${dateKey}/matchday-insights`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

export default async function MatchdayInsightsPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date: dateParam } = await params;
  const dateKey = normalizeDateKey(dateParam);

  const data = await getMatchdayInsightsData(dateKey);

  const fixturesHref = `/fixtures/${dateKey}`;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <NavLinkWithOverlay
              href={fixturesHref}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              ← Back to fixtures
            </NavLinkWithOverlay>
            <ShareUrlButton className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700" />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
            Matchday insights
          </h1>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            {data.displayDate}
          </p>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            The data leaders across today&apos;s fixtures
          </p>
        </div>

        <div className="space-y-10">
          <LeaderboardSection
            title="Top 5 players – Shots on Target per 90"
            entries={data.top5ShotsOnTargetPer90}
            valueLabel="SoT/90"
          />
          <LeaderboardSection
            title="Top 5 players – Shots per 90"
            entries={data.top5ShotsPer90}
            valueLabel="Shots/90"
          />
          <LeaderboardSection
            title="Top 5 players – Fouls Committed per 90"
            entries={data.top5FoulsPer90}
            valueLabel="Fouls/90"
          />
          <FixtureXgSection entries={data.top5FixturesCombinedXg} />
          <TeamXgSection entries={data.top5TeamsXgPer90} />
          <LeaderboardSection
            title="Top 5 players – Yellow or Red Cards per 90"
            entries={data.top5CardsPer90}
            valueLabel="Cards/90"
          />
        </div>

        {(data.top5ShotsOnTargetPer90.length === 0 &&
          data.top5FixturesCombinedXg.length === 0) && (
          <div className="mt-12 rounded-xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-neutral-600 dark:text-neutral-400">
              No matchday data yet for this date. View fixture pages to load stats, then return here to see the leaders.
            </p>
            <NavLinkWithOverlay
              href={fixturesHref}
              className="mt-4 inline-block text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400"
            >
              View fixtures →
            </NavLinkWithOverlay>
          </div>
        )}
      </main>
    </div>
  );
}

function LeaderboardSection({
  title,
  entries,
  valueLabel,
}: {
  title: string;
  entries: MatchdayInsightsData["top5ShotsOnTargetPer90"];
  valueLabel: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-200 px-4 py-3 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-neutral-50 sm:px-5">
        {title}
      </h2>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {entries.map((entry, i) => (
          <li key={`${entry.name}-${entry.teamName}-${i}`}>
            <NavLinkWithOverlay
              href={entry.href}
              className="flex items-center justify-between px-4 py-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
            >
              <span className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
                  {i + 1}
                </span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {entry.name}
                </span>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {entry.teamName}
                </span>
              </span>
              <span className="tabular-nums font-medium text-violet-600 dark:text-violet-400">
                {entry.value} <span className="text-xs font-normal text-neutral-400">{valueLabel}</span>
              </span>
            </NavLinkWithOverlay>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FixtureXgSection({
  entries,
}: {
  entries: MatchdayInsightsData["top5FixturesCombinedXg"];
}) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-200 px-4 py-3 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-neutral-50 sm:px-5">
        Top 5 fixtures – Combined xG
      </h2>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {entries.map((entry, i) => (
          <li key={`${entry.homeName}-${entry.awayName}-${i}`}>
            <NavLinkWithOverlay
              href={entry.href}
              className="flex items-center justify-between px-4 py-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
            >
              <span className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
                  {i + 1}
                </span>
                <span className="text-neutral-900 dark:text-neutral-100">
                  {entry.homeName} vs {entry.awayName}
                </span>
              </span>
              <span className="tabular-nums font-medium text-violet-600 dark:text-violet-400">
                {entry.combinedXg} <span className="text-xs font-normal text-neutral-400">xG</span>
              </span>
            </NavLinkWithOverlay>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamXgSection({
  entries,
}: {
  entries: MatchdayInsightsData["top5TeamsXgPer90"];
}) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-200 px-4 py-3 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-neutral-50 sm:px-5">
        Top 5 teams – xG per 90
      </h2>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {entries.map((entry, i) => (
          <li key={`${entry.teamName}-${i}`}>
            <NavLinkWithOverlay
              href={entry.href}
              className="flex items-center justify-between px-4 py-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
            >
              <span className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
                  {i + 1}
                </span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {entry.teamName}
                </span>
              </span>
              <span className="tabular-nums font-medium text-violet-600 dark:text-violet-400">
                {entry.xgPer90} <span className="text-xs font-normal text-neutral-400">xG/90</span>
              </span>
            </NavLinkWithOverlay>
          </li>
        ))}
      </ul>
    </section>
  );
}
