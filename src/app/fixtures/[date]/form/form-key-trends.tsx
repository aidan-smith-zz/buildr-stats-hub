import Link from "next/link";
import { isDeepFixtureMatchHref, relWithNofollowForDeepFixtureHref } from "@/lib/deepFixtureMatchHref";
import type { KeyTrendsData } from "./form-page-trends";

type Props = {
  trends: KeyTrendsData;
  /** Full section heading, e.g. "Today's Key Trends" */
  sectionTitle: string;
};

function listTeams(items: { teamName: string }[]): string {
  if (items.length === 0) return "—";
  return items.map((t) => t.teamName).join(", ");
}

export function FormKeyTrends({ trends, sectionTitle }: Props) {
  const { highScoring, defensive, closeMatches } = trends;

  return (
    <section
      className="mb-8 rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white p-4 shadow-sm dark:border-violet-900/40 dark:from-violet-950/30 dark:to-neutral-900/80 sm:p-5"
      aria-labelledby="key-trends-heading"
    >
      <h2
        id="key-trends-heading"
        className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50 sm:text-lg"
      >
        <span aria-hidden className="text-lg">
          📈
        </span>
        {sectionTitle}
      </h2>
      <ul className="mt-4 space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
        <li className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <span className="font-medium text-neutral-900 dark:text-neutral-100 sm:min-w-[11rem]">
            High scoring teams:
          </span>
          <span className="text-neutral-600 dark:text-neutral-400">{listTeams(highScoring)}</span>
        </li>
        <li className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <span className="font-medium text-neutral-900 dark:text-neutral-100 sm:min-w-[11rem]">
            Strong defensive teams:
          </span>
          <span className="text-neutral-600 dark:text-neutral-400">{listTeams(defensive)}</span>
        </li>
        <li className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <span className="font-medium text-neutral-900 dark:text-neutral-100 sm:min-w-[11rem]">
            Matches likely to be close:
          </span>
          <span className="text-neutral-600 dark:text-neutral-400">
            {closeMatches.length === 0 ? (
              "—"
            ) : (
              <span className="flex flex-col gap-1.5 sm:inline sm:space-x-2">
                {closeMatches.map((m) => (
                  <Link
                    key={m.href}
                    href={m.href}
                    prefetch={isDeepFixtureMatchHref(m.href) ? false : undefined}
                    rel={relWithNofollowForDeepFixtureHref(m.href)}
                    className="font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
                  >
                    {m.label}
                  </Link>
                ))}
              </span>
            )}
          </span>
        </li>
      </ul>
      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-500">
        Based on last 5 league games per team (min. 3 games). Close games = smallest form gap between the two sides.
      </p>
    </section>
  );
}
