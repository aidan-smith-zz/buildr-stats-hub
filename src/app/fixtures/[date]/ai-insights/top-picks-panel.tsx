import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";

export type TopPick = {
  fixtureName: string;
  fixtureHref: string;
  market: "BTTS" | "Over 2.5" | "Corners" | "Cards";
  confidence: "High" | "Medium";
  reason: string;
};

type Props = {
  picks: TopPick[];
  dateKey: string;
  standoutSummary: string[];
};

function confidenceClasses(level: TopPick["confidence"]): string {
  return level === "High"
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50"
    : "bg-amber-500/20 text-amber-300 border-amber-400/50";
}

export function TopPicksPanel({ picks, dateKey, standoutSummary }: Props) {
  return (
    <section className="mb-8 space-y-4">
      <div className="rounded-2xl border border-violet-400/30 bg-slate-900/85 px-4 py-4 shadow-lg sm:px-5">
        <h2 className="text-lg font-semibold text-slate-50 sm:text-xl">🔥 AI Top Picks Today</h2>
        <p className="mt-1 text-xs text-slate-300 sm:text-sm">
          Best market signals across BTTS, goals, corners and cards from today&apos;s warmed fixture data.
        </p>
        {picks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-300">
            We need a bit more warmed fixture data before top picks can be generated.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {picks.map((pick, idx) => (
              <li
                key={`${pick.fixtureName}-${pick.market}-${idx}`}
                className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <NavLinkWithOverlay
                    href={pick.fixtureHref}
                    className="text-sm font-semibold text-slate-100 hover:text-violet-300"
                  >
                    {pick.fixtureName}
                  </NavLinkWithOverlay>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-200">
                      {pick.market}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${confidenceClasses(pick.confidence)}`}>
                      {pick.confidence}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-300">{pick.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 px-4 py-4 sm:px-5">
        <h3 className="text-base font-semibold text-slate-100">📊 What stands out today</h3>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {standoutSummary.map((line, idx) => (
            <li key={`${line}-${idx}`}>• {line}</li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-slate-300">
        <NavLinkWithOverlay
          href={`/fixtures/${dateKey}/matchday-insights`}
          className="font-medium text-violet-300 hover:text-violet-200"
        >
          📊 View full stat leaders → /fixtures/{dateKey}/matchday-insights
        </NavLinkWithOverlay>
      </p>
    </section>
  );
}
