import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  STANDINGS_LEAGUE_SLUG_BY_ID,
  LEAGUE_DISPLAY_NAMES,
  standingsSlugToLeagueId,
} from "@/lib/leagues";
import { todayDateKey } from "@/lib/slugs";
import { getLeagueCrestUrl } from "@/lib/crestsService";
import { getOrRefreshStandings } from "@/lib/standingsService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import { prisma } from "@/lib/prisma";
import { makeTeamSlug } from "@/lib/teamSlugs";
import { buildIntentTitle, toSnippetDescription } from "@/lib/seoMetadata";
import { fetchFixtureRound } from "@/lib/footballApi";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";
const WORLD_CUP_LEAGUE_ID = 32;

type Props = { params: Promise<{ league: string }> };

function normalizeSlug(slug: string | undefined): string {
  if (!slug || typeof slug !== "string") return "";
  return slug.trim().toLowerCase();
}

/** Current football season string for metadata (e.g. 2024/25). */
function getCurrentSeasonString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  if (month >= 6) return `${year}/${String(year + 1).slice(-2)}`;
  return `${year - 1}/${String(year).slice(-2)}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = normalizeSlug((await params).league);
  const leagueId = standingsSlugToLeagueId(slug);
  const leagueName = leagueId != null ? LEAGUE_DISPLAY_NAMES[leagueId] : null;
  if (!leagueName) {
    return { title: "League not found | statsBuildr" };
  }
  const season = leagueId === WORLD_CUP_LEAGUE_ID ? "2024" : getCurrentSeasonString();
  const isTournament = leagueId === WORLD_CUP_LEAGUE_ID;
  const title = isTournament
    ? buildIntentTitle({
        intent: `${leagueName} standings`,
        timeframe: season,
        keyStat: "group table, play-off paths & fixtures",
      })
    : buildIntentTitle({
        intent: `${leagueName} table`,
        timeframe: season,
        keyStat: "standings, points & form",
      });
  const description = isTournament
    ? toSnippetDescription([
        `${leagueName} ${season} standings and play-off tracker.`,
        "Follow group-table positions, Path A-D progress, kick-off times and live/finished scores.",
        "Includes links to stats and market pages for qualification fixtures.",
      ])
    : toSnippetDescription([
        `Current ${leagueName} league table and standings ${season}.`,
        "Track points, goal difference, wins, draws and losses.",
      ]);
  const canonical = `${BASE_URL}/leagues/${slug}/standings`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "statsBuildr",
      type: "website",
      locale: "en_GB",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function CrestCell({ logo, teamName }: { logo: string | null; teamName: string }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 flex-shrink-0 object-contain"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-neutral-200 dark:bg-neutral-700"
      aria-hidden
    >
      <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
        {teamName.slice(0, 1)}
      </span>
    </span>
  );
}

type TournamentFixtureCard = {
  id: number | string;
  apiFixtureId: string | null;
  kickoff: Date;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
};

type KnockoutSlot = {
  id: string;
  kickoff: Date | null;
  status: string | null;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  isPlaceholder: boolean;
};

type PlayoffPod = {
  id: string;
  semi1: KnockoutSlot;
  semi2: KnockoutSlot;
  final: KnockoutSlot;
};

type KnockoutRound = {
  label: string;
  twoLegged: boolean;
  ties: Array<{
    id: string;
    teamA: string;
    teamB: string;
    leg1: KnockoutSlot;
    leg2: KnockoutSlot | null;
    aggregate: string | null;
    isPlaceholder: boolean;
  }>;
};

const FIXTURE_ROUND_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const FIXTURE_ROUND_FETCH_BATCH_SIZE = 4;

const globalForFixtureRoundCache = globalThis as unknown as {
  fixtureRoundCache?: Map<string, { round: string | null; fetchedAt: number }>;
};

function getFixtureRoundCache(): Map<string, { round: string | null; fetchedAt: number }> {
  if (!globalForFixtureRoundCache.fixtureRoundCache) {
    globalForFixtureRoundCache.fixtureRoundCache = new Map();
  }
  return globalForFixtureRoundCache.fixtureRoundCache;
}

function formatTournamentKickoff(date: Date): string {
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  });
}

function isCompletedFixtureStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === "FT" || s === "AET" || s === "PEN";
}

function isLiveFixtureStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === "1H" || s === "2H" || s === "HT" || s === "ET" || s === "BT" || s === "P";
}

function buildPlayoffPods(fixtures: TournamentFixtureCard[]): PlayoffPod[] {
  const ordered = fixtures
    .slice()
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    .slice(-12); // 4 mini tournaments * (2 semis + 1 final) = 12 ties

  function makeSlot(stage: string, podIdx: number, slotIdx: number, fixture?: TournamentFixtureCard): KnockoutSlot {
    if (fixture) {
      return {
        id: `${stage}-pod-${podIdx}-slot-${slotIdx}-${fixture.id}`,
        kickoff: fixture.kickoff,
        status: fixture.status,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        homeGoals: fixture.homeGoals,
        awayGoals: fixture.awayGoals,
        isPlaceholder: false,
      };
    }
    return {
      id: `${stage}-pod-${podIdx}-slot-${slotIdx}-placeholder`,
      kickoff: null,
      status: null,
      homeTeam: "TBD",
      awayTeam: "TBD",
      homeGoals: null,
      awayGoals: null,
      isPlaceholder: true,
    };
  }

  const pods: PlayoffPod[] = [];
  for (let pod = 0; pod < 4; pod++) {
    const base = pod * 3;
    pods.push({
      id: `pod-${pod + 1}`,
      semi1: makeSlot("semi1", pod + 1, 1, ordered[base]),
      semi2: makeSlot("semi2", pod + 1, 2, ordered[base + 1]),
      final: makeSlot("final", pod + 1, 3, ordered[base + 2]),
    });
  }
  return pods;
}

function normalizeWorldCupPlayoffRound(round: string | null | undefined): "semi" | "final" | null {
  if (!round) return null;
  const s = round.toLowerCase();
  if (s.includes("semi-final") || s.includes("semi finals")) return "semi";
  if (s.includes("final")) return "final";
  return null;
}

function buildPlayoffPodsFromRoundMap(
  fixtures: TournamentFixtureCard[],
  roundByApiFixtureId: Map<string, string | null>,
): PlayoffPod[] {
  const semis: TournamentFixtureCard[] = [];
  const finals: TournamentFixtureCard[] = [];
  for (const f of fixtures) {
    if (!f.apiFixtureId) continue;
    const stage = normalizeWorldCupPlayoffRound(roundByApiFixtureId.get(f.apiFixtureId) ?? null);
    if (stage === "semi") semis.push(f);
    if (stage === "final") finals.push(f);
  }
  semis.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  finals.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());

  function toSlot(stage: string, podIdx: number, slotIdx: number, fixture?: TournamentFixtureCard): KnockoutSlot {
    if (fixture) {
      return {
        id: `${stage}-pod-${podIdx}-slot-${slotIdx}-${fixture.id}`,
        kickoff: fixture.kickoff,
        status: fixture.status,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        homeGoals: fixture.homeGoals,
        awayGoals: fixture.awayGoals,
        isPlaceholder: false,
      };
    }
    return {
      id: `${stage}-pod-${podIdx}-slot-${slotIdx}-placeholder`,
      kickoff: null,
      status: null,
      homeTeam: "TBD",
      awayTeam: "TBD",
      homeGoals: null,
      awayGoals: null,
      isPlaceholder: true,
    };
  }

  const pods: PlayoffPod[] = [];
  for (let pod = 0; pod < 4; pod++) {
    pods.push({
      id: `pod-${pod + 1}`,
      semi1: toSlot("semi1", pod + 1, 1, semis[pod * 2]),
      semi2: toSlot("semi2", pod + 1, 2, semis[pod * 2 + 1]),
      final: toSlot("final", pod + 1, 3, finals[pod]),
    });
  }
  return pods;
}

function getSlotWinner(slot: KnockoutSlot): string | null {
  if (
    slot.isPlaceholder ||
    !isCompletedFixtureStatus(slot.status) ||
    slot.homeGoals == null ||
    slot.awayGoals == null
  ) {
    return null;
  }
  if (slot.homeGoals > slot.awayGoals) return slot.homeTeam;
  if (slot.awayGoals > slot.homeGoals) return slot.awayTeam;
  return null;
}

function buildStandardKnockoutRounds(fixtures: TournamentFixtureCard[]): KnockoutRound[] {
  const ordered = fixtures
    .slice()
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    .slice(-29); // fallback window for two-legged knockouts + final
  return buildStandardKnockoutRoundsFromStageBuckets({
    r16: ordered.slice(0, 16),
    qf: ordered.slice(16, 24),
    sf: ordered.slice(24, 28),
    final: ordered.slice(28, 29),
  });
}

function normalizeRoundLabel(round: string | null | undefined): "r16" | "qf" | "sf" | "final" | null {
  if (!round) return null;
  const s = round.toLowerCase();
  if (s.includes("round of 16") || s.includes("8th finals")) return "r16";
  if (s.includes("quarter-final") || s.includes("quarter finals")) return "qf";
  if (s.includes("semi-final") || s.includes("semi finals")) return "sf";
  if (s.includes("final")) return "final";
  return null;
}

function buildStandardKnockoutRoundsFromRoundMap(
  fixtures: TournamentFixtureCard[],
  roundByApiFixtureId: Map<string, string | null>,
): KnockoutRound[] {
  const byStage: Record<"r16" | "qf" | "sf" | "final", TournamentFixtureCard[]> = {
    r16: [],
    qf: [],
    sf: [],
    final: [],
  };
  const unclassified: TournamentFixtureCard[] = [];

  for (const f of fixtures) {
    if (!f.apiFixtureId) {
      unclassified.push(f);
      continue;
    }
    const rawRound = roundByApiFixtureId.get(f.apiFixtureId) ?? null;
    const stage = normalizeRoundLabel(rawRound);
    if (!stage) {
      unclassified.push(f);
      continue;
    }
    byStage[stage].push(f);
  }

  for (const stage of Object.keys(byStage) as Array<keyof typeof byStage>) {
    byStage[stage].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  }
  unclassified.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());

  // If round classification is missing for some fixtures (API timeout/rate-limit),
  // fill remaining stage slots deterministically so ties do not disappear across refreshes.
  const maxPerStage: Record<keyof typeof byStage, number> = {
    r16: 16,
    qf: 8,
    sf: 4,
    final: 1,
  };
  for (const f of unclassified) {
    if (byStage.r16.length < maxPerStage.r16) {
      byStage.r16.push(f);
      continue;
    }
    if (byStage.qf.length < maxPerStage.qf) {
      byStage.qf.push(f);
      continue;
    }
    if (byStage.sf.length < maxPerStage.sf) {
      byStage.sf.push(f);
      continue;
    }
    if (byStage.final.length < maxPerStage.final) {
      byStage.final.push(f);
    }
  }

  return buildStandardKnockoutRoundsFromStageBuckets(byStage);
}

function buildStandardKnockoutRoundsFromStageBuckets(
  byStage: Record<"r16" | "qf" | "sf" | "final", TournamentFixtureCard[]>,
): KnockoutRound[] {
  const placeholderLeg = (id: string): KnockoutSlot => ({
    id,
    kickoff: null,
    status: null,
    homeTeam: "TBD",
    awayTeam: "TBD",
    homeGoals: null,
    awayGoals: null,
    isPlaceholder: true,
  });
  const toLeg = (fx: TournamentFixtureCard, id: string): KnockoutSlot => ({
    id,
    kickoff: fx.kickoff,
    status: fx.status,
    homeTeam: fx.homeTeam,
    awayTeam: fx.awayTeam,
    homeGoals: fx.homeGoals,
    awayGoals: fx.awayGoals,
    isPlaceholder: false,
  });

  function buildTwoLegRound(
    label: string,
    fixtures: TournamentFixtureCard[],
    expectedTies: number,
    roundIdx: number,
  ): KnockoutRound {
    const grouped = new Map<string, TournamentFixtureCard[]>();
    for (const fx of fixtures) {
      const key = [fx.homeTeam, fx.awayTeam].sort((a, b) => a.localeCompare(b)).join("::");
      const list = grouped.get(key) ?? [];
      list.push(fx);
      grouped.set(key, list);
    }
    const entries = Array.from(grouped.entries())
      .map(([key, list]) => ({
        key,
        teams: key.split("::"),
        matches: list.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime()),
      }))
      .sort((a, b) => {
        const at = a.matches[0]?.kickoff.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bt = b.matches[0]?.kickoff.getTime() ?? Number.MAX_SAFE_INTEGER;
        return at - bt;
      });

    const ties = Array.from({ length: expectedTies }, (_, tieIdx) => {
      const entry = entries[tieIdx];
      if (!entry) {
        return {
          id: `round-${roundIdx}-tie-${tieIdx}-placeholder`,
          teamA: "TBD",
          teamB: "TBD",
          leg1: placeholderLeg(`round-${roundIdx}-tie-${tieIdx}-leg-1-placeholder`),
          leg2: placeholderLeg(`round-${roundIdx}-tie-${tieIdx}-leg-2-placeholder`),
          aggregate: null,
          isPlaceholder: true,
        };
      }

      const [teamA, teamB] = entry.teams as [string, string];
      const leg1fx = entry.matches[0];
      const leg2fx = entry.matches[1];
      const leg1 = leg1fx
        ? toLeg(leg1fx, `round-${roundIdx}-tie-${tieIdx}-leg-1-${leg1fx.id}`)
        : placeholderLeg(`round-${roundIdx}-tie-${tieIdx}-leg-1-placeholder`);
      const leg2 = leg2fx
        ? toLeg(leg2fx, `round-${roundIdx}-tie-${tieIdx}-leg-2-${leg2fx.id}`)
        : placeholderLeg(`round-${roundIdx}-tie-${tieIdx}-leg-2-placeholder`);

      let aggA = 0;
      let aggB = 0;
      let scoredLegs = 0;
      const legsForAgg = [leg1, leg2];
      for (const leg of legsForAgg) {
        if (leg.homeGoals == null || leg.awayGoals == null) continue;
        scoredLegs += 1;
        if (leg.homeTeam === teamA) aggA += leg.homeGoals;
        if (leg.awayTeam === teamA) aggA += leg.awayGoals;
        if (leg.homeTeam === teamB) aggB += leg.homeGoals;
        if (leg.awayTeam === teamB) aggB += leg.awayGoals;
      }
      const aggregate =
        scoredLegs > 0 ? `Aggregate: ${teamA} ${aggA}-${aggB} ${teamB}${scoredLegs < 2 ? " (after leg 1)" : ""}` : null;

      return {
        id: `round-${roundIdx}-tie-${tieIdx}`,
        teamA,
        teamB,
        leg1,
        leg2,
        aggregate,
        isPlaceholder: false,
      };
    });

    return { label, twoLegged: true, ties };
  }

  function buildFinalRound(fixtures: TournamentFixtureCard[], roundIdx: number): KnockoutRound {
    const sorted = fixtures.slice().sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
    const fx = sorted[0];
    if (!fx) {
      return {
        label: "Final",
        twoLegged: false,
        ties: [
          {
            id: `round-${roundIdx}-tie-0-placeholder`,
            teamA: "TBD",
            teamB: "TBD",
            leg1: placeholderLeg(`round-${roundIdx}-tie-0-leg-1-placeholder`),
            leg2: null,
            aggregate: null,
            isPlaceholder: true,
          },
        ],
      };
    }
    return {
      label: "Final",
      twoLegged: false,
      ties: [
        {
          id: `round-${roundIdx}-tie-0-${fx.id}`,
          teamA: fx.homeTeam,
          teamB: fx.awayTeam,
          leg1: toLeg(fx, `round-${roundIdx}-tie-0-leg-1-${fx.id}`),
          leg2: null,
          aggregate: null,
          isPlaceholder: false,
        },
      ],
    };
  }

  return [
    buildTwoLegRound("Round of 16", byStage.r16, 8, 0),
    buildTwoLegRound("Quarter-finals", byStage.qf, 4, 1),
    buildTwoLegRound("Semi-finals", byStage.sf, 2, 2),
    buildFinalRound(byStage.final, 3),
  ];
}

export default async function LeagueStandingsPage({ params }: Props) {
  const slug = normalizeSlug((await params).league);
  const leagueId = standingsSlugToLeagueId(slug);

  if (leagueId === undefined) {
    notFound();
  }

  const [standings, leagueCrestUrl] = await Promise.all([
    getOrRefreshStandings(leagueId),
    getLeagueCrestUrl(leagueId),
  ]);
  const leagueName = LEAGUE_DISPLAY_NAMES[leagueId] ?? "League";

  const todayKey = todayDateKey();
  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: `/fixtures/${todayKey}`, label: "Fixtures" },
    { href: `/leagues/${slug}/standings`, label: `${leagueName} standings` },
  ];
  const isWorldCup = leagueId === WORLD_CUP_LEAGUE_ID;
  const isEuropeanKnockoutLeague = leagueId === 2 || leagueId === 3;

  const jsonLd =
    standings?.tables?.length && standings.tables[0].rows?.length
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: isWorldCup
            ? `${leagueName} standings and play-off paths ${standings.season ?? ""}`.trim()
            : `${leagueName} league table ${standings.season ?? ""}`.trim(),
          description: isWorldCup
            ? `Current ${leagueName} group standings with play-off Path A-D progress and fixture status updates.`
            : `Current ${leagueName} standings: points, goal difference, wins, draws, losses.`,
          numberOfItems: standings.tables[0].rows.length,
          itemListElement: standings.tables[0].rows.map((row) => ({
            "@type": "ListItem",
            position: row.rank,
            name: row.teamName,
          })),
        }
      : null;

  const faqEntitiesStandings = isWorldCup
    ? [
        {
          "@type": "Question" as const,
          name: `What does ${leagueName} Path A-D mean?`,
          acceptedAnswer: {
            "@type": "Answer" as const,
            text: "Each path is a mini 4-team play-off: Semi 1 and Semi 2 feed into a path final. The path winner qualifies from that route.",
          },
        },
        {
          "@type": "Question" as const,
          name: "How often does the play-off tracker update?",
          acceptedAnswer: {
            "@type": "Answer" as const,
            text: "The tracker refreshes from warmed fixture data and updates statuses, scorelines and path progress as matches move from upcoming to live and finished.",
          },
        },
        {
          "@type": "Question" as const,
          name: "Do team stats and market pages populate before kick-off?",
          acceptedAnswer: {
            "@type": "Answer" as const,
            text: "Yes. As upcoming fixtures are pulled in and warmed, stats and market pages for this competition start filling with international team data.",
          },
        },
      ]
    : [
        {
          "@type": "Question" as const,
          name: `What is the current ${leagueName} league table?`,
          acceptedAnswer: {
            "@type": "Answer" as const,
            text: `The ${leagueName} league table shows the current standings for the ${standings?.season ?? "current"} season: points, goal difference, wins, draws, losses and position for every team. Use it with today's fixtures and form for bet builder stats.`,
          },
        },
        {
          "@type": "Question" as const,
          name: "How often is the league table updated?",
          acceptedAnswer: {
            "@type": "Answer" as const,
            text: "Standings are refreshed regularly from official sources. For match previews, team form and player stats, see today's fixtures and the form table on statsBuildr.",
          },
        },
        {
          "@type": "Question" as const,
          name: "Where can I see team stats and form?",
          acceptedAnswer: {
            "@type": "Answer" as const,
            text: `From this ${leagueName} standings page you can use today's fixtures and the form table for bet builder analytics. Top-league team names in the table link to dedicated team stats pages.`,
          },
        },
      ];
  const faqJsonLdStandings = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntitiesStandings,
  };

  const isTopLeagueForTeams = leagueId === 39 || leagueId === 40 || leagueId === 179 || leagueId === 2 || leagueId === 3;

  let teamIdByApi: Map<number, number> | null = null;
  if (isTopLeagueForTeams && standings?.tables?.length) {
    const allRows = standings.tables.flatMap((t) => t.rows ?? []);
    const apiIds = Array.from(new Set(allRows.map((row) => row.teamId).filter((id) => typeof id === "number")));
    if (apiIds.length > 0) {
      const teams = await prisma.team.findMany({
        where: { apiId: { in: apiIds.map(String) } },
        select: { id: true, apiId: true },
      });
      teamIdByApi = new Map(
        teams
          .filter((t) => t.apiId != null)
          .map((t) => [Number(t.apiId), t.id]),
      );
    }
  }

  let tournamentFixtures: TournamentFixtureCard[] = [];
  if (isWorldCup || isEuropeanKnockoutLeague) {
    const now = new Date();
    const fixtureTake = isEuropeanKnockoutLeague ? 80 : 24;
    const [upcoming, recent] = await Promise.all([
      prisma.upcomingFixture.findMany({
        where: { leagueId },
        orderBy: { kickoff: "asc" },
        take: fixtureTake,
      }),
      prisma.fixture.findMany({
        where: { leagueId, date: { lte: now } },
        orderBy: { date: "desc" },
        include: { homeTeam: true, awayTeam: true, liveScoreCache: true },
        take: fixtureTake,
      }),
    ]);
    const out: TournamentFixtureCard[] = [];
    for (const row of recent) {
      out.push({
        id: row.id,
        apiFixtureId: row.apiId ?? null,
        kickoff: row.date,
        status: row.status,
        homeTeam: row.homeTeam.shortName ?? row.homeTeam.name,
        awayTeam: row.awayTeam.shortName ?? row.awayTeam.name,
        homeGoals: row.liveScoreCache?.homeGoals ?? null,
        awayGoals: row.liveScoreCache?.awayGoals ?? null,
      });
    }
    for (const row of upcoming) {
      out.push({
        id: row.apiFixtureId,
        apiFixtureId: row.apiFixtureId,
        kickoff: row.kickoff,
        status: "NS",
        homeTeam: row.homeTeamShortName ?? row.homeTeamName,
        awayTeam: row.awayTeamShortName ?? row.awayTeamName,
        homeGoals: null,
        awayGoals: null,
      });
    }
    tournamentFixtures = out
      .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
      .slice(0, 24);
  }
  let playoffPods = isWorldCup ? buildPlayoffPods(tournamentFixtures) : [];
  let knockoutRounds = isEuropeanKnockoutLeague ? buildStandardKnockoutRounds(tournamentFixtures) : [];
  if (isWorldCup || isEuropeanKnockoutLeague) {
    // Only lookup as many fixtures as we can actually render in tournament tiles.
    const apiIds = Array.from(
      new Set(
        tournamentFixtures
          .slice(0, isEuropeanKnockoutLeague ? 29 : 12)
          .map((f) => f.apiFixtureId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );
    if (apiIds.length > 0) {
      const roundCache = getFixtureRoundCache();
      const nowMs = Date.now();
      const roundResults: Array<readonly [string, string | null]> = [];
      const toFetch: string[] = [];

      // 1) Reuse recent cached round labels to avoid repeated API calls on refresh.
      for (const apiId of apiIds) {
        const cached = roundCache.get(apiId);
        if (cached && nowMs - cached.fetchedAt < FIXTURE_ROUND_CACHE_TTL_MS) {
          roundResults.push([apiId, cached.round] as const);
        } else {
          toFetch.push(apiId);
        }
      }

      // 2) Fetch remaining ids in small sequential batches to avoid rate-limit bursts.
      for (let i = 0; i < toFetch.length; i += FIXTURE_ROUND_FETCH_BATCH_SIZE) {
        const batch = toFetch.slice(i, i + FIXTURE_ROUND_FETCH_BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (apiId) => {
            try {
              const round = await fetchFixtureRound(apiId);
              roundCache.set(apiId, { round, fetchedAt: Date.now() });
              return [apiId, round] as const;
            } catch {
              roundCache.set(apiId, { round: null, fetchedAt: Date.now() });
              return [apiId, null] as const;
            }
          }),
        );
        roundResults.push(...batchResults);
      }

      const roundByApiFixtureId = new Map<string, string | null>(roundResults);
      if (isWorldCup) {
        const hasAnyPlayoffStage = Array.from(roundByApiFixtureId.values()).some(
          (r) => normalizeWorldCupPlayoffRound(r) !== null,
        );
        if (hasAnyPlayoffStage) {
          playoffPods = buildPlayoffPodsFromRoundMap(tournamentFixtures, roundByApiFixtureId);
        }
      }
      const hasAnyStage = Array.from(roundByApiFixtureId.values()).some((r) => normalizeRoundLabel(r) !== null);
      if (isEuropeanKnockoutLeague && hasAnyStage) {
        knockoutRounds = buildStandardKnockoutRoundsFromRoundMap(tournamentFixtures, roundByApiFixtureId);
      }
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-4" />

        {jsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        ) : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLdStandings) }}
        />

        <main>
          <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80 sm:px-5 sm:py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {leagueCrestUrl ? (
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/80 sm:h-12 sm:w-12"
                    aria-hidden
                  >
                    <img
                      src={leagueCrestUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {standings?.season ?? "2025"} season
                  </p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                    {isWorldCup ? `${leagueName} standings & play-off tracker` : `${leagueName} standings`}
                  </h1>
                  <p className="mt-0.5 text-xs font-medium text-neutral-400 dark:text-neutral-500 sm:text-[13px]">
                    {isWorldCup ? "statsBuildr · Qualification tracker" : "statsBuildr · League table"}
                  </p>
                </div>
              </div>
              <span className="inline-flex flex-shrink-0 items-center rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900">
                {isWorldCup ? "Tournament tracker" : "P · Pts · GD · W · L · D"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {isWorldCup
                ? `${leagueName} ${standings?.season ?? "2024"}: group standings plus Path A-D play-off progress, with live and finished score updates.`
                : `Official ${leagueName} league table: current points, goal difference, wins, draws and losses. Use with today&apos;s fixtures and form for bet builder stats.`}
            </p>
          </header>

          {!standings || !standings.tables.length ? (
            <div
              className="rounded-xl border border-neutral-200 bg-white p-10 text-center dark:border-neutral-800 dark:bg-neutral-900"
              role="region"
              aria-label="No standings"
            >
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Standings are not available for this league right now. Cup competitions (e.g. FA
                Cup, Scottish Cup) do not have a league table.
              </p>
              <NavLinkWithOverlay
                href={`/fixtures/${todayKey}`}
                className="mt-4 inline-block text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400"
              >
                View fixtures →
              </NavLinkWithOverlay>
            </div>
          ) : (
            <article aria-label={`${leagueName} league table`}>
              {isWorldCup ? (
                <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                    Play-off knockout round
                  </h2>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    16 teams are split into 4 mini play-off brackets. Each bracket has Semi 1, Semi 2, then a Final; unknown ties stay greyed out.
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Progress updates on refresh based on fixture status (pending, live, complete).
                  </p>
                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                    Quick view: {playoffPods.length} paths, {playoffPods.flatMap((p) => [p.semi1, p.semi2, p.final]).filter((s) => !s.isPlaceholder).length} known fixtures,{" "}
                    {playoffPods.flatMap((p) => [p.semi1, p.semi2, p.final]).filter((s) => isCompletedFixtureStatus(s.status)).length} completed.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {playoffPods.map((pod, podIdx) => (
                      <section
                        key={pod.id}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/40"
                      >
                        {(() => {
                          const semisCompleted = [pod.semi1, pod.semi2].filter((s) =>
                            isCompletedFixtureStatus(s.status),
                          ).length;
                          const finalCompleted = isCompletedFixtureStatus(pod.final.status);
                          const finalLive = isLiveFixtureStatus(pod.final.status);
                          const winner = getSlotWinner(pod.final);
                          const progressLabel = winner
                            ? `Winner: ${winner}`
                            : finalCompleted
                              ? "Final complete"
                              : finalLive
                                ? "Final live"
                                : semisCompleted === 2
                                  ? "Semis complete - final pending"
                                  : semisCompleted === 1
                                    ? "1/2 semis complete"
                                    : "Semis pending";
                          return (
                            <p className="mt-1 px-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                              {progressLabel}
                            </p>
                          );
                        })()}
                        <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                          Path {String.fromCharCode(65 + podIdx)}
                        </h3>
                        <ul className="mt-2 space-y-2">
                          {[
                            { label: "Semi 1", slot: pod.semi1 },
                            { label: "Semi 2", slot: pod.semi2 },
                            { label: "Final", slot: pod.final },
                          ].map(({ label, slot }) => (
                            <li
                              key={slot.id}
                              className={`rounded-md border px-2 py-2 ${
                                slot.isPlaceholder
                                  ? "border-neutral-200 bg-neutral-100 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500"
                                  : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
                              }`}
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                                {label}
                              </p>
                              {slot.kickoff ? (
                                <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                                  {formatTournamentKickoff(slot.kickoff)} · {slot.status}
                                </p>
                              ) : (
                                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                                  Awaiting fixture
                                </p>
                              )}
                              <p
                                className={`mt-1 text-xs font-medium ${
                                  slot.isPlaceholder
                                    ? "text-neutral-400 dark:text-neutral-500"
                                    : "text-neutral-900 dark:text-neutral-100"
                                }`}
                              >
                                {slot.homeTeam} vs {slot.awayTeam}
                              </p>
                              {slot.homeGoals != null && slot.awayGoals != null ? (
                                <p className="mt-0.5 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                                  Score: {slot.homeGoals}-{slot.awayGoals}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </section>
              ) : null}
              {isEuropeanKnockoutLeague ? (
                <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                    Knockout round tracker
                  </h2>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    Knockout ties from Round of 16 to Final. Round of 16, Quarter-finals and Semi-finals show both legs with aggregate score when available.
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Updates on refresh from warmed fixture status (pending, live, complete) and scorelines when available.
                  </p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    {knockoutRounds.map((round) => (
                      <section
                        key={round.label}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/40"
                      >
                        <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                          {round.label}
                        </h3>
                        <ul className="mt-2 space-y-2">
                          {round.ties.map((tie) => (
                            <li
                              key={tie.id}
                              className={`rounded-md border px-2 py-2 ${
                                tie.isPlaceholder
                                  ? "border-neutral-200 bg-neutral-100 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500"
                                  : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
                              }`}
                            >
                              <p
                                className={`text-xs font-medium ${
                                  tie.isPlaceholder
                                    ? "text-neutral-400 dark:text-neutral-500"
                                    : "text-neutral-900 dark:text-neutral-100"
                                }`}
                              >
                                {tie.teamA} vs {tie.teamB}
                              </p>
                              <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-[11px] dark:border-neutral-700 dark:bg-neutral-800/60">
                                <p className="font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                                  Leg 1
                                </p>
                                <p className="mt-0.5 text-neutral-600 dark:text-neutral-300">
                                  {tie.leg1.homeTeam} vs {tie.leg1.awayTeam}
                                </p>
                                <p className="mt-0.5 font-semibold text-neutral-800 dark:text-neutral-100">
                                  {tie.leg1.homeGoals != null && tie.leg1.awayGoals != null
                                    ? `${tie.leg1.homeGoals}-${tie.leg1.awayGoals}`
                                    : "TBD"}
                                </p>
                              </div>

                              {tie.leg2 ? (
                                <div className="mt-1.5 rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-[11px] dark:border-neutral-700 dark:bg-neutral-800/60">
                                  <p className="font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                                    Leg 2
                                  </p>
                                  <p className="mt-0.5 text-neutral-600 dark:text-neutral-300">
                                    {tie.leg2.homeTeam} vs {tie.leg2.awayTeam}
                                  </p>
                                  <p className="mt-0.5 font-semibold text-neutral-800 dark:text-neutral-100">
                                    {tie.leg2.homeGoals != null && tie.leg2.awayGoals != null
                                      ? `${tie.leg2.homeGoals}-${tie.leg2.awayGoals}`
                                      : "TBD"}
                                  </p>
                                </div>
                              ) : null}

                              {tie.aggregate ? (
                                <p className="mt-2 rounded bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                  {tie.aggregate}
                                </p>
                              ) : (
                                <p className="mt-2 rounded bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                                  Aggregate: TBD
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </section>
              ) : null}

              {standings.tables.map((table, idx) => (
                <section
                  key={table.group ?? idx}
                  className="mb-8 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                  aria-label={table.group ?? `${leagueName} standings`}
                >
                  {table.group ? (
                    <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
                      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                        {table.group}
                      </h2>
                    </div>
                  ) : null}
                  <div className="isolate overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-800/50">
                          <th className="sticky left-0 z-[1] w-8 min-w-[2rem] max-w-[2rem] bg-neutral-100 py-3 pl-2 pr-1 text-xs font-semibold uppercase tracking-wider text-neutral-500 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] dark:bg-neutral-800 dark:text-neutral-400 dark:shadow-[2px_0_4px_-1px_rgba(0,0,0,0.3)]">
                            #
                          </th>
                          <th className="sticky left-8 z-[1] w-24 max-w-[6rem] border-r border-neutral-200 bg-neutral-100 py-3 pl-1.5 pr-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:shadow-[2px_0_4px_-1px_rgba(0,0,0,0.3)]">
                            Team
                          </th>
                          <th className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            P
                          </th>
                          <th className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            Pts
                          </th>
                          <th className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            GD
                          </th>
                          <th className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            W
                          </th>
                          <th className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            L
                          </th>
                          <th className="py-3 pl-2 pr-4 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            D
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row) => {
                          const internalTeamId =
                            isTopLeagueForTeams && teamIdByApi
                              ? teamIdByApi.get(row.teamId)
                              : undefined;
                          const teamHref =
                            internalTeamId != null
                              ? `/teams/${makeTeamSlug(row.teamName)}`
                              : null;
                          return (
                            <tr
                              key={row.teamId}
                              className="group border-b border-neutral-100 transition-colors hover:bg-neutral-50/60 dark:border-neutral-800 dark:hover:bg-neutral-800/40"
                            >
                              <td className="sticky left-0 z-[1] w-8 min-w-[2rem] max-w-[2rem] bg-white py-2.5 pl-2 pr-1 font-medium text-neutral-600 transition-colors group-hover:bg-neutral-50/60 dark:bg-neutral-900 dark:text-neutral-400 dark:group-hover:bg-neutral-800/40">
                                {row.rank}
                              </td>
                              <td className="sticky left-8 z-[1] w-24 max-w-[6rem] border-r border-neutral-200 bg-white py-2.5 pl-1.5 pr-2 transition-colors group-hover:bg-neutral-50/60 dark:border-neutral-700 dark:bg-neutral-900 dark:group-hover:bg-neutral-800/40">
                                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                                  <CrestCell logo={row.logo} teamName={row.teamName} />
                                  {teamHref ? (
                                    <Link
                                      href={teamHref}
                                      className="min-h-[44px] min-w-0 flex-1 truncate font-medium text-neutral-900 underline-offset-2 hover:text-violet-600 hover:underline dark:text-neutral-50 dark:hover:text-violet-300 flex items-center -my-2.5 py-2.5 touch-manipulation"
                                      title={`${row.teamName} team stats`}
                                    >
                                      {row.teamName}
                                    </Link>
                                  ) : (
                                    <span
                                      className="min-w-0 flex-1 truncate font-medium text-neutral-900 dark:text-neutral-50"
                                      title={row.teamName}
                                    >
                                      {row.teamName}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-center text-neutral-700 dark:text-neutral-300">
                                {row.played}
                              </td>
                              <td className="py-2.5 px-2 text-center font-semibold text-neutral-900 dark:text-neutral-50">
                                {row.points}
                              </td>
                              <td
                                className={`py-2.5 px-2 text-center font-medium ${
                                  row.goalsDiff > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : row.goalsDiff < 0
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-neutral-500 dark:text-neutral-400"
                                }`}
                              >
                                {row.goalsDiff > 0 ? "+" : ""}
                                {row.goalsDiff}
                              </td>
                              <td className="py-2.5 px-2 text-center text-neutral-700 dark:text-neutral-300">
                                {row.win}
                              </td>
                              <td className="py-2.5 px-2 text-center text-neutral-700 dark:text-neutral-300">
                                {row.lose}
                              </td>
                              <td className="py-2.5 pl-2 pr-4 text-center text-neutral-700 dark:text-neutral-300">
                                {row.draw}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}

              {standings.updatedAt ? (
                <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
                  Table updated{" "}
                  {standings.updatedAt.toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  .
                </p>
              ) : null}

              <section
                className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                aria-label="Related links"
              >
                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  For match previews, team form and player stats, see{" "}
                  <NavLinkWithOverlay
                    href={`/fixtures/${todayKey}`}
                    className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                  >
                    today&apos;s fixtures
                  </NavLinkWithOverlay>
                  {" "}and the{" "}
                  <NavLinkWithOverlay
                    href={`/fixtures/${todayKey}/form`}
                    className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                  >
                    form table
                  </NavLinkWithOverlay>
                  .
                </div>
                <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  For this league only — last 5 and last 10 games, every team — open the{" "}
                  <NavLinkWithOverlay
                    href={`/leagues/${slug}/form`}
                    className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                    message="Loading league form…"
                  >
                    {leagueName} form table
                  </NavLinkWithOverlay>
                  .
                </div>
                <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  For league-wide per 90 stats (goals, corners and cards), see{" "}
                  <NavLinkWithOverlay
                    href={`/leagues/${slug}/stats`}
                    className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                    message="Loading league stats…"
                  >
                    {leagueName} stats hub
                  </NavLinkWithOverlay>
                  .
                </div>
                <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  For league market trends (BTTS, total goals, team corners and team cards), explore{" "}
                  <NavLinkWithOverlay
                    href={`/leagues/${slug}/markets/btts`}
                    className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                    message="Loading BTTS market stats…"
                  >
                    BTTS
                  </NavLinkWithOverlay>
                  {", "}
                  <NavLinkWithOverlay
                    href={`/leagues/${slug}/markets/total-goals`}
                    className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                    message="Loading total goals market stats…"
                  >
                    total goals
                  </NavLinkWithOverlay>
                  {", "}
                  <NavLinkWithOverlay
                    href={`/leagues/${slug}/markets/corners`}
                    className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                    message="Loading corners market stats…"
                  >
                    team corners
                  </NavLinkWithOverlay>
                  {" and "}
                  <NavLinkWithOverlay
                    href={`/leagues/${slug}/markets/cards`}
                    className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                    message="Loading cards market stats…"
                  >
                    team cards
                  </NavLinkWithOverlay>
                  {" market pages."}
                </div>
              </section>

              <section
                className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                aria-label="Frequently asked questions"
              >
                <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                  {isWorldCup
                    ? `Frequently asked questions about ${leagueName}`
                    : `Frequently asked questions about the ${leagueName} table`}
                </h2>
                <dl className="mt-3 space-y-4 text-sm">
                  {isWorldCup ? (
                    <>
                      <div>
                        <dt className="font-medium text-neutral-800 dark:text-neutral-200">
                          What does {leagueName} Path A-D mean?
                        </dt>
                        <dd className="mt-1 leading-snug text-neutral-600 dark:text-neutral-400">
                          Each path is a mini 4-team play-off: Semi 1 and Semi 2 feed into a path final, and the path winner qualifies.
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-neutral-800 dark:text-neutral-200">
                          How often does the play-off tracker update?
                        </dt>
                        <dd className="mt-1 leading-snug text-neutral-600 dark:text-neutral-400">
                          It updates from warmed fixture data, so statuses and scorelines move from pending to live to complete as matches are played.
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-neutral-800 dark:text-neutral-200">
                          Do stats and market pages populate before and during match week?
                        </dt>
                        <dd className="mt-1 leading-snug text-neutral-600 dark:text-neutral-400">
                          Yes. As upcoming qualification fixtures are pulled in and warmed, league stats and market pages start filling with international team data.
                        </dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt className="font-medium text-neutral-800 dark:text-neutral-200">
                          What is the current {leagueName} league table?
                        </dt>
                        <dd className="mt-1 leading-snug text-neutral-600 dark:text-neutral-400">
                          The {leagueName} league table shows the current standings for the {standings?.season ?? "current"} season: points, goal difference, wins, draws, losses and position for every team. Use it with today&apos;s fixtures and form for bet builder stats.
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-neutral-800 dark:text-neutral-200">
                          How often is the league table updated?
                        </dt>
                        <dd className="mt-1 leading-snug text-neutral-600 dark:text-neutral-400">
                          Standings are refreshed regularly from official sources. For match previews, team form and player stats, see today&apos;s fixtures and the form table on statsBuildr.
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-neutral-800 dark:text-neutral-200">
                          Where can I see team stats and form?
                        </dt>
                        <dd className="mt-1 leading-snug text-neutral-600 dark:text-neutral-400">
                          From this {leagueName} standings page you can use today&apos;s fixtures and the form table for bet builder analytics. Top-league team names in the table link to dedicated team stats pages.
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </section>
            </article>
          )}

          <div className="mt-6 flex justify-end">
            <ShareUrlButton className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700" />
          </div>
        </main>
      </div>
    </div>
  );
}

/** Generate static params for known standings leagues so paths are known at build time. */
export function generateStaticParams() {
  return Object.entries(STANDINGS_LEAGUE_SLUG_BY_ID).map(([, slug]) => ({ league: slug }));
}
