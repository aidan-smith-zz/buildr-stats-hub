import type { Metadata } from "next";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { toSnippetDescription } from "@/lib/seoMetadata";
import { todayDateKey, tomorrowDateKey } from "@/lib/slugs";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

export async function generateMetadata(): Promise<Metadata> {
  const title =
    "Football predictions & betting tips | BTTS, goals, corners, cards | statsBuildr";
  const description = toSnippetDescription([
    "Football predictions for today and tomorrow: BTTS (both teams to score), total goals, corners and cards.",
    "Built from each team’s last 10 matches using warmed stats on statsBuildr — confidence ratings and line likelihoods.",
  ]);
  const canonical = `${BASE_URL}/predictions`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    keywords: [
      "football predictions",
      "BTTS predictions today",
      "both teams to score predictions",
      "over 2.5 goals tips",
      "corners betting tips",
      "cards predictions football",
      "statsBuildr predictions",
    ],
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "statsBuildr",
      type: "website",
      locale: "en_GB",
      images: [
        {
          url: `${BASE_URL}/stats-buildr.png`,
          width: 512,
          height: 160,
          alt: "statsBuildr football predictions — BTTS, goals, corners and cards",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/stats-buildr.png`],
    },
  };
}

export default function PredictionsHubPage() {
  const today = todayDateKey();
  const tomorrow = tomorrowDateKey();

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Football predictions & betting tips | statsBuildr",
    description:
      "Daily football predictions hub for BTTS, total goals, corners and cards using last-10 form from warmed data.",
    url: `${BASE_URL}/predictions`,
    isPartOf: { "@type": "WebSite", name: "statsBuildr", url: BASE_URL },
  };

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          statsBuildr · Predictions
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-[1.65rem]">
          Football predictions &amp; betting tips — BTTS, goals, corners &amp; cards
        </h1>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          <p>
            Compare <strong>today</strong> and <strong>tomorrow</strong> fixtures with market-by-market angles: both teams to
            score (BTTS), over/under goals lines, corner counts and booking trends. Every signal uses each side&apos;s{" "}
            <strong>last 10</strong> matches from our warmed fixture cache — no guesswork, just form.
          </p>
          <p>
            Pick a date below to open the full hub with top picks, then drill into BTTS, total goals, corners or cards for
            that day only.
          </p>
        </div>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <NavLinkWithOverlay href={`/predictions/${today}`} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm hover:border-violet-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-violet-500/60">
          <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Today</p>
          <h2 className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Today&apos;s football predictions
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            All markets for today&apos;s schedule — BTTS YES/NO, goals lines, corners and cards with confidence tiers.
          </p>
        </NavLinkWithOverlay>
        <NavLinkWithOverlay href={`/predictions/${tomorrow}`} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm hover:border-violet-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-violet-500/60">
          <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Tomorrow</p>
          <h2 className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Tomorrow&apos;s football predictions
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Plan ahead with the same markets and last-10 data before matchday — ideal for accas and bet builder research.
          </p>
        </NavLinkWithOverlay>
      </section>
    </main>
  );
}
