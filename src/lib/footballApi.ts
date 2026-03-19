/**
 * API-Football returns paginated results for list endpoints (often ~20 per page).
 * These functions use requestPage() and fetch all pages so stored data is complete:
 * - fetchTodayFixtures (fixtures by date/league)
 * - fetchTeamFixturesWithGoals (team's fixtures in a league/season)
 * - fetchPlayerSeasonStatsByTeam (players in a team/season)
 * Single-resource calls (id=, fixture=) use request() and do not paginate.
 */
const FOOTBALL_API_BASE_URL = process.env.FOOTBALL_API_BASE_URL;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;

/** All API requests use this season only (e.g. standings?league=39&season=2025). */
export const API_SEASON = "2025";
const WORLD_CUP_LEAGUE_ID = 32;
const WORLD_CUP_SEASON = "2024";

export function getApiSeasonForLeagueId(leagueId?: string | number | null): string {
  if (leagueId !== undefined && leagueId !== null && Number(leagueId) === WORLD_CUP_LEAGUE_ID) {
    return WORLD_CUP_SEASON;
  }
  return API_SEASON;
}

function resolveSeasonForLeague(leagueId?: string | number, explicitSeason?: string | number): string {
  const isWorldCup = leagueId !== undefined && leagueId !== null && Number(leagueId) === WORLD_CUP_LEAGUE_ID;
  if (explicitSeason !== undefined && explicitSeason !== null) {
    const explicit = String(explicitSeason);
    // Most internal callers pass API_SEASON by default; for World Cup we must pin to 2024.
    if (isWorldCup && explicit === API_SEASON) return WORLD_CUP_SEASON;
    return explicit;
  }
  if (isWorldCup) {
    return WORLD_CUP_SEASON;
  }
  return API_SEASON;
}

/** Min ms between outgoing requests to stay under rate limit (e.g. 3000 = ~20/min). Set FOOTBALL_API_MIN_INTERVAL_MS to override. */
const MIN_INTERVAL_MS = Number(process.env.FOOTBALL_API_MIN_INTERVAL_MS) || 1000;

/** Max ms to wait for the external API before aborting (avoids holding DB connection for 30–60s on slow/429). */
const REQUEST_TIMEOUT_MS = Number(process.env.FOOTBALL_API_TIMEOUT_MS) || 12000;

const rateLimitState = { lastRequestAt: 0 };

/** True if the error is from our API request timeout (callers can fall back to cache). */
export function isFootballApiTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.includes("[footballApi] Request timed out");
}

