import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BurgerMenu } from "@/app/_components/burger-menu";
import { GoogleAnalytics } from "@/app/_components/google-analytics";
import { HomeLink } from "@/app/_components/home-link";
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
  keywords: ["football stats", "bet builder", "fixtures", "player statistics", "Premier League", "Championship"],
  icons: {
    icon: [
      { url: "/logo.png?v=2", type: "image/png", sizes: "32x32" },
      { url: "/logo.png?v=2", type: "image/png", sizes: "any" },
    ],
    apple: "/logo.png?v=2",
  },
  openGraph: {
    title: "Football Stats | Bet Builder Analytics",
    description: "Today's fixtures and player stats. See the numbers before you build your bet.",
    url: siteUrl,
    siteName: "statsBuildr",
    images: [{ url: "/logo.png?v=2", width: 512, height: 160, alt: "statsBuildr" }],
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Football Stats | Bet Builder Analytics",
    description: "Today's fixtures and player stats. See the numbers before you build your bet.",
    images: ["/logo.png?v=2"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <GoogleAnalytics />
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-black sm:px-6">
          <div className="mx-auto flex max-w-4xl items-center justify-between overflow-visible">
            <HomeLink />
            <BurgerMenu />
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
