"use client";

import { useState } from "react";
import type { MatchStatsSnapshot } from "@/lib/matchStats";
import type { FixtureSummary } from "@/lib/statsService";
import {
  Last5MatchesTile,
  type Last5FixtureStatsGate,
} from "@/app/_components/last5-matches-tile";
import { TodayFixturesDashboard } from "@/app/_components/today-fixtures-dashboard";

type Props = {
  fixtures: FixtureSummary[];
  initialSelectedId: string;
  last5: {
    homeName: string;
    awayName: string;
    homeCrest: string | null;
    awayCrest: string | null;
  };
  /** Today’s fixture page only: full-time from DB when live cache says ended */
  showEndedTodayMatchStatsTab?: boolean;
  endedTodayMatchStatsFromDb?: {
    home: MatchStatsSnapshot;
    away: MatchStatsSnapshot;
  } | null;
  matchLivePageHref?: string;
};

/**
 * Single-match layout: one /stats fetch from TodayFixturesDashboard, shared with Last5MatchesTile.
 */
export function MatchPageStatsSection({
  fixtures,
  initialSelectedId,
  last5,
  showEndedTodayMatchStatsTab = false,
  endedTodayMatchStatsFromDb = null,
  matchLivePageHref = "",
}: Props) {
  const [dash, setDash] = useState<Last5FixtureStatsGate>(() => ({
    fixtureId: initialSelectedId,
    loading: true,
    error: false,
    stats: null,
  }));

  return (
    <>
      <TodayFixturesDashboard
        fixtures={fixtures}
        initialSelectedId={initialSelectedId}
        hideFixtureSelector
        onFixtureStatsUpdate={setDash}
        showEndedTodayMatchStatsTab={showEndedTodayMatchStatsTab}
        endedTodayMatchStatsFromDb={endedTodayMatchStatsFromDb}
        matchLivePageHref={matchLivePageHref}
      />
      <Last5MatchesTile
        fixtureId={initialSelectedId}
        homeName={last5.homeName}
        awayName={last5.awayName}
        homeCrest={last5.homeCrest}
        awayCrest={last5.awayCrest}
        fixtureStatsFromDashboard={dash}
      />
    </>
  );
}
