import "server-only";

const FOOTBALL_API_BASE_URL = process.env.FOOTBALL_API_BASE_URL;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;

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
  };
  awayTeam: {
    id: string | number;
    name: string;
    shortName?: string;
    country?: string;
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

  const res = await fetch(url.toString(), {
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
      console.error("[footballApi] API plan limitation");
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
  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": FOOTBALL_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[footballApi] ${res.status} ${res.statusText}: ${text}`);
  }
  const json = (await res.json()) as ApiFootballResponse<T>;
  const errorsArray = json.errors ? (Array.isArray(json.errors) ? json.errors : [json.errors]) : [];
  if (errorsArray.length > 0) {
    const errorMessages = errorsArray.map((e: unknown) => typeof e === "string" ? e : JSON.stringify(e)).join("; ");
    if (errorMessages.toLowerCase().includes("plan")) return { response: [], paging: { current: 1, total: 0 }, results: 0 };
    throw new Error(`[footballApi] API errors: ${JSON.stringify(json.errors)}`);
  }
  return {
    response: json.response ?? [],
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

/**
 * Fetch today's fixtures from API-Football.
 * Endpoint: /fixtures?date=YYYY-MM-DD
 */
export async function fetchTodayFixtures(
  params: TodayFixturesParams,
): Promise<RawFixture[]> {
  const path = "/fixtures";

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    throw new Error(`Invalid date format: ${params.date}. Expected YYYY-MM-DD`);
  }

  type ApiFootballFixture = {
    fixture: {
      id: number;
      date: string;
      status: { short: string };
    };
    league: {
      id: number;
      name: string;
      season: number;
      country?: string;
    };
    teams: {
      home: { id: number; name: string; code?: string; country?: string };
      away: { id: number; name: string; code?: string; country?: string };
    };
  };

  // Build query parameters - only include defined values
  // API-Football requires 'date' parameter, others are optional filters
  const queryParams: Record<string, string | number> = {
    date: params.date, // Required: YYYY-MM-DD format
  };
  
  // Only add optional parameters if they're provided
  if (params.leagueId !== undefined) queryParams.league = params.leagueId;
  if (params.season !== undefined) queryParams.season = params.season;
  if (params.timezone !== undefined) queryParams.timezone = params.timezone;

  const fixtures = await request<ApiFootballFixture>(path, queryParams);
  if (!fixtures || fixtures.length === 0) return [];

  // Fallback: API-Football league name -> id for our filtered leagues (in case API omits league.id)
  const leagueNameToId: Record<string, number> = {
    "Premier League": 39,
    "Championship": 40,
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
  };
  if (params.season !== undefined) baseParams.season = params.season;
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
        season: params.season ?? "Unknown", // Season will be set from fixture when storing
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
};

/**
 * Fetch fixtures for a team in a league/season (this season only). Returns fixture IDs and
 * goals for/against from each fixture's score. GET /fixtures?team=&season=&league=
 */
export async function fetchTeamFixturesWithGoals(
  teamApiId: string | number,
  season: string | number,
  leagueId: string | number,
): Promise<TeamFixturesWithGoals> {
  const path = "/fixtures";
  const searchParams: Record<string, string | number> = {
    team: teamApiId,
    season: String(season),
    league: leagueId,
  };

  type ApiFixtureItem = {
    fixture?: { id?: number };
    league?: unknown;
    teams?: { home?: { id?: number }; away?: { id?: number } };
    goals?: { home?: number | null; away?: number | null };
  };
  try {
    const response = await request<ApiFixtureItem>(path, searchParams);
    if (!response?.length) return { fixtureIds: [], goalsFor: 0, goalsAgainst: 0, played: 0 };

    const teamIdNum = Number(teamApiId);
    let goalsFor = 0;
    let goalsAgainst = 0;
    const fixtureIds: number[] = [];

    for (const f of response) {
      const id = f.fixture?.id;
      if (typeof id === "number") fixtureIds.push(id);
      const homeId = f.teams?.home?.id;
      const awayId = f.teams?.away?.id;
      const homeGoals = f.goals?.home ?? 0;
      const awayGoals = f.goals?.away ?? 0;
      if (homeId === teamIdNum) {
        goalsFor += homeGoals;
        goalsAgainst += awayGoals;
      } else if (awayId === teamIdNum) {
        goalsFor += awayGoals;
        goalsAgainst += homeGoals;
      }
    }

    return {
      fixtureIds,
      goalsFor,
      goalsAgainst,
      played: fixtureIds.length,
    };
  } catch {
    console.error("[footballApi] fetchTeamFixturesWithGoals error");
    return { fixtureIds: [], goalsFor: 0, goalsAgainst: 0, played: 0 };
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
  teams?: unknown;
};

export type LiveFixtureResult = {
  homeGoals: number;
  awayGoals: number;
  elapsedMinutes: number | null;
  statusShort: string;
};

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

/** Raw lineup entry from API: one per team with startXI and substitutes */
export type RawFixtureLineupTeam = {
  team: { id: number };
  startXI?: Array<{ player: { id: number; name: string }; [key: string]: unknown }>;
  substitutes?: Array<{ player: { id: number; name: string }; [key: string]: unknown }>;
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

