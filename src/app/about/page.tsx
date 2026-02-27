import type { Metadata } from "next";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";

export const metadata: Metadata = {
  title: "What is statsBuildr? | Football stats for bet builders",
  description:
    "Learn what statsBuildr is, which football stats it tracks, and how to use it to build smarter bet builders using goals, xG, corners, cards and more.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6">
          <NavLinkWithOverlay
            href="/"
            className="text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            ← Back to today&apos;s fixtures
          </NavLinkWithOverlay>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <img
            src="/stats-buildr-mini.png"
            alt="statsBuildr"
            className="h-10 w-10 rounded-full shadow-md sm:h-11 sm:w-11"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
              What is statsBuildr?
            </h1>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500 sm:text-[13px]">
              Football stats for smarter bet builders
            </p>
          </div>
        </div>

        <section className="space-y-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <p>
            statsBuildr is a football stats site focused on the numbers that matter most when you&apos;re
            building bet builders — goals, xG, shots on target, corners, fouls and cards. It pulls data
            from live fixtures and season-long stats so you can see form and underlying performance at a glance.
          </p>
          <p>
            Instead of scrolling through raw scorelines or generic tables, statsBuildr shows per‑90
            metrics for teams and players, last 5 and last 10 form, and AI‑generated match insights that
            highlight interesting trends before kick‑off.
          </p>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            What can you do with statsBuildr?
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium">Check today&apos;s fixtures</span> with team and player stats
              before you place a bet builder.
            </li>
            <li>
              <span className="font-medium">Use the Form table</span> to compare last 5, last 10 and
              season form for goals, corners and cards.
            </li>
            <li>
              <span className="font-medium">Scan AI insights</span> for quick talking points and
              high‑level trends picked out from the data.
            </li>
            <li>
              <span className="font-medium">Preview upcoming fixtures</span> over the next 14 days and
              jump into detailed match pages when games get closer.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            Where should you start?
          </h2>
          <p>
            If you&apos;re here to build bets, start on today&apos;s fixtures, open a match you&apos;re
            interested in, and skim the player table, form table and AI insights for that date. The goal
            is to make it easier to back up your ideas with real numbers.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <NavLinkWithOverlay
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              View today&apos;s fixtures →
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href="/fixtures/upcoming"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-sky-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-emerald-400"
            >
              Upcoming fixtures (14 days) →
            </NavLinkWithOverlay>
          </div>
        </section>
      </main>
    </div>
  );
}

