/**
 * Core competitions we actively track.
 *
 * NOTE: League IDs come from API-Football. For new competitions, add the id
 * here and everything else (home page, upcoming, form edge, sitemap, crests,
 * matchday insights) will pick it up automatically.
 */
export const BASE_REQUIRED_LEAGUE_IDS = [39, 40, 140, 2, 3, 179, 45, 41, 42, 181] as const;

/** All competitions the site brings in fixtures for. */
export const REQUIRED_LEAGUE_IDS: readonly number[] = [...BASE_REQUIRED_LEAGUE_IDS];

/** Scottish Cup: we detect by this id but warm/read stats using Scottish Premiership (179). */
export const SCOTTISH_CUP_LEAGUE_ID = 181;
/** Scottish Premiership: used for warming and reading stats when the fixture is Scottish Cup. */
export const SCOTTISH_PREMIERSHIP_LEAGUE_ID = 179;

/** League IDs that have a standings table (excludes cups: FA Cup 45, Scottish Cup 181). */
export const STANDINGS_LEAGUE_IDS: readonly number[] = [39, 40, 140, 2, 3, 179, 41, 42];

/** Leagues that get full treatment: team pages, player stats, warming like EPL. Used for hasTeamPages, sitemap, teamPageService, teams/all. */
export const TOP_LEAGUE_IDS = [39, 40, 140, 179, 2, 3] as const;

/** Leagues that only have team stats (no player stats or lineups). */
export const LEAGUES_WITHOUT_PLAYER_STATS: readonly number[] = [41, 42];

/** Default order within each KO time on today/tomorrow lists. */
export const LEAGUE_ORDER: readonly number[] = [
  179, // Scottish Premiership
  39, // Premier League
  40, // Championship
  140, // La Liga
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
  140, // La Liga
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
    140: "La Liga",
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

/** League name -> id for resolving leagueId when API omits it. Matches variants used in statsService. */
const LEAGUE_NAME_TO_ID: Record<string, number> = (() => {
  const fromDisplay = Object.fromEntries(
    Object.entries(LEAGUE_DISPLAY_NAMES).map(([id, name]) => [name, Number(id)])
  );
  return {
    ...fromDisplay,
    "English League Championship": 40,
    "EFL Championship": 40,
    "The Championship": 40,
    "English Championship": 40,
    "UEFA Champions League": 2,
    "UEFA Europa League": 3,
    "Champions League": 2,
    "Europa League": 3,
    "Scottish Championship": 179,
    "FA Cup": 45,
    "League 41": 41,
    "League 1": 41,
    "League One": 41,
    "English League One": 41,
    "EFL League One": 41,
    "League 42": 42,
    "League 2": 42,
    "League Two": 42,
    "English League Two": 42,
    "EFL League Two": 42,
    "Scottish Cup": 181,
    "La Liga": 140,
    "Spanish La Liga": 140,
  };
})();

/** League names that count as "required" when leagueId is null (e.g. API omits id). Includes all required leagues by display name plus common variants. */
const REQUIRED_LEAGUE_NAMES = [
  "Premier League",
  "Championship",
  "La Liga",
  "Spanish La Liga",
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
  "Champions League",
  "UEFA Champions League",
  "Europa League",
  "UEFA Europa League",
  "Scottish Premiership",
  "FA Cup",
  "Scottish Cup",
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
    if (name.includes("la liga") || name.includes("champions league") || name.includes("europa league")) return true;
  }
  return false;
}

export function isTeamStatsOnlyLeague(leagueId: number | null | undefined): boolean {
  return leagueId != null && LEAGUES_WITHOUT_PLAYER_STATS.includes(leagueId);
}

/**
 * League id/key to use for warming and reading team/player stats.
 * Scottish Cup (181) fixtures use Scottish Premiership (179) so Premiership teams get full stats.
 * When leagueId is missing, derives it from fixture.league so cache keys match across services.
 */
export function getStatsLeagueForFixture(fixture: {
  leagueId?: number | null;
  league?: string | null;
}): { leagueId: number | undefined; leagueKey: string } {
  if (fixture.leagueId === SCOTTISH_CUP_LEAGUE_ID) {
    return { leagueId: SCOTTISH_PREMIERSHIP_LEAGUE_ID, leagueKey: "Scottish Premiership" };
  }
  const leagueId =
    fixture.leagueId ?? (fixture.league ? LEAGUE_NAME_TO_ID[fixture.league] : undefined);
  const leagueKey =
    fixture.league ?? (leagueId != null ? LEAGUE_DISPLAY_NAMES[leagueId] ?? "Unknown" : "Unknown");
  return { leagueId, leagueKey };
}

/** Slug for standings URL from league display name (e.g. "Premier League" -> "premier-league"). */
function leagueDisplayNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** Map standings league id -> URL slug. */
export const STANDINGS_LEAGUE_SLUG_BY_ID: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (const id of STANDINGS_LEAGUE_IDS) {
    const name = LEAGUE_DISPLAY_NAMES[id];
    if (name) out[id] = leagueDisplayNameToSlug(name);
  }
  return out;
})();

/** Resolve canonical standings URL slug from fixture leagueId and/or URL leagueSlug (so Scottish/Cinch Premiership etc. all link to the same table). */
export function getStandingsSlug(leagueId: number | null, leagueSlug: string): string | null {
  if (leagueId != null && STANDINGS_LEAGUE_SLUG_BY_ID[leagueId]) return STANDINGS_LEAGUE_SLUG_BY_ID[leagueId];
  return Object.values(STANDINGS_LEAGUE_SLUG_BY_ID).includes(leagueSlug) ? leagueSlug : null;
}

/** Map URL slug -> league id for standings pages. Returns undefined if slug not found. */
export function standingsSlugToLeagueId(slug: string): number | undefined {
  const normalized = slug.toLowerCase().trim();
  for (const [id, s] of Object.entries(STANDINGS_LEAGUE_SLUG_BY_ID)) {
    if (s === normalized) return Number(id);
  }
  return undefined;
}
