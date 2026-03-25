import { PredictionCard } from "@/app/predictions/_components/prediction-card";
import type { MarketPredictionRow, PredictionMarket } from "@/lib/predictionsService";

export function TopPicksSection({
  title,
  rows,
  market,
  matchHref,
}: {
  title: string;
  rows: MarketPredictionRow[];
  market: PredictionMarket;
  matchHref: (row: MarketPredictionRow) => string;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
      <div className="grid gap-3">
        {rows.slice(0, 3).map((row) => (
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
