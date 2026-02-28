import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BurgerMenu } from "@/app/_components/burger-menu";
import { GoogleAnalytics } from "@/app/_components/google-analytics";
import { HomeLink } from "@/app/_components/home-link";
import { getFixturesForDateFromDbOnly } from "@/lib/fixturesService";
import { tomorrowDateKey } from "@/lib/slugs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Football Stats | Bet Builder Analytics",
  description: "View today's football fixtures and player statistics. See goals, assists, tackles and more before you build your bet.",
  keywords: ["football stats", "bet builder", "fixtures", "player statistics", "Premier League", "Championship", "xG", "corners", "cards", "match preview", "statsBuildr"],
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/stats-buildr.png", type: "image/png", sizes: "32x32" },
      { url: "/stats-buildr.png", type: "image/png", sizes: "any" },
    ],
    apple: "/stats-buildr.png",
  },
  openGraph: {
    title: "Football Stats | Bet Builder Analytics",
    description: "Today's fixtures and player stats. See the numbers before you build your bet.",
    url: siteUrl,
    siteName: "statsBuildr",
    images: [{ url: "/stats-buildr.png", width: 512, height: 160, alt: "statsBuildr – Football stats and bet builder analytics" }],
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Football Stats | Bet Builder Analytics",
    description: "Today's fixtures and player stats. See the numbers before you build your bet.",
    images: ["/stats-buildr.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tomorrowKey = tomorrowDateKey();
  const tomorrowFixtures = await getFixturesForDateFromDbOnly(tomorrowKey);
  const tomorrowFormHref =
    tomorrowFixtures.length > 0 ? `/fixtures/${tomorrowKey}/form` : undefined;

  const webSiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "statsBuildr",
    url: siteUrl,
    description: "Football stats and bet builder analytics. Today's fixtures, player and team statistics, xG, corners, cards and AI match insights.",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/fixtures/{date}` },
      "query-input": "required name=date",
    },
  };

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
        />
        <GoogleAnalytics />
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-black sm:px-6">
          <div className="mx-auto flex max-w-4xl items-center justify-between overflow-visible">
            <HomeLink />
            <BurgerMenu tomorrowFormHref={tomorrowFormHref} />
          </div>
        </header>
        {process.env.NEXT_PUBLIC_CTA_URL ? (
          <a
            href={process.env.NEXT_PUBLIC_CTA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block border-b border-neutral-200 bg-neutral-100 px-4 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Use these stats to build your bet →
          </a>
        ) : null}
        {children}
      </body>
    </html>
  );
}
