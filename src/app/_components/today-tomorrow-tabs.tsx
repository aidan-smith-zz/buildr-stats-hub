"use client";

import { useState } from "react";

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
          aria-controls="today-panel"
          id="today-tab"
          tabIndex={active === "today" ? 0 : -1}
          onClick={() => setActive("today")}
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
          aria-controls="tomorrow-panel"
          id="tomorrow-tab"
          tabIndex={active === "tomorrow" ? 0 : -1}
          onClick={() => setActive("tomorrow")}
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
        id={active === "tomorrow" ? "tomorrow-panel" : "today-panel"}
        aria-labelledby={active === "tomorrow" ? "tomorrow-tab" : "today-tab"}
        hidden={false}
      >
        {active === "tomorrow" ? tomorrowContent : todayContent}
      </div>
    </div>
  );
}
