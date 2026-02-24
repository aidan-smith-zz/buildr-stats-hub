"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NavigationLoadingOverlay } from "@/app/_components/navigation-loading-overlay";

type Props = {
  className?: string;
};

export function RefreshInsightsButton({ className }: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    router.refresh();
    // Keep overlay visible until refresh completes (Next.js doesn't expose a promise; use a minimum duration)
    setTimeout(() => setRefreshing(false), 1500);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className={className}
        aria-label="Refresh insights"
      >
        {refreshing ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            Refreshing…
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <RefreshIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Refresh insights
          </span>
        )}
      </button>
      {refreshing && (
        <NavigationLoadingOverlay message="Refreshing insights…" italic={false} />
      )}
    </>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
