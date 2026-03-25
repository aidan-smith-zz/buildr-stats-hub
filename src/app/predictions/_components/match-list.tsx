import { PredictionCard } from "@/app/predictions/_components/prediction-card";
import type { MarketPredictionRow, PredictionMarket } from "@/lib/predictionsService";

export function MatchList({
  rows,
  market,
  matchHref,
}: {
  rows: MarketPredictionRow[];
  market: PredictionMarket;
  matchHref: (row: MarketPredictionRow) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No prediction data is available for this date yet. Warmed fixture stats will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">All fixtures</h2>
      <div className="grid gap-3">
        {rows.map((row) => (
          <PredictionCard
            key={row.fixture.fixtureId}
            row={row}
            market={market}
            href={matchHref(row)}
          />
        ))}
      </div>
    </section>
  );
}
