import type { Metadata } from "next";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { getMatchdayInsightsData } from "@/lib/matchdayInsightsService";
import { withPoolRetry } from "@/lib/poolRetry";
import { MatchdayInsightsClient } from "./matchday-insights-client";

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
  const data = await withPoolRetry(() => getMatchdayInsightsData(dateKey));
  const hasContent =
    data.top5ShotsOnTargetPer90.length > 0 || data.top5FixturesCombinedXg.length > 0;
  const displayDate = data.displayDate;
  const title = `Matchday insights & stat leaders for ${displayDate} | Football stats`;
  const description = `Matchday insights and stat leaders for ${displayDate}: shots on target, fouls, yellow cards, team xG and corners per match across this matchday's fixtures.`;
  const canonical = `${BASE_URL}/fixtures/${dateKey}/matchday-insights`;
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
          alt: `Matchday insights and stat leaders for ${displayDate} on statsBuildr`,
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

export default async function MatchdayInsightsPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date: dateParam } = await params;
  const dateKey = normalizeDateKey(dateParam);

  const data = await withPoolRetry(() => getMatchdayInsightsData(dateKey));

  const fixturesHref = `/fixtures/${dateKey}`;
  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: fixturesHref, label: data.displayDate },
    { href: `/fixtures/${dateKey}/matchday-insights`, label: "Matchday insights" },
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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-3" />
        <div className="mb-8">
          <header className="mt-4 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
            <div className="flex items-center gap-3">
              <img
                src="/stats-buildr-mini.png"
                alt="statsBuildr"
                className="h-9 w-9 rounded-full shadow-md sm:h-10 sm:w-10"
              />
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                  Matchday insights
                </span>
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
                  Matchday insights &amp; stat leaders
                </h1>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500 sm:text-[13px]">
                  statsBuildr · Matchday stats for {data.displayDate}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
              Which players average the most yellow cards or shots on target? Which teams have the highest xG or corners per match? See today&apos;s matchday stat leaders for cards, fouls, shots and more.
            </p>
          </header>
        </div>

        <MatchdayInsightsClient data={data} />

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

        <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            For full match previews, AI picks and team form, see{" "}
            <NavLinkWithOverlay
              href={fixturesHref}
              className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              today&apos;s fixtures
            </NavLinkWithOverlay>
            ,{" "}
            <NavLinkWithOverlay
              href={`/fixtures/${dateKey}/ai-insights`}
              className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              AI football insights
            </NavLinkWithOverlay>{" "}
            and{" "}
            <NavLinkWithOverlay
              href={`/fixtures/${dateKey}/form`}
              className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              the form table
            </NavLinkWithOverlay>
            .
          </div>
        </section>

        <div className="mt-6 flex justify-end">
          <ShareUrlButton className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700" />
        </div>
      </main>
    </div>
  );
}
