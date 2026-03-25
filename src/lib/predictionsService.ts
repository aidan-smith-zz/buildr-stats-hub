import { unstable_cache } from "next/cache";
import { API_SEASON } from "@/lib/footballApi";
import { getFixturesForDateFromDbOnly } from "@/lib/fixturesService";
import { getStatsLeagueForFixture, isFixtureInRequiredLeagues } from "@/lib/leagues";
import { prisma } from "@/lib/prisma";

export type ConfidenceLevel = "High" | "Medium" | "Low";
export type PredictionMarket = "btts" | "total-goals" | "corners" | "cards";

type TeamSample = {
  fixtureDate: Date;
  goalsFor: number;
  goalsAgainst: number;
  corners: number;
  yellowCards: number;
  redCards: number;
};

export type MarketRateSet = {
  over15: number;
  over25: number;
  over35: number;
};

type TeamLast10Metrics = {
  sampleSize: number;
  bttsPct: number;
  totalGoalsAvg: number;
  cornersAvg: number;
  cardsAvg: number;
  goalsOver: MarketRateSet;
  cornersOver: MarketRateSet;
  cardsOver: MarketRateSet;
};

export type FixturePrediction = {
  fixtureId: number;
  dateIso: string;
  leagueName: string;
  leagueId: number | null;
  homeTeam: { id: number; name: string; shortName: string | null; crestUrl: string | null };
  awayTeam: { id: number; name: string; shortName: string | null; crestUrl: string | null };
  sampleSize: number;
  btts: { confidence: ConfidenceLevel; scorePct: number };
  totalGoals: { confidence: ConfidenceLevel; combinedAvg: number; lines: MarketRateSet };
  corners: { confidence: ConfidenceLevel; combinedAvg: number; lines: MarketRateSet };
  cards: { confidence: ConfidenceLevel; combinedAvg: number; lines: MarketRateSet };
};

export type DatePredictions = {
  dateKey: string;
  displayDate: string;
  fixtures: FixturePrediction[];
};

export type MarketPredictionRow = {
  fixture: FixturePrediction;
  confidence: ConfidenceLevel;
  headlineValue: number;
  lines: MarketRateSet;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, n) => acc + n, 0) / values.length;
}

function pct(hitCount: number, total: number): number {
  if (total <= 0) return 0;
  return (hitCount / total) * 100;
}

function overRates(samples: number[], thresholds: [number, number, number]): MarketRateSet {
  const [a, b, c] = thresholds;
  return {
    over15: pct(samples.filter((n) => n > a).length, samples.length),
    over25: pct(samples.filter((n) => n > b).length, samples.length),
    over35: pct(samples.filter((n) => n > c).length, samples.length),
  };
}

function bttsConfidence(scorePct: number): ConfidenceLevel {
  if (scorePct > 65) return "High";
  if (scorePct >= 55) return "Medium";
  return "Low";
}

function goalsConfidence(combinedAvg: number): ConfidenceLevel {
  if (combinedAvg > 2.8) return "High";
  if (combinedAvg >= 2.4) return "Medium";
  return "Low";
}

function cornersConfidence(combinedAvg: number): ConfidenceLevel {
  if (combinedAvg > 10) return "High";
  if (combinedAvg >= 8) return "Medium";
  return "Low";
}

function cardsConfidence(combinedAvg: number): ConfidenceLevel {
  if (combinedAvg > 4.2) return "High";
  if (combinedAvg >= 3.2) return "Medium";
  return "Low";
}

function confidenceRank(c: ConfidenceLevel): number {
  if (c === "High") return 3;
  if (c === "Medium") return 2;
  return 1;
}

