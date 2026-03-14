"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Today's date YYYY-MM-DD (Europe/London) for AI insights URL */
function todayDateKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

type BurgerMenuProps = {
  /** When set, show "Tomorrow's form" link (only after tomorrow's fixtures are warmed). */
  tomorrowFormHref?: string;
};

const linkClass =
  "block px-4 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800";
const sectionLabelClass =
  "px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500";

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

  const closeMenu = () => setOpen(false);

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
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <p className={sectionLabelClass}>Today</p>
          <Link href="/" onClick={closeMenu} className={linkClass} role="menuitem">
            Home
          </Link>
          <p className={sectionLabelClass}>Form table</p>
          <Link href={formHref} onClick={closeMenu} className={linkClass} role="menuitem">
            Today
          </Link>
          {tomorrowFormHref ? (
            <Link
              href={tomorrowFormHref}
              onClick={closeMenu}
              className={linkClass}
              role="menuitem"
            >
              Tomorrow
            </Link>
          ) : null}
          <p className={sectionLabelClass}>Insights</p>
          <Link
            href={insightsHref}
            onClick={closeMenu}
            className={linkClass}
            role="menuitem"
          >
            AI insights
          </Link>
          <Link
            href={matchdayInsightsHref}
            onClick={closeMenu}
            className={linkClass}
            role="menuitem"
          >
            Matchday insights
          </Link>
          <p className={sectionLabelClass}>Leagues</p>
          <Link href="/leagues/all" onClick={closeMenu} className={linkClass} role="menuitem">
            All leagues
          </Link>
          <Link href="/teams/all" onClick={closeMenu} className={linkClass} role="menuitem">
            All teams
          </Link>

          <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />
          <p className={sectionLabelClass}>Fixtures</p>
          <Link
            href="/fixtures/live"
            onClick={closeMenu}
            className="flex items-center gap-2 px-4 py-2 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
            role="menuitem"
          >
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500 animate-pulse"
              aria-hidden
            />
            Live
          </Link>
          <Link
            href="/fixtures/upcoming"
            onClick={closeMenu}
            className={linkClass}
            role="menuitem"
          >
            Upcoming (14 days)
          </Link>
          <Link
            href="/fixtures/past"
            onClick={closeMenu}
            className={linkClass}
            role="menuitem"
          >
            Past (14 days)
          </Link>

          <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />
          <Link href="/about" onClick={closeMenu} className={linkClass} role="menuitem">
            About <span className="font-semibold">stats</span>Buildr
          </Link>
          <Link href="/contact" onClick={closeMenu} className={linkClass} role="menuitem">
            Contact <span className="font-semibold">stats</span>Buildr
          </Link>
        </nav>
      )}
    </div>
  );
}
