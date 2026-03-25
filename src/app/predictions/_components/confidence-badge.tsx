import type { ConfidenceLevel } from "@/lib/predictionsService";

export function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  const styles =
    confidence === "High"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : confidence === "Medium"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`}>
      {confidence} confidence
    </span>
  );
}
