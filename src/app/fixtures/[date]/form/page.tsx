import {
  getLast5StatsForDate,
  getLast10StatsForDate,
  getSeasonStatsForDate,
  getFormEdgeFixtures,
} from "@/lib/insightsService";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { FormEdgeSection } from "./form-edge-section";
import { FormTableClient } from "./form-table-client";

export const dynamic = "force-dynamic";

function normalizeDateKey(param: string | undefined): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const d = new Date(param + "T12:00:00.000Z");
    if (!Number.isNaN(d.getTime())) return param;
  }
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
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

  const hasData = last5.length > 0 || last10.length > 0 || season.length > 0;
  const fixturesHref = `/fixtures/${dateKey}`;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
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
            Form table
          </h1>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            {displayDate} · Teams with fixtures today
          </p>
        </div>

        {!hasData ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No form data yet for this date. Warm today&apos;s fixtures to see
              last 5, last 10 and season averages here.
            </p>
            <NavLinkWithOverlay
              href={fixturesHref}
              className="mt-4 inline-block text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400"
            >
              View today&apos;s fixtures →
            </NavLinkWithOverlay>
          </div>
        ) : (
          <>
            <section className="mb-10">
              <FormTableClient last5={last5} last10={last10} season={season} />
            </section>
            <FormEdgeSection
              fixtures={formEdgeFixtures}
              last10={last10}
              season={season}
            />
          </>
        )}
      </main>
    </div>
  );
}
