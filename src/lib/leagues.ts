/** League IDs: Premier League, Championship, UCL, UEL, SPFL (Scottish), FA Cup, EFL League One (41), EFL League Two (42) */
export const REQUIRED_LEAGUE_IDS = [39, 40, 2, 3, 179, 45, 41, 42] as const;

/** Leagues that only have team stats (no player stats or lineups). */
export const LEAGUES_WITHOUT_PLAYER_STATS: readonly number[] = [41, 42];

/** League names that count as "required" when leagueId is null (e.g. API omits id for League 41/42). */
const REQUIRED_LEAGUE_NAMES = [
  "League 41",
  "League 42",
  "League One",
  "League Two",
  "English League One",
  "English League Two",
  "EFL League One",
  "EFL League Two",
  "League 1",
  "League 2",
];

export function isFixtureInRequiredLeagues(fixture: {
  leagueId: number | null;
  league: string | null;
}): boolean {
  if (fixture.leagueId != null && (REQUIRED_LEAGUE_IDS as readonly number[]).includes(fixture.leagueId)) {
    return true;
  }
  if (fixture.leagueId === null && fixture.league) {
    const name = fixture.league.trim().toLowerCase();
    if (REQUIRED_LEAGUE_NAMES.some((n) => name === n.toLowerCase())) return true;
    if (name.includes("league one") || name.includes("league two")) return true;
  }
  return false;
}

export function isTeamStatsOnlyLeague(leagueId: number | null | undefined): boolean {
  return leagueId != null && LEAGUES_WITHOUT_PLAYER_STATS.includes(leagueId);
}
