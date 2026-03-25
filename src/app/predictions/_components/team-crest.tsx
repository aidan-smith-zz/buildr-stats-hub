/** Crest image for predictions cards; letter fallback when URL missing. */
export function PredictionTeamCrest({
  crestUrl,
  label,
  size = "md",
}: {
  crestUrl: string | null;
  label: string;
  size?: "sm" | "md";
}) {
  const px = size === "sm" ? 28 : 36;
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const text = size === "sm" ? "text-[10px]" : "text-xs";

  if (crestUrl) {
    return (
      <img
        src={crestUrl}
        alt=""
        width={px}
        height={px}
        className={`${box} flex-shrink-0 object-contain`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const initial = label.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span
      className={`inline-flex ${box} flex-shrink-0 items-center justify-center rounded-full bg-neutral-200 font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200 ${text}`}
      aria-hidden
    >
      {initial}
    </span>
  );
}
