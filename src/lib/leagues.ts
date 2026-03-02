/**
 * Core competitions we actively track.
 *
 * NOTE: League IDs come from API-Football. For new competitions, add the id
 * here and everything else (home page, upcoming, form edge, sitemap, crests,
 * matchday insights) will pick it up automatically.
 */
export const BASE_REQUIRED_LEAGUE_IDS = [39, 40, 2, 3, 179, 45, 41, 42, 181] as const;

/** All competitions the site brings in fixtures for. */
export const REQUIRED_LEAGUE_IDS: readonly number[] = [...BASE_REQUIRED_LEAGUE_IDS];

/** Leagues that only have team stats (no player stats or lineups). */
export const LEAGUES_WITHOUT_PLAYER_STATS: readonly number[] = [41, 42];

/** Default order within each KO time on today/tomorrow lists. */
export const LEAGUE_ORDER: readonly number[] = [
  179, // Scottish Premiership
  39, // Premier League
  40, // Championship
  41, // League One
  42, // League Two
  2, // Champions League
  3, // Europa League
  45, // FA Cup
  181, // Scottish Cup
];

/** Order when grouping by league on busy days (home page + form edge page). */
export const LEAGUE_GROUP_ORDER: readonly number[] = [
  39, // Premier League
  40, // Championship
  179, // Scottish Premiership
  41, // League One
  42, // League Two
  2, // Champions League
  3, // Europa League
  45, // FA Cup
  181, // Scottish Cup
];

/** Consistent display names for competitions (professional, no acronyms). */
export const LEAGUE_DISPLAY_NAMES: Record<number, string> = (() => {
  const base: Record<number, string> = {
    39: "Premier League",
    40: "Championship",
    41: "League One",
    42: "League Two",
    2: "Champions League",
    3: "Europa League",
    179: "Scottish Premiership",
    45: "FA Cup",
    181: "Scottish Cup",
  };
  return base;
})();

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
