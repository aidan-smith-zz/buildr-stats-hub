import { decodeHtmlEntities } from "@/lib/text";
import type { FixtureSummary } from "@/lib/statsService";
import type { FixtureStatsResponse } from "@/lib/statsService";

function lineupPositionOrder(position: string | null, shirtNumber: number | null): number {
  if (!position || position.trim() === "") {
    if (shirtNumber === 1 || shirtNumber === 13) return 0;
    return 4;
  }
  const p = position.toLowerCase().trim();
  if (p.includes("goalkeeper") || p === "g" || p === "gk") return 0;
  if (p.includes("defender") || p === "d" || ["cb", "lb", "rb", "lwb", "rwb"].some((x) => p.includes(x))) return 1;
  if (p.includes("midfielder") || p === "m" || ["cm", "dm", "lm", "rm", "am", "cdm", "cam"].some((x) => p.includes(x))) return 2;
  if (p.includes("forward") || p.includes("attacker") || p === "f" || p === "s" || ["st", "cf", "lw", "rw", "ss"].some((x) => p.includes(x))) return 3;
  return 4;
}

function TeamCrestOrShirt({
  crestUrl,
  alt,
}: {
  crestUrl: string | null;
  alt: string;
}) {
  const sizeClass = "h-10 w-10 flex-shrink-0 object-contain";
  if (crestUrl) {
    return <img src={crestUrl} alt={alt} width={40} height={40} className={sizeClass} />;
  }
  return (
    <span
      className={`inline-flex ${sizeClass} items-center justify-center rounded-sm bg-black text-white`}
      title={alt}
      aria-label={alt}
    >
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2.5a1.5 1.5 0 0 0-1.5 1.5v1.2L8 6.5v2l-2 1.5v11h12v-11l-2-1.5v-2l-2.5-2.5V4a1.5 1.5 0 0 0-1.5-1.5zM6 8h2v11H6V8zm10 0h2v11h-2V8z" />
      </svg>
    </span>
  );
}

export type PastFixtureScore = {
  homeGoals: number;
  awayGoals: number;
  statusShort: string;
};

type Props = {
  fixture: FixtureSummary;
  score: PastFixtureScore | null;
  stats: FixtureStatsResponse | null;
};

export function PastFixtureView({ fixture, score, stats }: Props) {
  const homeName = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const awayName = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  const homeCrest = fixture.homeTeam.crestUrl ?? null;
  const awayCrest = fixture.awayTeam.crestUrl ?? null;
  const hasLineup = Boolean(stats?.hasLineup && stats?.teams?.length >= 2);

  return (
    <div className="space-y-6">
      {/* Final result */}
      <header className="rounded-xl border border-neutral-200 bg-white px-4 py-6 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6 sm:py-8">
        <div className="flex flex-col items-center gap-4 sm:gap-6">
          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
            <TeamCrestOrShirt crestUrl={homeCrest} alt={homeName} />
            <div className="flex min-w-[6rem] items-center justify-center gap-2">
              {score != null ? (
                <span className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50 sm:text-3xl">
                  {score.homeGoals} – {score.awayGoals}
                </span>
              ) : (
                <span className="text-xl font-medium tabular-nums text-neutral-400 dark:text-neutral-500">–</span>
              )}
              {score?.statusShort && (
                <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-600 dark:text-neutral-200">
                  {score.statusShort}
                </span>
              )}
            </div>
            <TeamCrestOrShirt crestUrl={awayCrest} alt={awayName} />
          </div>
          <div className="flex w-full flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-8">
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{homeName}</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">vs</span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{awayName}</span>
          </div>
        </div>
      </header>

      {/* Lineups (if we have them) */}
      {hasLineup && stats && (
        <section aria-label="Team lineups" className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Team lineups
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Starting XI and substitutes
          </p>
          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            {stats.teams.map((team, index) => {
              const starting = team.players
                .filter((p) => p.lineupStatus === "starting")
                .sort(
                  (a, b) =>
                    lineupPositionOrder(a.position, a.shirtNumber) - lineupPositionOrder(b.position, b.shirtNumber) ||
                    (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99),
                );
              const subs = team.players
                .filter((p) => p.lineupStatus === "substitute")
                .sort(
                  (a, b) =>
                    lineupPositionOrder(a.position, a.shirtNumber) - lineupPositionOrder(b.position, b.shirtNumber) ||
                    (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99),
                );
              return (
                <div key={team.teamId} className="space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    {team.teamShortName ?? team.teamName}
                  </h3>
                  <ul className="space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                    {starting.map((p) => (
                      <li key={p.playerId} className="flex items-baseline gap-2">
                        <span
                          className={`w-6 shrink-0 tabular-nums ${
                            p.shirtNumber != null ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-400 dark:text-neutral-500"
                          }`}
                        >
                          {p.shirtNumber ?? "·"}
                        </span>
                        <span>
                          {decodeHtmlEntities(p.name)}
                          {p.position ? ` (${p.position})` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {subs.length > 0 && (
                    <>
                      <p className="mt-3 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Substitutes
                      </p>
                      <ul className="mt-1 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                        {subs.map((p) => (
                          <li key={p.playerId} className="flex items-baseline gap-2">
                            <span
                              className={`w-6 shrink-0 tabular-nums ${
                                p.shirtNumber != null ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-400 dark:text-neutral-500"
                              }`}
                            >
                              {p.shirtNumber ?? "·"}
                            </span>
                            <span>
                              {decodeHtmlEntities(p.name)}
                              {p.position ? ` (${p.position})` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
