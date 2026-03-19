import type { Metadata } from "next";
import {
  getLast5StatsForDate,
  getLast10StatsForDate,
  getSeasonStatsForDate,
  getFormEdgeFixtures,
} from "@/lib/insightsService";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { todayDateKey, tomorrowDateKey } from "@/lib/slugs";
import { buildIntentTitle, toSnippetDescription } from "@/lib/seoMetadata";
import { FormEdgeSection } from "./form-edge-section";
import { FormTableClient } from "./form-table-client";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

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
  const isToday = dateKey === todayDateKey();
  const isTomorrow = dateKey === tomorrowDateKey();
  const timeframe = isToday ? "today" : isTomorrow ? "tomorrow" : displayDate;
  const title = isToday
    ? buildIntentTitle({
        intent: "Form table",
        timeframe: "today",
        keyStat: "GF/GA, corners & cards per 90",
      })
    : isTomorrow
      ? buildIntentTitle({
          intent: "Form table",
          timeframe: "tomorrow",
          keyStat: "GF/GA, corners & cards per 90",
        })
      : buildIntentTitle({
          intent: "Form table",
          timeframe: displayDate,
          keyStat: "GF/GA, corners & cards per 90",
        });
  const description = toSnippetDescription([
    `Team form table for ${timeframe}.`,
    "Compare goals for/against (GF/GA), corners and cards per 90.",
    "Uses Last 5, Last 10 and season averages with home/away splits.",
    "Sortable for bet builder picks.",
  ]);
  const canonical = `${BASE_URL}/fixtures/${dateKey}/form`;
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
      images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: `Form table for ${displayDate} on statsBuildr` }],
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

export default async function FormPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date: dateParam } = await params;
  const dateKey = normalizeDateKey(dateParam);

  const [last5, last10, season, formEdgeFixtures] = await Promise.all([
    getLast5StatsForDate(dateKey),
    getLast10StatsForDate(dateKey),
    getSeasonStatsForDate(dateKey),
    getFormEdgeFixtures(dateKey),
  ]);

  const displayDate = new Date(dateKey + "T12:00:00.000Z").toLocaleDateString(
    "en-GB",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  );

  const isToday = dateKey === todayDateKey();
  const isTomorrow = dateKey === tomorrowDateKey();
  const dateContext = isToday ? "today" : isTomorrow ? "tomorrow" : "date";

  const hasData = last5.length > 0 || last10.length > 0 || season.length > 0;
  const hasFixtures = formEdgeFixtures.length > 0;
  const fixturesHref = `/fixtures/${dateKey}`;
  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: fixturesHref, label: displayDate },
    { href: `/fixtures/${dateKey}/form`, label: "Form table" },
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

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What does the form table show?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "A football form table compares team averages from recent matches (Last 5, Last 10) and season form, using per-90 stats with home and away splits when available.",
        },
      },
      {
        "@type": "Question",
        name: "Which stats are shown?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The table shows goals for/against per 90, corners per 90 and cards per 90. You can sort columns to compare teams for bet builder selections.",
        },
      },
      {
        "@type": "Question",
        name: "How do I use it for betting?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sort the teams by the stat you want (goals, corners or cards) for today or tomorrow, then open match previews to combine form with the latest fixture context.",
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-3" />
        <div className="mb-8">
          <header className="mt-4 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {displayDate}
                </p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                  Form table – last 5, last 10 &amp; season
                </h1>
                <p className="mt-0.5 text-xs font-medium text-neutral-400 dark:text-neutral-500 sm:text-[13px]">
                  statsBuildr · Team form for {dateContext === "today" ? "today" : dateContext === "tomorrow" ? "tomorrow" : "this date"}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900">
                GF/GA · Corners · Cards (per 90)
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {dateContext === "today"
                ? "Last 5, last 10 and season form for all teams in action today — goals for/against, corners and cards per 90 minutes, with home and away splits. Sortable table for bet builder stats."
                : dateContext === "tomorrow"
                  ? "Last 5, last 10 and season form for all teams in action tomorrow — goals for/against, corners and cards per 90 minutes, with home and away splits. Sortable table for bet builder stats."
                  : `Last 5, last 10 and season form for all teams in action on ${displayDate} — goals for/against, corners and cards per 90 minutes, with home and away splits. Sortable table for bet builder stats.`}
            </p>
          </header>

          <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">At a glance</h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              This {dateContext} form table ranks teams using <strong>Last 5</strong>, <strong>Last 10</strong> and <strong>season</strong> averages per 90 minutes.
              The sortable table shows <strong>GF</strong> / <strong>GA</strong> per 90, <strong>corners</strong> per 90 and <strong>cards</strong> per 90, with home/away splits where available.
            </p>
            <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
              Data availability: Last 5 ({last5.length} teams), Last 10 ({last10.length} teams), Season ({season.length} teams).
            </p>
          </section>
        </div>

        {!hasData && !hasFixtures ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No form data yet for this date. Last 5, last 10 and season averages
              will appear here when available.
            </p>
            <NavLinkWithOverlay
              href={fixturesHref}
              className="mt-4 inline-block text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400"
            >
              {dateContext === "today"
                ? "View today&apos;s fixtures →"
                : dateContext === "tomorrow"
                  ? "View tomorrow&apos;s fixtures →"
                  : "View fixtures for this date →"}
            </NavLinkWithOverlay>
          </div>
        ) : (
          <>
            {!hasData && hasFixtures ? (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Form table will appear here when stats are ready. The section below shows all fixtures for this date.
                </p>
              </div>
            ) : null}
            {hasData ? (
              <section className="mb-10">
                <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
                  Use the form table below to compare goals for/against, corners and cards (per 90) across last 5, last 10 and full season. Home and away columns show averages in home matches vs away matches for bet builder stats.
                </p>
                <FormTableClient last5={last5} last10={last10} season={season} />
              </section>
            ) : null}
            {hasFixtures ? (
              <FormEdgeSection
                fixtures={formEdgeFixtures}
                last10={last10}
                season={season}
                dateContext={dateContext}
              />
            ) : null}
          </>
        )}

        <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            For match previews and lineups, see{" "}
            <NavLinkWithOverlay href={fixturesHref} className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
              {dateContext === "today" ? "today's fixtures" : dateContext === "tomorrow" ? "tomorrow's fixtures" : "fixtures for this date"}
            </NavLinkWithOverlay>
            ,{" "}
            <NavLinkWithOverlay href={`/fixtures/${dateKey}/ai-insights`} className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
              AI football insights
            </NavLinkWithOverlay>
            {" "}and{" "}
            <NavLinkWithOverlay href={`/fixtures/${dateKey}/matchday-insights`} className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
              matchday insights
            </NavLinkWithOverlay>
            .
          </p>
        </section>

        <div className="mt-8 flex justify-center">
          <ShareUrlButton className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700" />
        </div>

        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">FAQs</h2>
          <dl className="mt-2 space-y-3 text-sm text-neutral-700 dark:text-neutral-200">
            <div>
              <dt className="font-medium">What does the form table show?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                A football form table compares team averages from recent matches (Last 5, Last 10) and season form, using per-90 stats with home and away splits when available.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Which stats are shown?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                The table shows goals for/against per 90, corners per 90 and cards per 90. You can sort columns to compare teams for bet builder selections.
              </dd>
            </div>
            <div>
              <dt className="font-medium">How do I use it for betting?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                Sort the teams by the stat you want (goals, corners or cards) for today or tomorrow, then open match previews to combine form with the latest fixture context.
              </dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}
