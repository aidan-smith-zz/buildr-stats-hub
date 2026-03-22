import type { FormEdgeFixture, Last5TeamSummary } from "@/lib/insightsService";

/** Same weighting as Form Edge visual (goals-based form). */
function edgeScore(home: Last5TeamSummary, away: Last5TeamSummary): number {
  const homeRating = home.avgGoalsFor * 0.3 - home.avgGoalsAgainst * 0.7;
  const awayRating = away.avgGoalsFor * 0.3 - away.avgGoalsAgainst * 0.7;
  return homeRating - awayRating;
}

export type KeyTrendsData = {
  highScoring: { teamName: string }[];
  defensive: { teamName: string }[];
  /** Most balanced last-5 form edges (tightest matchups). */
  closeMatches: { label: string; href: string }[];
};

const MIN_GAMES = 3;

/**
 * Derive “today’s key trends” from last-5 team samples and today’s fixtures.
 * No extra API calls — uses the same data as the form table.
 */
export function buildKeyTrends(fixtures: FormEdgeFixture[], last5: Last5TeamSummary[]): KeyTrendsData {
  const eligible = last5.filter((t) => t.gamesPlayed >= MIN_GAMES);
  const byId = new Map(last5.map((t) => [t.teamId, t]));

  const highScoring = [...eligible]
    .sort((a, b) => b.avgGoalsFor - a.avgGoalsFor)
    .slice(0, 2)
    .map((t) => ({ teamName: t.teamName }));

  const defensive = [...eligible]
    .sort((a, b) => a.avgGoalsAgainst - b.avgGoalsAgainst)
    .slice(0, 2)
    .map((t) => ({ teamName: t.teamName }));

  const scored: { fixture: FormEdgeFixture; absEdge: number }[] = [];
  for (const f of fixtures) {
    const h = byId.get(f.homeTeamId);
    const a = byId.get(f.awayTeamId);
    if (!h || !a || h.gamesPlayed < MIN_GAMES || a.gamesPlayed < MIN_GAMES) continue;
    scored.push({ fixture: f, absEdge: Math.abs(edgeScore(h, a)) });
  }
  scored.sort((x, y) => x.absEdge - y.absEdge);
  const closeMatches = scored.slice(0, 2).map(({ fixture }) => ({
    label: `${fixture.homeName} vs ${fixture.awayName}`,
    href: fixture.href,
  }));

  return { highScoring, defensive, closeMatches };
}
