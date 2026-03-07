import type { Metadata } from "next";
import { getPast14DaysFixturesFromDb } from "@/lib/fixturesService";
import { todayDateKey } from "@/lib/slugs";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { PastFixturesList } from "./past-fixtures-list";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

export const metadata: Metadata = {
  title: "Past football fixtures | Last 14 days – results & match stats",
  description:
    "View past football fixtures from the last 14 days. Premier League, Championship and more: full-time results, team and player stats, xG, corners and lineups.",
  alternates: { canonical: `${BASE_URL}/fixtures/past` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Past football fixtures | Last 14 days – results & match stats",
    description:
      "View past football fixtures from the last 14 days. Full-time results, team and player stats, xG, corners and lineups.",
    url: `${BASE_URL}/fixtures/past`,
    siteName: "statsBuildr",
    type: "website",
    images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: "Past fixtures on statsBuildr" }],
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Past football fixtures | Last 14 days – results & match stats",
    description:
      "View past football fixtures from the last 14 days. Full-time results, team and player stats.",
    images: [`${BASE_URL}/stats-buildr.png`],
  },
};

export default async function PastPage() {
  const byDate = await getPast14DaysFixturesFromDb();
  const todayKey = todayDateKey();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs
          items={[
            { href: "/", label: "Home" },
            { href: "/fixtures/past", label: "Past fixtures" },
          ]}
          className="mb-3"
        />

        <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Last 14 days
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                Past football fixtures
              </h1>
            </div>
            <span className="inline-flex items-center rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900">
              Results &amp; stats
            </span>
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Browse Premier League, Championship and more. Each fixture links to the full match dashboard with final result, team and player stats, xG, corners and lineups.
          </p>
        </header>

        <PastFixturesList byDate={byDate} />

        <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            For today&apos;s fixtures and AI insights, see{" "}
            <NavLinkWithOverlay href="/" className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
              today&apos;s football fixtures
            </NavLinkWithOverlay>
            ,{" "}
            <NavLinkWithOverlay href={`/fixtures/${todayKey}/ai-insights`} className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
              AI football insights
            </NavLinkWithOverlay>
            {" "}and{" "}
            <NavLinkWithOverlay href="/fixtures/upcoming" className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
              upcoming fixtures
            </NavLinkWithOverlay>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