function formatDisplayDate(dateKey: string): string {
  return new Date(dateKey + "T12:00:00.000Z").toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function computeTeamMetrics(rows: TeamSample[]): TeamLast10Metrics {
  if (rows.length === 0) {
    return {
      sampleSize: 0,
      bttsPct: 0,
      totalGoalsAvg: 0,
      cornersAvg: 0,
      cardsAvg: 0,
      goalsOver: { over15: 0, over25: 0, over35: 0 },
      cornersOver: { over15: 0, over25: 0, over35: 0 },
      cardsOver: { over15: 0, over25: 0, over35: 0 },
    };
  }

  const totals = rows.map((r) => r.goalsFor + r.goalsAgainst);
  const corners = rows.map((r) => r.corners);
  const cards = rows.map((r) => (r.yellowCards ?? 0) + (r.redCards ?? 0));
  const bttsHits = rows.filter((r) => r.goalsFor > 0 && r.goalsAgainst > 0).length;

  return {
    sampleSize: rows.length,
    bttsPct: pct(bttsHits, rows.length),
    totalGoalsAvg: mean(totals),
    cornersAvg: mean(corners),
    cardsAvg: mean(cards),
    goalsOver: overRates(totals, [1.5, 2.5, 3.5]),
    cornersOver: overRates(corners, [3.5, 4.5, 5.5]),
    cardsOver: overRates(cards, [1.5, 2.5, 3.5]),
  };
}

async function loadPredictionsForDate(dateKey: string): Promise<DatePredictions> {
  const fixtures = await getFixturesForDateFromDbOnly(dateKey);
  const filtered = fixtures.filter((f) =>
    isFixtureInRequiredLeagues({ leagueId: f.leagueId ?? null, league: f.league }),
  );

  if (filtered.length === 0) {
    return { dateKey, displayDate: formatDisplayDate(dateKey), fixtures: [] };
  }

  const fixtureMeta = filtered.map((f) => {
    const statsLeague = getStatsLeagueForFixture({ leagueId: f.leagueId ?? null, league: f.league });
    return {
      fixture: f,
      cacheLeague: statsLeague.leagueId != null ? String(statsLeague.leagueId) : null,
    };
  });

  const teamIds = Array.from(
    new Set(fixtureMeta.flatMap(({ fixture }) => [fixture.homeTeam.id, fixture.awayTeam.id])),
  );
  const cacheLeagues = Array.from(new Set(fixtureMeta.map((m) => m.cacheLeague).filter((k): k is string => Boolean(k))));

  const teamRows = await prisma.teamFixtureCache.findMany({
    where: {
      season: API_SEASON,
      teamId: { in: teamIds },
      ...(cacheLeagues.length > 0 ? { league: { in: cacheLeagues } } : {}),
    },
    select: {
      teamId: true,
      league: true,
      fixtureDate: true,
      goalsFor: true,
      goalsAgainst: true,
      corners: true,
      yellowCards: true,
      redCards: true,
    },
    orderBy: { fixtureDate: "desc" },
  });

  const rowMap = new Map<string, TeamSample[]>();
  for (const row of teamRows) {
    const key = `${row.teamId}:${row.league}`;
    const list = rowMap.get(key) ?? [];
    list.push({
      fixtureDate: row.fixtureDate,
      goalsFor: row.goalsFor ?? 0,
      goalsAgainst: row.goalsAgainst ?? 0,
      corners: row.corners ?? 0,
      yellowCards: row.yellowCards ?? 0,
      redCards: row.redCards ?? 0,
    });
    rowMap.set(key, list);
  }

  const output: FixturePrediction[] = fixtureMeta.map(({ fixture, cacheLeague }) => {
    const homeKey = `${fixture.homeTeam.id}:${cacheLeague ?? "unknown"}`;
    const awayKey = `${fixture.awayTeam.id}:${cacheLeague ?? "unknown"}`;

    const cutoff = fixture.date;
    const homeRows = (rowMap.get(homeKey) ?? []).filter((r) => r.fixtureDate < cutoff).slice(0, 10);
    const awayRows = (rowMap.get(awayKey) ?? []).filter((r) => r.fixtureDate < cutoff).slice(0, 10);

    const home = computeTeamMetrics(homeRows);
    const away = computeTeamMetrics(awayRows);
    const sampleSize = Math.min(home.sampleSize, away.sampleSize);

    const bttsScorePct = mean([home.bttsPct, away.bttsPct]);
    const goalsCombinedAvg = mean([home.totalGoalsAvg, away.totalGoalsAvg]);
    const cornersCombinedAvg = home.cornersAvg + away.cornersAvg;
    const cardsCombinedAvg = home.cardsAvg + away.cardsAvg;

    return {
      fixtureId: fixture.id,
      dateIso: fixture.date.toISOString(),
      leagueName: fixture.league ?? "League",
      leagueId: fixture.leagueId ?? null,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      sampleSize,
      btts: {
        confidence: bttsConfidence(bttsScorePct),
        scorePct: bttsScorePct,
      },
      totalGoals: {
        confidence: goalsConfidence(goalsCombinedAvg),
        combinedAvg: goalsCombinedAvg,
        lines: {
          over15: mean([home.goalsOver.over15, away.goalsOver.over15]),
          over25: mean([home.goalsOver.over25, away.goalsOver.over25]),
          over35: mean([home.goalsOver.over35, away.goalsOver.over35]),
        },
      },
      corners: {
        confidence: cornersConfidence(cornersCombinedAvg),
        combinedAvg: cornersCombinedAvg,
        lines: {
          over15: mean([home.cornersOver.over15, away.cornersOver.over15]),
          over25: mean([home.cornersOver.over25, away.cornersOver.over25]),
          over35: mean([home.cornersOver.over35, away.cornersOver.over35]),
        },
      },
      cards: {
        confidence: cardsConfidence(cardsCombinedAvg),
        combinedAvg: cardsCombinedAvg,
        lines: {
          over15: mean([home.cardsOver.over15, away.cardsOver.over15]),
          over25: mean([home.cardsOver.over25, away.cardsOver.over25]),
          over35: mean([home.cardsOver.over35, away.cardsOver.over35]),
        },
      },
    };
  });

  output.sort((a, b) => new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime());

  return {
    dateKey,
    displayDate: formatDisplayDate(dateKey),
    fixtures: output,
  };
}

export async function getDatePredictions(dateKey: string): Promise<DatePredictions> {
  return unstable_cache(
    async () => loadPredictionsForDate(dateKey),
    ["predictions-date", dateKey],
    { revalidate: 60 * 60 * 24 },
  )();
}

export async function getDateMarketPredictions(
  dateKey: string,
  market: PredictionMarket,
): Promise<{ dateKey: string; displayDate: string; rows: MarketPredictionRow[] }> {
  const data = await getDatePredictions(dateKey);
  const rows: MarketPredictionRow[] = data.fixtures.map((fixture) => {
    if (market === "btts") {
      return {
        fixture,
        confidence: fixture.btts.confidence,
        headlineValue: fixture.btts.scorePct,
        lines: {
          over15: fixture.btts.scorePct,
          over25: fixture.btts.scorePct,
          over35: fixture.btts.scorePct,
        },
      };
    }
    if (market === "total-goals") {
      return {
        fixture,
        confidence: fixture.totalGoals.confidence,
        headlineValue: fixture.totalGoals.combinedAvg,
        lines: fixture.totalGoals.lines,
      };
    }
    if (market === "corners") {
      return {
        fixture,
        confidence: fixture.corners.confidence,
        headlineValue: fixture.corners.combinedAvg,
        lines: fixture.corners.lines,
      };
    }
    return {
      fixture,
      confidence: fixture.cards.confidence,
      headlineValue: fixture.cards.combinedAvg,
      lines: fixture.cards.lines,
    };
  });

  rows.sort((a, b) => {
    const confDelta = confidenceRank(b.confidence) - confidenceRank(a.confidence);
    if (confDelta !== 0) return confDelta;
    return b.headlineValue - a.headlineValue;
  });

  return { dateKey: data.dateKey, displayDate: data.displayDate, rows };
}