async function rateLimitedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const now = Date.now();
  const elapsed = now - rateLimitState.lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  rateLimitState.lastRequestAt = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("[footballApi] Request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

if (!FOOTBALL_API_BASE_URL) {
  console.warn(
    "[footballApi] FOOTBALL_API_BASE_URL is not set. Configure it in your environment variables.",
  );
}

if (!FOOTBALL_API_KEY) {
  console.warn(
    "[footballApi] FOOTBALL_API_KEY is not set. Configure it in your environment variables.",
  );
}

export type RawFixture = {
  id: string | number;
  date: string;
  league?: string;
  leagueId?: number;
  leagueCountry?: string;
  season?: string | number;
  status?: string;
  homeTeam: {
    id: string | number;
    name: string;
    shortName?: string;
    country?: string;
    crestUrl?: string | null;
  };
  awayTeam: {
    id: string | number;
    name: string;
    shortName?: string;
    country?: string;
    crestUrl?: string | null;
  };
};

export type RawPlayerSeasonStats = {
  player: {
    id: string | number;
    name: string;
    position?: string;
    shirtNumber?: number;
  };
  team: {
    id: string | number;
    name: string;
    shortName?: string;
    country?: string;
  };
  season: string | number;
  league: string;
  stats: {
    appearances?: number;
    minutes?: number;
    goals?: number;
    assists?: number;
    yellowCards?: number;
    redCards?: number;
    fouls?: number;
    shots?: number;
    shotsOnTarget?: number;
    tackles?: number;
  };
};

export type TodayFixturesParams = {
  date: string; // ISO date, e.g. "2025-02-11"
  leagueId?: string | number;
  season?: string | number;
  timezone?: string;
};

export type PlayerSeasonStatsParams = {
  teamExternalId: string | number;
  season?: string | number; // Optional - free plan doesn't support season filtering
  leagueId?: string | number;
};

type ApiFootballResponse<T> = {
  get: string;
  parameters: Record<string, string | number>;
  errors: unknown[] | Record<string, unknown>;
  results: number;
  paging: { current: number; total: number };
  response: T[];
};

async function request<T>(path: string, searchParams?: Record<string, string | number | undefined>) {
  if (!FOOTBALL_API_BASE_URL || !FOOTBALL_API_KEY) {
    throw new Error(
      "Football API is not configured. Set FOOTBALL_API_BASE_URL and FOOTBALL_API_KEY.",
    );
  }

  const url = new URL(path, FOOTBALL_API_BASE_URL);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await rateLimitedFetch(url.toString(), {
    headers: {
      "x-apisports-key": FOOTBALL_API_KEY,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    await res.text(); // consume body
    console.error("[footballApi] API error:", res.status);
    throw new Error(`[footballApi] ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as ApiFootballResponse<T>;
  const errorsArray = json.errors ? (Array.isArray(json.errors) ? json.errors : [json.errors]) : [];

  // Handle errors - API sometimes returns errors: {} (empty object); treat as no errors
  const hasRealErrors =
    errorsArray.length > 0 &&
    errorsArray.some((e: unknown) => {
      if (typeof e === "string") return e.length > 0;
      if (e && typeof e === "object") return Object.keys(e).length > 0;
      return false;
    });

  if (hasRealErrors) {
    const errorMessages = errorsArray
      .map((e: unknown) =>
        typeof e === "string" ? e : (e as { plan?: string; message?: string })?.plan ?? (e as { message?: string })?.message ?? JSON.stringify(e)
      )
      .join("; ");
    const isPlanLimitation =
      errorMessages.toLowerCase().includes("free plan") ||
      errorMessages.toLowerCase().includes("plan") ||
      errorMessages.toLowerCase().includes("do not have access");

    if (isPlanLimitation) {
      console.error("[footballApi] API plan limitation", {
        path,
        params: searchParams ? Object.keys(searchParams || {}) : [],
        apiError: errorMessages,
        rawErrors: json.errors,
      });
      return [];
    }
    console.error("[footballApi] API error:", errorMessages);
    throw new Error(`[footballApi] API errors: ${JSON.stringify(json.errors)}`);
  }

  return json.response;
}

/** Request one page of results; returns response and paging so callers can paginate. */
async function requestPage<T>(
  path: string,
  searchParams: Record<string, string | number | undefined>,
): Promise<{ response: T[]; paging: { current: number; total: number }; results: number }> {
  if (!FOOTBALL_API_BASE_URL || !FOOTBALL_API_KEY) {
    throw new Error("Football API is not configured. Set FOOTBALL_API_BASE_URL and FOOTBALL_API_KEY.");
  }
  const url = new URL(path, FOOTBALL_API_BASE_URL);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const urlString = url.toString();
  if (path === "/fixtures") {
    console.log("[footballApi] GET", urlString);
  }
  const res = await rateLimitedFetch(urlString, {
    headers: { "x-apisports-key": FOOTBALL_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[footballApi] non-OK response", res.status, text.slice(0, 300));
    throw new Error(`[footballApi] ${res.status} ${res.statusText}: ${text}`);
  }
  const json = (await res.json()) as ApiFootballResponse<T>;
  const responseArr = json.response ?? [];
  if (path === "/fixtures" && responseArr.length === 0) {
    console.log("[footballApi] /fixtures empty response body:", {
      results: json.results,
      errors: json.errors,
      get: (json as { get?: string }).get,
      sample: JSON.stringify(json).slice(0, 400),
    });
  }
  const errorsArray = json.errors ? (Array.isArray(json.errors) ? json.errors : [json.errors]) : [];
  if (errorsArray.length > 0) {
    const errorMessages = errorsArray.map((e: unknown) => typeof e === "string" ? e : JSON.stringify(e)).join("; ");
    if (errorMessages.toLowerCase().includes("plan")) {
      console.error("[footballApi] API plan limitation (requestPage)", {
        path,
        params: Object.keys(searchParams),
        apiError: errorMessages,
        rawErrors: json.errors,
      });
      return { response: [], paging: { current: 1, total: 0 }, results: 0 };
    }
    throw new Error(`[footballApi] API errors: ${JSON.stringify(json.errors)}`);
  }
  return {
    response: responseArr,
    paging: json.paging ?? { current: 1, total: 0 },
    results: json.results ?? 0,
  };
}

type ApiFootballTeamResponse = {
  team: {
    id: number;
    name: string;
    code?: string;
    country?: string;
    logo?: string;
  };
};

/**
 * Fetch team details by API id. Returns the team's logo (crest) URL or null.
 * Endpoint: /teams?id={teamId}
 */
export async function fetchTeamLogo(teamApiId: string | number): Promise<string | null> {
  const path = "/teams";
  const response = await request<ApiFootballTeamResponse>(path, { id: String(teamApiId) });
  if (!response?.length) return null;
  const first = response[0];
  const logo = (first as ApiFootballTeamResponse)?.team?.logo;
  return typeof logo === "string" && logo.length > 0 ? logo : null;
}

/** API-Football standings response item: league info (standings may be on league or on item). */
export type StandingsResponseItem = {
  league: {
    id: number;
    name: string;
    season: number;
    country?: string;
    logo?: string;
    /** Some APIs nest standings inside league. */
    standings?: Array<
      | {
          rank: number;
          team: { id: number; name: string; logo?: string };
          points: number;
          goalsDiff: number;
          group?: string;
          all?: { played: number; win: number; draw: number; lose: number; goals?: { for: number; against: number } };
        }
      | unknown[]
    >;
  };
  /** Top-level standings (alternative to league.standings). */
  standings?: Array<{
    rank: number;
    team: { id: number; name: string; logo?: string };
    points: number;
    goalsDiff: number;
    group?: string;
    form?: string;
    status?: string;
    description?: string;
    all?: { played: number; win: number; draw: number; lose: number; goals?: { for: number; against: number } };
    home?: { played: number; win: number; draw: number; lose: number; goals?: { for: number; against: number } };
    away?: { played: number; win: number; draw: number; lose: number; goals?: { for: number; against: number } };
  }>;
};

/**
 * Fetch league standings. One request per league/season; rate limit applies.
 * Endpoint: /standings?league={leagueId}&season={season}
 */
export async function fetchStandings(
  leagueId: number,
  season: string = API_SEASON,
): Promise<StandingsResponseItem[]> {
  const path = "/standings";
  const resolvedSeason = resolveSeasonForLeague(leagueId, season);
  const response = await request<StandingsResponseItem>(path, { league: leagueId, season: resolvedSeason });
  return Array.isArray(response) ? response : [];
}

type ApiFootballFixture = {
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number; name: string; season: number; country?: string };
  teams: {
    home: { id: number; name: string; code?: string; country?: string };
    away: { id: number; name: string; code?: string; country?: string };
  };
};

/**
 * Fetch today's fixtures from API-Football. Paginates so we get every fixture for the date/league.
 * Endpoint: /fixtures?date=YYYY-MM-DD&league=&season=
 */
export async function fetchTodayFixtures(
  params: TodayFixturesParams,
): Promise<RawFixture[]> {
  const path = "/fixtures";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    throw new Error(`Invalid date format: ${params.date}. Expected YYYY-MM-DD`);
  }

  const baseParams: Record<string, string | number> = {
    date: params.date,
    season: resolveSeasonForLeague(params.leagueId, params.season),
  };
  if (params.leagueId !== undefined) baseParams.league = params.leagueId;
  if (params.timezone !== undefined) baseParams.timezone = params.timezone;

  // API-Football /fixtures does not accept a "page" parameter; sending it returns errors and empty response.
  const { response } = await requestPage<ApiFootballFixture>(path, baseParams);
  const allFixtures = response ?? [];

  const fixtures = allFixtures;
  if (!fixtures.length) {
    console.log("[footballApi] fetchTodayFixtures returned 0", {
      date: params.date,
      league: params.leagueId,
      timezone: params.timezone,
      season: API_SEASON,
    });
    return [];
  }

  // Fallback: API-Football league name -> id for our filtered leagues (in case API omits league.id)
  const leagueNameToId: Record<string, number> = {
    "Premier League": 39,
    "Serie A": 135,
    "Championship": 40,
    "La Liga": 140,
    "Spanish La Liga": 140,
    "English League Championship": 40,
    "EFL Championship": 40,
    "The Championship": 40,
    "English Championship": 40,
    "UEFA Champions League": 2,
    "UEFA Europa League": 3,
    "Champions League": 2,
    "Europa League": 3,
    "Scottish Championship": 179,
    "Scottish Premiership": 179,
    "FA Cup": 45,
    "League 41": 41,
    "League One": 41,
    "English League One": 41,
    "EFL League One": 41,
    "League 42": 42,
    "League Two": 42,
    "English League Two": 42,
    "EFL League Two": 42,
    "Scottish Cup": 181,
    "English League Cup": 48,
    "Carabao Cup": 48,
    "League Cup": 48,
    "World Cup": 32,
    "FIFA World Cup": 32,
  };

  return fixtures.map((f) => {
    const raw = f as { league?: { id?: unknown; name?: string }; leagueId?: unknown };
    let rawLeagueId = raw.league?.id ?? raw.leagueId;
    if ((rawLeagueId === undefined || rawLeagueId === null) && raw.league?.name) {
      rawLeagueId = leagueNameToId[raw.league.name] ?? undefined;
    }
    const leagueId = rawLeagueId !== undefined && rawLeagueId !== null ? Number(rawLeagueId) : undefined;
    return {
      id: f.fixture.id,
      date: f.fixture.date,
      league: f.league.name,
      leagueId,
      leagueCountry: f.league.country ?? undefined,
      season: f.league.season,
      status: f.fixture.status.short,
      homeTeam: {
        id: f.teams.home.id,
        name: f.teams.home.name,
        shortName: f.teams.home.code ?? undefined,
        country: f.teams.home.country ?? undefined,
      },
      awayTeam: {
        id: f.teams.away.id,
        name: f.teams.away.name,
        shortName: f.teams.away.code ?? undefined,
        country: f.teams.away.country ?? undefined,
      },
    };
  });
}

/**
 * Fetch season-to-date stats for all players in a team from API-Football.
 * 
 * Note: API-Football's free tier may have limited player statistics.
 * You may need to use:
 * - /players?team={teamId}&season={season} for basic player info
 * - /players/topscorers?league={leagueId}&season={season} for top scorers
 * - Or upgrade to a paid plan for comprehensive player statistics
 * 
 * This is a placeholder that you'll need to adapt based on your API-Football plan.
 */
export async function fetchPlayerSeasonStatsByTeam(
  params: PlayerSeasonStatsParams,
): Promise<RawPlayerSeasonStats[]> {
  // Try players endpoint first (may require paid plan for full stats)
  const path = "/players";

  type ApiFootballPlayer = {
    player: {
      id: number;
      name: string;
      position?: string;
      number?: number;
    };
    statistics: Array<{
      team: { id: number; name: string };
      games: {
        appearances?: number;
        minutes?: number;
        position?: string;
      };
      goals: { total?: number; assists?: number };
      cards: { yellow?: number; red?: number };
      shots: { total?: number; on?: number };
      fouls: { committed?: number };
      tackles?: { total?: number };
    }>;
  };

  const baseParams: Record<string, string | number> = {
    team: params.teamExternalId,
    season: resolveSeasonForLeague(params.leagueId, params.season),
  };
  if (params.leagueId !== undefined) baseParams.league = params.leagueId;

  // API-Football returns 20 results per page; fetch all pages
  const allPlayers: ApiFootballPlayer[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { response, paging } = await requestPage<ApiFootballPlayer>(path, { ...baseParams, page });
    allPlayers.push(...(response ?? []));
    totalPages = paging.total || 1;
    page++;
  } while (page <= totalPages);

  const players = allPlayers;
  if (!players || players.length === 0) return [];

  // Map API-Football response to our RawPlayerSeasonStats format.
  // API-Football sometimes uses different keys (e.g. games.appearances vs games.appearences).
  function getAppearances(stat: { games?: Record<string, unknown> }, minutes: number): number {
    const g = stat.games;
    if (g && typeof g === "object") {
      const v = (g.appearances ?? g.appearences) as unknown;
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    // Fallback: if player has minutes, assume at least 1 appearance
    return minutes > 0 ? 1 : 0;
  }

  function getTacklesFromStat(stat: Record<string, unknown>): number {
    // Prefer explicit tackles (number or { total: number })
    const t = stat.tackles;
    if (t != null) {
      if (typeof t === "number" && Number.isFinite(t)) return t;
      if (typeof t === "object" && t !== null && "total" in t) return Number((t as { total?: number }).total) || 0;
    }
    // Any key containing "tackle" (API may use tackles_total, total_tackles, etc.)
    for (const [key, value] of Object.entries(stat)) {
      if (/tackle/i.test(key) && value != null) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "object" && value !== null && "total" in value) return Number((value as { total?: number }).total) || 0;
      }
    }
    // Some APIs use games.tackles or similar nested under "games"
    const games = stat.games as Record<string, unknown> | undefined;
    if (games && typeof games === "object") {
      const gt = games.tackles ?? games.tackles_total;
      if (typeof gt === "number" && Number.isFinite(gt)) return gt;
      if (gt && typeof gt === "object" && "total" in gt) return Number((gt as { total?: number }).total) || 0;
    }
    return 0;
  }

  return players.flatMap((p) =>
    p.statistics
      .filter((stat: any) => stat.team.id === Number(params.teamExternalId))
      .map((stat: any) => {
        const minutes = stat.games?.minutes ?? 0;
        const tackles = getTacklesFromStat(stat as Record<string, unknown>);
        return {
        player: {
          id: p.player.id,
          name: p.player.name,
          position: p.player.position,
          shirtNumber: p.player.number,
        },
        team: {
          id: stat.team.id,
          name: stat.team.name,
        },
        season: resolveSeasonForLeague(params.leagueId, params.season),
        league: String(params.leagueId ?? ""),
        stats: {
          appearances: getAppearances(stat, minutes),
          minutes,
          goals: stat.goals?.total ?? 0,
          assists: stat.goals?.assists ?? 0,
          yellowCards: stat.cards?.yellow ?? 0,
          redCards: stat.cards?.red ?? 0,
          fouls: stat.fouls?.committed ?? 0,
          shots: stat.shots?.total ?? 0,
          shotsOnTarget: stat.shots?.on ?? 0,
          tackles: Number(tackles) || 0,
        },
      };
      }),
  );
}

export type TeamFixturesWithGoals = {
  fixtureIds: number[];
  goalsFor: number;
  goalsAgainst: number;
  played: number;
  /** Per-fixture for caching (same response, no extra API). isHome used for home/away season splits. */
  fixtures: { apiFixtureId: number; date: Date; goalsFor: number; goalsAgainst: number; isHome: boolean }[];
};

type ApiFixtureItem = {
  fixture?: { id?: number; date?: string };
  league?: unknown;
  teams?: { home?: { id?: number }; away?: { id?: number } };
  goals?: { home?: number | null; away?: number | null };
};

function parseFixtureGoals(
  f: ApiFixtureItem,
  teamIdNum: number,
): { goalsFor: number; goalsAgainst: number } {
  let homeGoals = f.goals?.home != null ? Number(f.goals.home) : 0;
  let awayGoals = f.goals?.away != null ? Number(f.goals.away) : 0;
  if (homeGoals === 0 && awayGoals === 0) {
    const raw = f as { score?: { fulltime?: { home?: number; away?: number } } };
    const ft = raw.score?.fulltime;
    if (ft && (ft.home != null || ft.away != null)) {
      homeGoals = Number(ft.home ?? 0);
      awayGoals = Number(ft.away ?? 0);
    }
  }
  const homeId = Number(f.teams?.home?.id ?? 0);
  const awayId = Number(f.teams?.away?.id ?? 0);
  if (homeId === teamIdNum) return { goalsFor: homeGoals, goalsAgainst: awayGoals };
  if (awayId === teamIdNum) return { goalsFor: awayGoals, goalsAgainst: homeGoals };
  return { goalsFor: 0, goalsAgainst: 0 };
}

/**
 * Fetch fixtures for a team in a league/season (this season only). Returns fixture IDs and goals for/against.
 * GET /fixtures?team=&season=&league= (API-Football does not support "page" for this endpoint).
 */
export async function fetchTeamFixturesWithGoals(
  teamApiId: string | number,
  _season: string | number,
  leagueId: string | number,
): Promise<TeamFixturesWithGoals> {
  const path = "/fixtures";
  const baseParams: Record<string, string | number> = {
    team: teamApiId,
    season: resolveSeasonForLeague(leagueId, _season),
    league: leagueId,
  };

  try {
    const teamIdNum = Number(teamApiId);
    let totalGoalsFor = 0;
    let totalGoalsAgainst = 0;
    const fixtureIds: number[] = [];
    const fixtures: { apiFixtureId: number; date: Date; goalsFor: number; goalsAgainst: number; isHome: boolean }[] = [];

    const { response } = await requestPage<ApiFixtureItem>(path, baseParams);
    if (response?.length) {
      for (const f of response) {
        const id = f.fixture?.id;
        const homeId = Number(f.teams?.home?.id ?? 0);
        const isHome = homeId === teamIdNum;
        const { goalsFor: fGoalsFor, goalsAgainst: fGoalsAgainst } = parseFixtureGoals(f, teamIdNum);
        totalGoalsFor += fGoalsFor;
        totalGoalsAgainst += fGoalsAgainst;
        if (typeof id === "number") {
          fixtureIds.push(id);
          const date = f.fixture?.date ? new Date(f.fixture.date) : new Date(0);
          fixtures.push({ apiFixtureId: id, date, goalsFor: fGoalsFor, goalsAgainst: fGoalsAgainst, isHome });
        }
      }
    }

    return {
      fixtureIds,
      goalsFor: totalGoalsFor,
      goalsAgainst: totalGoalsAgainst,
      played: fixtureIds.length,
      fixtures,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[footballApi] fetchTeamFixturesWithGoals error", {
      team: teamApiId,
      season: resolveSeasonForLeague(leagueId, _season),
      league: leagueId,
      error: msg,
    });
    return { fixtureIds: [], goalsFor: 0, goalsAgainst: 0, played: 0, fixtures: [] };
  }
}

/** Stats for one team in one fixture (from GET /fixtures/statistics). */
export type RawFixtureTeamStats = {
  goals: number;
  xg: number | null;
  corners: number;
  yellowCards: number;
  redCards: number;
};

/**
 * Fetch fixture statistics for one team from API-Football.
 * GET /fixtures/statistics?fixture={fixtureApiId}&team={teamApiId}
 * Response has statistics array of { type: string, value: number | string }.
 */
export async function fetchFixtureStatistics(
  fixtureApiId: string | number,
  teamApiId: string | number,
): Promise<RawFixtureTeamStats | null> {
  const path = "/fixtures/statistics";
  const searchParams: Record<string, string | number> = {
    fixture: fixtureApiId,
    team: teamApiId,
  };

  type ApiFixtureStatItem = { type: string; value: number | string | null };
  type ApiFixtureStatsResponse = {
    team: { id: number; name: string };
    statistics: ApiFixtureStatItem[];
  };

  try {
    const response = await request<ApiFixtureStatsResponse>(path, searchParams);
    if (!response?.length) return null;

    const raw = response[0] as ApiFixtureStatsResponse;
    const stats = raw.statistics ?? [];
    const byType = new Map<string, number>();
    for (const s of stats) {
      const v = s.value;
      const num = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
      if (!Number.isNaN(num)) byType.set(s.type, num);
    }

    function get(key: string): number {
      const exact = byType.get(key);
      if (exact !== undefined) return exact;
      const lower = key.toLowerCase();
      for (const [t, val] of byType) {
        if (t.toLowerCase().includes(lower)) return val;
      }
      return 0;
    }

    const goals = get("Goals") || get("Goal");
    const corners = get("Corner Kicks") || get("Corner");
    const yellowCards = get("Yellow Cards") || get("Yellow");
    const redCards = get("Red Cards") || get("Red");
    let xg: number | null = get("Expected Goals") || get("expected_goals") || null;
    if (xg === 0) xg = null;

    return {
      goals,
      xg: xg != null ? xg : null,
      corners,
      yellowCards,
      redCards,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[footballApi] fetchFixtureStatistics error:", msg);
    return null;
  }
}

/** Response shape for GET /fixtures?id= (single fixture, includes goals and status.elapsed when live) */
type ApiFootballFixtureById = {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long?: string; elapsed?: number | null };
  };
  goals?: { home: number | null; away: number | null };
  league?: unknown;
  teams?: { home?: { id?: number }; away?: { id?: number } };
};

/** Result of fetching a single fixture by id: goals and team ids for computing per-team goals. */
export type FixtureScoreWithTeams = {
  homeGoals: number;
  awayGoals: number;
  homeTeamId: number;
  awayTeamId: number;
};

/**
 * Fetch fixture score and team ids by fixture id. Use when the list endpoint returns null/0 goals
 * (e.g. some leagues). GET /fixtures?id=
 */
export async function fetchFixtureScoreWithTeams(
  fixtureApiId: string | number,
): Promise<FixtureScoreWithTeams | null> {
  const path = "/fixtures";
  const response = await request<ApiFootballFixtureById>(path, { id: fixtureApiId });
  if (!response?.length) return null;
  const data = response[0];
  const goals = data.goals;
  const homeGoals = goals?.home != null ? Number(goals.home) : 0;
  const awayGoals = goals?.away != null ? Number(goals.away) : 0;
  const homeTeamId = Number(data.teams?.home?.id ?? 0);
  const awayTeamId = Number(data.teams?.away?.id ?? 0);
  return { homeGoals, awayGoals, homeTeamId, awayTeamId };
}

export type LiveFixtureResult = {
  homeGoals: number;
  awayGoals: number;
  elapsedMinutes: number | null;
  statusShort: string;
};

/**
 * Fetch the competition round for a fixture id.
 * GET /fixtures?id={fixtureApiId}
 */
export async function fetchFixtureRound(
  fixtureApiId: string | number,
): Promise<string | null> {
  const path = "/fixtures";
  const response = await request<ApiFootballFixtureById>(path, { id: fixtureApiId });
  if (!response?.length) return null;
  const first = response[0] as { league?: { round?: unknown } };
  const round = first.league?.round;
  return typeof round === "string" && round.trim().length > 0 ? round.trim() : null;
}

/**
 * Fetch live score and elapsed minutes for a fixture. Only call when match has started.
 * GET /fixtures?id={fixtureApiId}
 */
export async function fetchLiveFixture(
  fixtureApiId: string | number,
): Promise<LiveFixtureResult | null> {
  const path = "/fixtures";
  const response = await request<ApiFootballFixtureById>(path, { id: fixtureApiId });
  if (!response?.length) return null;
  const data = response[0];
  const goals = data.goals;
  const status = data.fixture?.status;
  const homeGoals = goals?.home != null ? Number(goals.home) : 0;
  const awayGoals = goals?.away != null ? Number(goals.away) : 0;
  const elapsedMinutes = status?.elapsed != null ? Number(status.elapsed) : null;
  return {
    homeGoals,
    awayGoals,
    elapsedMinutes,
    statusShort: status?.short ?? "?",
  };
}

/**
 * Fetch all currently live fixtures in one API call. Use for the live dashboard instead of N calls.
 * GET /fixtures?live=all
 */
export async function fetchAllLiveFixtures(): Promise<
  { apiId: number; homeGoals: number; awayGoals: number; elapsedMinutes: number | null; statusShort: string }[]
> {
  const path = "/fixtures";
  const raw = await request<ApiFootballFixtureById>(path, { live: "all" });
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { live?: unknown[] }).live)
      ? ((raw as { live: ApiFootballFixtureById[] }).live)
      : [];
  if (list.length === 0) return [];
  return list.map((data) => {
    const goals = data.goals;
    const status = data.fixture?.status;
    const homeGoals = goals?.home != null ? Number(goals.home) : 0;
    const awayGoals = goals?.away != null ? Number(goals.away) : 0;
    const elapsedMinutes = status?.elapsed != null ? Number(status.elapsed) : null;
    const idRaw = data.fixture?.id ?? (data as { id?: number }).id;
    const apiId = idRaw != null ? Number(idRaw) : 0;
    return {
      apiId,
      homeGoals,
      awayGoals,
      elapsedMinutes,
      statusShort: status?.short ?? "?",
    };
  });
}

/**
 * Helpers for mapping API identity to database identity.
 * These mirror the `apiId` fields on your Prisma models.
 */
export function getTeamExternalId(raw: RawFixture["homeTeam"] | RawPlayerSeasonStats["team"]) {
  return String(raw.id);
}

export function getPlayerExternalId(raw: RawPlayerSeasonStats["player"]) {
  return String(raw.id);
}

export function getFixtureExternalId(raw: RawFixture) {
  return String(raw.id);
}

type RawFixtureLineupPlayer = {
  player: {
    id: number;
    name: string;
    /** Short position code from lineup endpoint, e.g. "G", "D", "M", "F". */
    pos?: string | null;
    /** Shirt number from lineup endpoint (if available). */
    number?: number | null;
    // Other fields from the API (e.g. grid, rating) are ignored.
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/** Raw lineup entry from API: one per team with startXI and substitutes */
export type RawFixtureLineupTeam = {
  team: { id: number };
  startXI?: RawFixtureLineupPlayer[];
  substitutes?: RawFixtureLineupPlayer[];
};

/**
 * Fetch fixture lineups from API-Football.
 * GET /fixtures/lineups?fixture={fixtureApiId}
 * Returns startXI and substitutes per team (typically available ~30 min before kickoff).
 */
export async function fetchFixtureLineups(
  fixtureApiId: string | number,
): Promise<RawFixtureLineupTeam[]> {
  const path = "/fixtures/lineups";
  const response = await request<RawFixtureLineupTeam>(path, {
    fixture: fixtureApiId,
  });
  return response ?? [];
}

