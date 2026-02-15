import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Football Stats | Bet Builder Analytics",
  description: "View today's football fixtures and player statistics",
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
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-neutral-800 dark:bg-neutral-950/95 dark:supports-[backdrop-filter]:bg-neutral-950/80 sm:px-6">
          <div className="mx-auto flex max-w-4xl items-center overflow-visible">
            <Image
              src="/logo.png"
              alt="statsBuilder"
              width={140}
              height={44}
              className="h-9 w-auto shrink-0 object-contain sm:h-10 dark:invert dark:[mix-blend-mode:screen]"
              priority
            />
            <span className="ml-2 shrink-0 text-base font-medium tracking-tight text-neutral-800 dark:text-neutral-100 sm:text-lg">
              statsBuilder
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
