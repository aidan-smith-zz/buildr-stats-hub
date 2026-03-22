"use client";

import Link from "next/link";
import { useState } from "react";
import type { LeagueFormSpotlightTeam } from "@/lib/insightsService";

type SpotlightPeriod = "last5" | "last10";

function TeamChip({ t }: { t: LeagueFormSpotlightTeam }) {
  return (
    <Link
      href={t.href}
      className="flex items-center gap-2 rounded-lg border border-neutral-200/80 bg-white/90 px-2.5 py-2 text-sm transition hover:border-violet-300 hover:bg-violet-50/80 dark:border-neutral-700 dark:bg-neutral-900/80 dark:hover:border-violet-600 dark:hover:bg-violet-950/40"
    >
      {t.logo ? (
        <img src={t.logo} alt="" width={22} height={22} className="h-5 w-5 flex-shrink-0 object-contain" />
      ) : (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-neutral-200 text-[10px] font-bold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
          {t.teamName.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-medium text-neutral-900 dark:text-neutral-50">{t.teamName}</span>
      <span className="tabular-nums text-xs text-neutral-500 dark:text-neutral-400">
        {t.points}pts
        <span className="mx-0.5 text-neutral-300 dark:text-neutral-600">·</span>
        {t.goalDiff > 0 ? `+${t.goalDiff}` : t.goalDiff} GD
      </span>
    </Link>
  );
}

function Column({
  title,
  subtitle,
  variant,
  teams,
}: {
  title: string;
  subtitle: string;
  variant: "hot" | "cold";
  teams: LeagueFormSpotlightTeam[];
}) {
  const border =
    variant === "hot"
      ? "border-emerald-200/90 dark:border-emerald-900/50"
      : "border-rose-200/90 dark:border-rose-900/50";
  const accent =
    variant === "hot"
      ? "from-emerald-500/15 to-transparent dark:from-emerald-500/10"
      : "from-rose-500/10 to-transparent dark:from-rose-500/10";

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${border} bg-gradient-to-br ${accent} p-4 shadow-sm dark:bg-neutral-900/40`}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</h3>
        <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">{subtitle}</p>
      </div>
      {teams.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-500">Not enough completed matches in this sample yet.</p>
      ) : (
        <ul className="space-y-2">
          {teams.map((t) => (
            <li key={t.teamId}>
              <TeamChip t={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Props = {
  leagueName: string;
  hotLast5: LeagueFormSpotlightTeam[];
  coldLast5: LeagueFormSpotlightTeam[];
  hotLast10: LeagueFormSpotlightTeam[];
  coldLast10: LeagueFormSpotlightTeam[];
};

const PERIOD_COPY: Record<SpotlightPeriod, { hotSubtitle: string; coldSubtitle: string }> = {
  last5: {
    hotSubtitle: "Best records in the league over the last five games.",
    coldSubtitle: "Fewest points in the last five league games.",
  },
  last10: {
    hotSubtitle: "Best records over the last ten games — smoother trend.",
    coldSubtitle: "Teams under pressure across a longer run.",
  },
};

export function LeagueFormSpotlight({
  leagueName,
  hotLast5,
  coldLast5,
  hotLast10,
  coldLast10,
}: Props) {
  const [period, setPeriod] = useState<SpotlightPeriod>("last5");
  const hot = period === "last5" ? hotLast5 : hotLast10;
  const cold = period === "last5" ? coldLast5 : coldLast10;
  const copy = PERIOD_COPY[period];

  return (
    <section className="mb-8" aria-labelledby="form-spotlight-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h2 id="form-spotlight-heading" className="text-base font-semibold text-neutral-900 dark:text-neutral-50 sm:text-lg">
            Who&apos;s hot — who&apos;s not?
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            Ranked by points (3 for a win, 1 for a draw) and goal difference from league matches in{" "}
            {leagueName} we&apos;ve tracked. Teams need at least three completed games in the sample.
          </p>
        </div>
        <div
          className="flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800"
          role="group"
          aria-label="Form sample for spotlight"
        >
          {(["last5", "last10"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors sm:py-1.5 ${
                period === p
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-neutral-100"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {p === "last5" ? "Last 5" : "Last 10"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Column title="In form" subtitle={copy.hotSubtitle} variant="hot" teams={hot} />
        <Column title="Struggling" subtitle={copy.coldSubtitle} variant="cold" teams={cold} />
      </div>
    </section>
  );
}
