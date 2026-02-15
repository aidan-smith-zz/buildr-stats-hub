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

  console.log(`[footballApi] Making API request to: ${url.toString()}`);
  console.log(`[footballApi] Request parameters:`, Object.fromEntries(url.searchParams.entries()));

  // API-Football uses x-apisports-key header
  const res = await fetch(url.toString(), {
    headers: {
      "x-apisports-key": FOOTBALL_API_KEY,
    },
    cache: "no-store",
  });

  console.log(`[footballApi] Response status: ${res.status} ${res.statusText}`);

  if (!res.ok) {
    const text = await res.text();
    console.error(`[footballApi] API Error: ${res.status} ${res.statusText}: ${text}`);
    throw new Error(`[footballApi] ${res.status} ${res.statusText}: ${text}`);
  }

  const json = (await res.json()) as ApiFootballResponse<T>;
  
  const errorsArray = json.errors ? (Array.isArray(json.errors) ? json.errors : [json.errors]) : [];
  
  console.log(`[footballApi] API response summary:`, {
    get: json.get,
    results: json.results,
    responseLength: json.response?.length || 0,
    hasErrors: errorsArray.length > 0,
    errors: errorsArray,
    parameters: json.parameters,
    paging: json.paging,
  });
  
  if (json.response && json.response.length > 0) {
    console.log(`[footballApi] First fixture sample:`, JSON.stringify(json.response[0], null, 2));
    // Log league information from the response
    const leagueMap = new Map<number, { name: string; season: number; count: number }>();
    json.response.forEach((f: any) => {
      const leagueId = f.league?.id;
      if (leagueId) {
        if (!leagueMap.has(leagueId)) {
          leagueMap.set(leagueId, {
            name: f.league?.name || 'Unknown',
            season: f.league?.season || 0,
            count: 0
          });
        }
        leagueMap.get(leagueId)!.count++;
      }
    });
    console.log(`[footballApi] Leagues in response (${leagueMap.size} unique):`);
    Array.from(leagueMap.entries()).forEach(([id, info]) => {
      console.log(`  - League ID ${id}: "${info.name}" (season ${info.season}) - ${info.count} fixture(s)`);
    });
  } else {
    console.log(`[footballApi] No fixtures in response. This could mean:`);
    console.log(`  - No fixtures scheduled for this date`);
    console.log(`  - League ID or season filter is incorrect`);
    console.log(`  - API returned empty results`);
    console.log(`[footballApi] Request URL was: ${url.toString()}`);
    console.log(`[footballApi] Response parameters from API:`, json.parameters);
    console.log(`[footballApi] Full API response structure:`, {
      get: json.get,
      results: json.results,
      paging: json.paging,
      hasResponse: !!json.response,
      responseLength: json.response?.length || 0
    });
  }

  // Handle errors - can be array or object
  if (errorsArray.length > 0) {
      // Check if error is about plan limitations (e.g., free plan doesn't support this date/season)
      const errorMessages = errorsArray.map((e: any) => 
        typeof e === 'string' ? e : e.plan || e.message || JSON.stringify(e)
      ).join('; ');
      
      const isPlanLimitation = errorMessages.toLowerCase().includes('free plan') || 
                               errorMessages.toLowerCase().includes('plan') ||
                               errorMessages.toLowerCase().includes('do not have access');
      
      if (isPlanLimitation) {
        console.error(`[footballApi] ⚠️ API plan limitation detected: ${errorMessages}`);
        console.error(`[footballApi] Your free plan does not support this date/season. Please use a supported date range or upgrade your plan.`);
        // Return empty array instead of throwing
        return [];
      }
      
      console.error(`[footballApi] API errors:`, json.errors);
      throw new Error(`[footballApi] API errors: ${JSON.stringify(json.errors)}`);
  }

  return json.response;
}

/**
 * Fetch today's fixtures from API-Football.
 * Endpoint: /fixtures?date=YYYY-MM-DD
 */
export async function fetchTodayFixtures(
  params: TodayFixturesParams,
): Promise<RawFixture[]> {
  const path = "/fixtures";
  
  console.log(`[footballApi] Fetching fixtures for date: ${params.date}${params.leagueId ? `, league: ${params.leagueId}` : ''}${params.season ? `, season: ${params.season}` : ''}`);
  
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
  if (params.leagueId !== undefined) {
    queryParams.league = params.leagueId;
    console.log(`[footballApi] Adding league filter: ${params.leagueId}`);
  } else {
    // This is expected when querying all leagues (diagnostic/test calls)
    console.log(`[footballApi] No league filter specified - fetching fixtures for all leagues`);
  }
  if (params.season !== undefined) {
    queryParams.season = params.season;
    console.log(`[footballApi] Adding season filter: ${params.season}`);
  }
  if (params.timezone !== undefined) {
    queryParams.timezone = params.timezone;
  }
  
  console.log(`[footballApi] Final queryParams:`, queryParams);
  const fixtures = await request<ApiFootballFixture>(path, queryParams);
  
  if (!fixtures || fixtures.length === 0) {
    console.log(`[footballApi] No fixtures returned for date ${params.date}${params.leagueId ? `, league ${params.leagueId}` : ''}${params.season ? `, season ${params.season}` : ''}`);
    return [];
  }
  
  console.log(`[footballApi] Fetched ${fixtures.length} fixtures for date ${params.date}${params.leagueId ? `, league ${params.leagueId}` : ''}${params.season ? `, season ${params.season}` : ''}`);

  // Fallback: API-Football league name -> id for our filtered leagues (in case API omits league.id)
  const leagueNameToId: Record<string, number> = {
    "La Liga": 140,
    "Scottish Championship": 179,
    "FA Cup": 45, // English FA Cup
    "Premier League": 39,
  };

  const first = fixtures[0] as ApiFootballFixture | undefined;
  if (first) {
    const rawLeagueId = (first as { league?: { id?: unknown } }).league?.id;
    console.log(`[footballApi] First fixture league:`, { name: first.league?.name, rawId: rawLeagueId, type: typeof rawLeagueId });
  }

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
    }>;
  };

  const queryParams: Record<string, string | number> = {
    team: params.teamExternalId,
  };
  
  // Only add optional parameters if provided (free plan may not support season)
  if (params.season !== undefined) {
    queryParams.season = params.season;
  }
  if (params.leagueId !== undefined) {
    queryParams.league = params.leagueId;
  }
  
  const players = await request<ApiFootballPlayer>(path, queryParams);

  if (!players || players.length === 0) {
    console.log(`[footballApi] No players returned for team ${params.teamExternalId}${params.season ? `, season ${params.season}` : ''}`);
    return [];
  }

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

  return players.flatMap((p) =>
    p.statistics
      .filter((stat: any) => stat.team.id === Number(params.teamExternalId))
      .map((stat: any) => {
        const minutes = stat.games?.minutes ?? 0;
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
        },
      };
      }),
  );
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

