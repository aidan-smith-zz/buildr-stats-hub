"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";

/** Today's date YYYY-MM-DD (Europe/London) for AI insights URL */
function todayDateKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

type BurgerMenuProps = {
  /** When set, show "Tomorrow's form" link (only after tomorrow's fixtures are warmed). */
  tomorrowFormHref?: string;
};

export function BurgerMenu({ tomorrowFormHref }: BurgerMenuProps = {}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClickOutside = () => setOpen(false);
    document.addEventListener("keydown", onEscape);
    document.body.addEventListener("click", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.removeEventListener("click", onClickOutside);
    };
  }, [open]);

  const dateKey = todayDateKey();
  const insightsHref = `/fixtures/${dateKey}/ai-insights`;
  const formHref = `/fixtures/${dateKey}/form`;
  const matchdayInsightsHref = `/fixtures/${dateKey}/matchday-insights`;

  const handleMenuClick = () => {
    setOpen(false);
  };

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <svg
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {open && (
        <nav
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <NavLinkWithOverlay
            href="/"
            onClick={handleMenuClick}
            message="Building your Stats"
            italic
            className="block px-4 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Home
          </NavLinkWithOverlay>
          <NavLinkWithOverlay
            href={formHref}
            onClick={handleMenuClick}
            message="Building your Stats"
            italic
            className="block px-4 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Form
          </NavLinkWithOverlay>
          {tomorrowFormHref ? (
            <NavLinkWithOverlay
              href={tomorrowFormHref}
              onClick={handleMenuClick}
              message="Building your Stats"
              italic
              className="block px-4 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Tomorrow&apos;s form
            </NavLinkWithOverlay>
          ) : null}
          <NavLinkWithOverlay
            href={matchdayInsightsHref}
            onClick={handleMenuClick}
            message="Building your Stats"
            italic
            className="block px-4 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Matchday insights
          </NavLinkWithOverlay>
          <NavLinkWithOverlay
            href="/fixtures/upcoming"
            onClick={handleMenuClick}
            message="Building your Stats"
            italic
            className="block px-4 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Upcoming fixtures
          </NavLinkWithOverlay>
          <NavLinkWithOverlay
            href={insightsHref}
            onClick={handleMenuClick}
            message="Building your Stats"
            italic
            className="block px-4 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            AI insights
          </NavLinkWithOverlay>
          <NavLinkWithOverlay
            href="/about"
            onClick={handleMenuClick}
            message="Building your Stats"
            italic
            className="block px-4 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            What is statsBuildr?
          </NavLinkWithOverlay>
        </nav>
      )}
    </div>
  );
}
