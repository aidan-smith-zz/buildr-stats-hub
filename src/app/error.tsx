"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error.message, error.digest);
  }, [error]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
          We couldn’t load the page. This is often due to a database or API connection issue.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
