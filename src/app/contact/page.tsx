import type { Metadata } from "next";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

const contactJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact statsBuildr",
  url: `${siteUrl}/contact`,
  about: {
    "@type": "Organization",
    name: "statsBuildr",
    url: siteUrl,
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "Support",
      email: "statsbuildr@gmail.com",
      availableLanguage: ["en-GB", "en"],
    },
  ],
  sameAs: ["https://www.instagram.com/statsbuildr"],
};

export const metadata: Metadata = {
  title: "Contact statsBuildr | Football stats & bet builder support",
  description:
    "Contact statsBuildr with questions, feedback or partnership ideas. Get in touch by email or Instagram about football stats, bet builder tools and site features.",
  alternates: { canonical: `${siteUrl}/contact` },
  openGraph: {
    title: "Contact statsBuildr | Football stats & bet builder support",
    description:
      "Get in touch with statsBuildr about football stats, bet builder features, feedback and partnerships.",
    url: `${siteUrl}/contact`,
    siteName: "statsBuildr",
    type: "website",
    images: [
      {
        url: `${siteUrl}/stats-buildr.png`,
        width: 512,
        height: 160,
        alt: "statsBuildr – Football stats for bet builders",
      },
    ],
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact statsBuildr | Football stats & bet builder support",
    description:
      "Email or message statsBuildr with questions, feedback or partnership ideas.",
    images: [`${siteUrl}/stats-buildr.png`],
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
      />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6">
          <NavLinkWithOverlay
            href="/"
            className="text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            ← Back to today&apos;s fixtures
          </NavLinkWithOverlay>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <img
            src="/stats-buildr-mini.png"
            alt="statsBuildr"
            className="h-10 w-10 rounded-full shadow-md sm:h-11 sm:w-11"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
              Contact <span className="font-semibold">stats</span>Buildr
            </h1>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500 sm:text-[13px]">
              Questions, feedback and partnerships
            </p>
          </div>
        </div>

        <section className="space-y-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <p>
            We built <span className="font-semibold">stats</span>Buildr for people who care about the
            numbers behind their football bet builders. If you have a question about how something
            works, want to report an issue or have ideas for new tools, we&apos;d love to hear from
            you.
          </p>
          <p>
            The fastest way to reach us is by email. We read every message and prioritise anything
            related to data accuracy, site reliability and new product ideas.
          </p>
        </section>

        <section className="mt-8 space-y-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            How to contact us
          </h2>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  Email
                </dt>
                <dd>
                  <a
                    href="mailto:statsbuildr@gmail.com"
                    className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
                  >
                    statsbuildr@gmail.com
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  Instagram
                </dt>
                <dd>
                  <a
                    href="https://www.instagram.com/statsbuildr"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
                  >
                    @statsbuildr
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            What to get in touch about
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium">Product feedback</span> on the match pages, team stats,
              league markets or AI insights.
            </li>
            <li>
              <span className="font-medium">Bugs or data issues</span> where fixtures, odds‑style
              stats or markets don&apos;t look right.
            </li>
            <li>
              <span className="font-medium">Partnerships and collaborations</span> around football
              content, tools or analytics.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            Next steps while you wait
          </h2>
          <p>
            While we review your message, you can keep exploring today&apos;s fixtures, upcoming games
            and team or league stats. <span className="font-semibold">stats</span>Buildr is updated
            throughout the day as matches finish and new data is warmed.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <NavLinkWithOverlay
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              View today&apos;s fixtures →
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href="/fixtures/upcoming"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-sky-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-emerald-400"
            >
              Upcoming fixtures (14 days) →
            </NavLinkWithOverlay>
          </div>
        </section>
      </main>
    </div>
  );
}

