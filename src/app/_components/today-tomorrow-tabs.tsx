"use client";

import { useState, useEffect } from "react";

const HASH_TODAY = "today";
const HASH_TOMORROW = "tomorrow";

function tabFromHash(): "today" | "tomorrow" {
  if (typeof window === "undefined") return "today";
  const hash = window.location.hash.slice(1).toLowerCase();
  return hash === HASH_TOMORROW ? "tomorrow" : "today";
}

type Props = {
  hasTomorrow: boolean;
  tomorrowContent: React.ReactNode;
  todayContent: React.ReactNode;
  tomorrowLabel?: string;
  todayLabel?: string;
};

export function TodayTomorrowTabs({
  hasTomorrow,
  tomorrowContent,
  todayContent,
  tomorrowLabel = "Tomorrow's fixtures",
  todayLabel = "Today's fixtures",
}: Props) {
  const [active, setActive] = useState<"tomorrow" | "today">("today");

  // Sync tab with URL hash on load and when hash changes (e.g. back button or manual edit). Initial state is "today" to match SSR and avoid hydration mismatch.
  useEffect(() => {
    if (!hasTomorrow) return;
    const sync = () => setActive(tabFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [hasTomorrow]);

  const setTab = (tab: "today" | "tomorrow") => {
    setActive(tab);
    const hash = tab === "tomorrow" ? `#${HASH_TOMORROW}` : `#${HASH_TODAY}`;
    if (typeof window !== "undefined" && window.location.hash !== hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    }
  };

  if (!hasTomorrow) {
    return <>{todayContent}</>;
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Switch between today and tomorrow"
        className="flex gap-0.5 rounded-xl border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-700 dark:bg-neutral-800/50"
      >
        <button
          type="button"
          role="tab"
          aria-selected={active === "today"}
          aria-controls="today"
          id="today-tab"
          tabIndex={active === "today" ? 0 : -1}
          onClick={() => setTab("today")}
          className={`min-w-0 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors sm:px-5 sm:py-3 sm:text-base ${
            active === "today"
              ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-50"
              : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
          }`}
        >
          {todayLabel}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "tomorrow"}
          aria-controls="tomorrow"
          id="tomorrow-tab"
          tabIndex={active === "tomorrow" ? 0 : -1}
          onClick={() => setTab("tomorrow")}
          className={`min-w-0 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors sm:px-5 sm:py-3 sm:text-base ${
            active === "tomorrow"
              ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-50"
              : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
          }`}
        >
          {tomorrowLabel}
        </button>
      </div>
      <div
        role="tabpanel"
        id="today"
        aria-labelledby="today-tab"
        hidden={active !== "today"}
        className={active !== "today" ? "sr-only" : undefined}
      >
        {todayContent}
      </div>
      <div
        role="tabpanel"
        id="tomorrow"
        aria-labelledby="tomorrow-tab"
        hidden={active !== "tomorrow"}
        className={active !== "tomorrow" ? "sr-only" : undefined}
      >
        {tomorrowContent}
      </div>
    </div>
  );
}
