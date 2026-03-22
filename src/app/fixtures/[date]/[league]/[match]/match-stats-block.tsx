import type { MatchStatsSnapshot } from "@/lib/matchStats";

type Props = {
  homeLabel: string;
  awayLabel: string;
  home: MatchStatsSnapshot;
  away: MatchStatsSnapshot;
  /** e.g. "In-play statistics" vs "Full-time statistics" */
  heading?: string;
};

function fmtPct(v: number | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${Math.round(v)}%`;
}

function fmtXg(v: number | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (v === 0) return "0";
  const t = v.toFixed(2);
  return t.replace(/\.?0+$/, "") || "0";
}

function fmtInt(n: number): string {
  return Number.isFinite(n) ? String(n) : "—";
}

export function MatchStatsBlock({
  homeLabel,
  awayLabel,
  home,
  away,
  heading = "Match statistics",
}: Props) {
  const rows: { label: string; home: string; away: string }[] = [
    { label: "Possession", home: fmtPct(home.possessionPct), away: fmtPct(away.possessionPct) },
    { label: "xG", home: fmtXg(home.xg), away: fmtXg(away.xg) },
    { label: "Shots", home: fmtInt(home.shots), away: fmtInt(away.shots) },
    { label: "Shots on target", home: fmtInt(home.shotsOnTarget), away: fmtInt(away.shotsOnTarget) },
    { label: "Corners", home: fmtInt(home.corners), away: fmtInt(away.corners) },
    { label: "Fouls", home: fmtInt(home.fouls), away: fmtInt(away.fouls) },
    {
      label: "Cards (Y / R)",
      home: `${fmtInt(home.yellowCards)} / ${fmtInt(home.redCards)}`,
      away: `${fmtInt(away.yellowCards)} / ${fmtInt(away.redCards)}`,
    },
  ];

  return (
    <section
      aria-label={heading}
      className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="border-b border-neutral-100 bg-neutral-50/80 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-800/50">
        <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          {heading}
        </h2>
      </div>
      <div className="overflow-x-auto px-2 py-3 sm:px-4">
        <table className="w-full min-w-[280px] text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500 dark:text-neutral-400">
              <th className="pb-2 pl-1 font-medium">Stat</th>
              <th className="pb-2 text-right font-medium tabular-nums">{homeLabel}</th>
              <th className="pb-2 pr-1 text-right font-medium tabular-nums">{awayLabel}</th>
            </tr>
          </thead>
          <tbody className="text-neutral-800 dark:text-neutral-200">
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-2 pl-1 text-neutral-600 dark:text-neutral-400">{row.label}</td>
                <td className="py-2 text-right tabular-nums font-medium text-neutral-900 dark:text-neutral-50">
                  {row.home}
                </td>
                <td className="py-2 pr-1 text-right tabular-nums font-medium text-neutral-900 dark:text-neutral-50">
                  {row.away}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
