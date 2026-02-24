/** League IDs: Premier League, Championship, UCL, UEL, SPFL (Scottish), FA Cup, EFL League One (41), EFL League Two (42) */
export const REQUIRED_LEAGUE_IDS = [39, 40, 2, 3, 179, 45, 41, 42] as const;

/** Leagues that only have team stats (no player stats or lineups). */
export const LEAGUES_WITHOUT_PLAYER_STATS: readonly number[] = [41, 42];

export function isTeamStatsOnlyLeague(leagueId: number | null | undefined): boolean {
  return leagueId != null && LEAGUES_WITHOUT_PLAYER_STATS.includes(leagueId);
}
