import type { Metadata } from "next";
import { getFixturesForDateFromDbOnly, getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { withPoolRetry } from "@/lib/poolRetry";
import { leagueToSlug, matchSlug, todayDateKey, tomorrowDateKey } from "@/lib/slugs";
import { TodayFixturesList } from "@/app/_components/today-fixtures-list";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "statsBuildr",
  url: siteUrl,
  logo: `${siteUrl}/stats-buildr.png`,
};

export const metadata: Metadata = {
  title: "Today's Football Fixtures & Player Stats | Bet Builder Analytics",
  description:
    "Today's football fixtures with team and player statistics: goals, assists, xG, corners, cards per 90. Build your bet with data-driven match insights.",
  alternates: { canonical: siteUrl },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Today's Football Fixtures & Player Stats | Bet Builder Analytics",
    description:
      "Today's football fixtures with team and player statistics: goals, assists, xG, corners, cards per 90. Build your bet with data-driven match insights.",
    url: siteUrl,
    siteName: "statsBuildr",
    images: [{ url: "/stats-buildr.png", width: 512, height: 160, alt: "statsBuildr – Football stats and bet builder analytics" }],
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Today's Football Fixtures & Player Stats | Bet Builder Analytics",
    description:
      "Today's football fixtures with team and player statistics: goals, assists, xG, corners, cards per 90. Build your bet with data-driven match insights.",
    images: ["/stats-buildr.png"],
  },
};

/** Returns a user-safe message and whether to show the config/setup hints. Internal errors (e.g. EPERM, Prisma) are never exposed. */
function getFixtureErrorDisplay(err: unknown): { message: string; showConfigHints: boolean } {
  const raw = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
  const prismaCode = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
  const isPoolTimeout = prismaCode === "P2024" || prismaCode === "P2028";
  const isInternal =
    code === "EPERM" ||
    code === "EACCES" ||
    isPoolTimeout ||
    /chmod|query-engine|\.prisma|node_modules.*prisma|\/var\/task\//i.test(raw);
  if (isInternal) {
    return {
      message: isPoolTimeout
        ? "The server is busy. Please try again in a moment."
        : "Something went wrong loading fixtures. Please try again in a moment.",
      showConfigHints: false,
    };
  }
  const isMissingLeagueId =
    typeof raw === "string" && raw.includes("leagueId") && raw.includes("does not exist");
  const hasApiReference = typeof raw === "string" && /\bapi\b|plan limitation|rate limit/i.test(raw);
  const safeMessage = hasApiReference
    ? "Something went wrong loading fixtures. Please try again later."
    : raw || "Could not load fixtures.";
  return {
    message: isMissingLeagueId ? raw : safeMessage,
    showConfigHints: true,
  };
}

export default async function Home() {
  try {
    const now = new Date();
    const todayKey = todayDateKey();
    const tomorrowKey = tomorrowDateKey();
    const [fixtures, tomorrowFixtures] = await withPoolRetry(() =>
      Promise.all([
        getOrRefreshTodayFixtures(now),
        getFixturesForDateFromDbOnly(tomorrowKey),
      ]),
    );

    const itemListElements =
      fixtures?.length > 0
        ? fixtures.map((f, index) => {
            const home = f.homeTeam.shortName ?? f.homeTeam.name;
            const away = f.awayTeam.shortName ?? f.awayTeam.name;
            const leagueSlug = leagueToSlug(f.league);
            const match = matchSlug(home, away);
            return {
              "@type": "ListItem",
              position: index + 1,
              url: `${siteUrl}/fixtures/${todayKey}/${leagueSlug}/${match}`,
              name: `${home} vs ${away}${f.league ? ` – ${f.league}` : ""}`,
            };
          })
        : [];

    const itemListJsonLd =
      itemListElements.length > 0
        ? {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Today's football fixtures",
            itemListOrder: "http://schema.org/ItemListOrderAscending",
            numberOfItems: itemListElements.length,
            itemListElement: itemListElements,
          }
        : null;

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {itemListJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
          />
        ) : null}
        <TodayFixturesList
          fixtures={fixtures}
          showHero
          todayKey={todayKey}
          tomorrowFixtures={tomorrowFixtures}
          tomorrowKey={tomorrowKey}
        />
      </>
    );
  } catch (err) {
    const { message, showConfigHints } = getFixtureErrorDisplay(err);
    const isMissingLeagueId =
      typeof message === "string" && message.includes("leagueId") && message.includes("does not exist");
    console.error("[Home] Failed to load fixtures:", err);
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Could not load fixtures
            </p>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
              {message}
            </p>
            {showConfigHints && isMissingLeagueId ? (
              <div className="mt-4 rounded border border-amber-300 bg-amber-100/50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
                <p className="mb-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                  Fix: add the missing column in your database
                </p>
                <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">
                  In Supabase: SQL Editor → New query → paste and run:
                </p>
                <pre className="overflow-x-auto rounded bg-amber-200/80 p-3 text-left text-xs dark:bg-amber-900/40">
                  {`ALTER TABLE "Fixture" ADD COLUMN IF NOT EXISTS "leagueId" INTEGER;`}
                </pre>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  Then refresh this page.
                </p>
              </div>
            ) : showConfigHints ? (
              <ul className="mt-4 list-inside list-disc text-left text-sm text-amber-800 dark:text-amber-300">
                <li><strong>Local:</strong> In your <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">.env</code> file, set <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">DATABASE_URL</code>, <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">FOOTBALL_API_BASE_URL</code> and <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">FOOTBALL_API_KEY</code>. Use the direct Postgres URL (port 5432) or your pooler URL if you have one.</li>
                <li><strong>Vercel:</strong> Set the same env vars in Project → Settings → Environment Variables. Use the Supabase pooler (port 6543) and append <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">?pgbouncer=true</code> to <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">DATABASE_URL</code>. Do not add connection_limit=1.</li>
                <li>URL-encode the password in <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">DATABASE_URL</code> if it contains special characters.</li>
              </ul>
            ) : (
              <p className="mt-4 text-sm text-amber-800 dark:text-amber-300">
                If this keeps happening, check your deployment logs or try again later.
              </p>
            )}
          </div>
        </main>
      </div>
    );
  }
}
