import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { ConfidenceBadge } from "@/app/predictions/_components/confidence-badge";
import { PredictionTeamCrest } from "@/app/predictions/_components/team-crest";
import type { MarketPredictionRow, PredictionMarket } from "@/lib/predictionsService";

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function valueLabel(market: PredictionMarket, value: number): string {
  if (market === "btts") return `BTTS YES likelihood: ${pct(value)}`;
  if (market === "total-goals") return `Combined goals avg: ${value.toFixed(2)}`;
  if (market === "corners") return `Combined corners avg: ${value.toFixed(2)}`;
  return `Combined cards avg: ${value.toFixed(2)}`;
}

export function PredictionCard({
  row,
  market,
  href,
}: {
  row: MarketPredictionRow;
  market: PredictionMarket;
  href: string;
}) {
  const home = row.fixture.homeTeam.shortName ?? row.fixture.homeTeam.name;
  const away = row.fixture.awayTeam.shortName ?? row.fixture.awayTeam.name;
  const bttsYesPct = Math.round(row.headlineValue);
  const bttsNoPct = Math.max(0, 100 - bttsYesPct);
  const bttsCall = bttsYesPct >= 50 ? "YES" : "NO";

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{row.fixture.leagueName}</p>
          <h3 className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-neutral-900 dark:text-neutral-50">
            <PredictionTeamCrest crestUrl={row.fixture.homeTeam.crestUrl} label={home} />
            <span className="truncate">{home}</span>
            <span className="font-normal text-neutral-400 dark:text-neutral-500">vs</span>
            <PredictionTeamCrest crestUrl={row.fixture.awayTeam.crestUrl} label={away} />
            <span className="truncate">{away}</span>
          </h3>
        </div>
        <ConfidenceBadge confidence={row.confidence} />
      </div>
      <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">{valueLabel(market, row.headlineValue)}</p>
      {market === "btts" ? (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-neutral-100 px-2 py-2 dark:bg-neutral-800">
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">BTTS YES</p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{bttsYesPct}%</p>
          </div>
          <div className="rounded-lg bg-neutral-100 px-2 py-2 dark:bg-neutral-800">
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">BTTS NO</p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{bttsNoPct}%</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-neutral-100 px-2 py-2 dark:bg-neutral-800">
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Over 1.5</p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{pct(row.lines.over15)}</p>
          </div>
          <div className="rounded-lg bg-neutral-100 px-2 py-2 dark:bg-neutral-800">
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Over 2.5</p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{pct(row.lines.over25)}</p>
          </div>
          <div className="rounded-lg bg-neutral-100 px-2 py-2 dark:bg-neutral-800">
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Over 3.5</p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{pct(row.lines.over35)}</p>
          </div>
        </div>
      )}
      {market === "btts" ? (
        <p className="mt-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">BTTS pick: {bttsCall}</p>
      ) : null}
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Last 10 sample: {row.fixture.sampleSize} matches per team</p>
      <NavLinkWithOverlay href={href} className="mt-3 inline-flex text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
        Open match preview →
      </NavLinkWithOverlay>
    </article>
  );
}
