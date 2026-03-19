type IntentTitleArgs = {
  intent: string;
  subject?: string;
  timeframe?: string;
  keyStat?: string;
  context?: string;
};

/** Build intent-first SEO titles with consistent separators. */
export function buildIntentTitle({
  intent,
  subject,
  timeframe,
  keyStat,
  context,
}: IntentTitleArgs): string {
  const left = [intent, subject].filter(Boolean).join(" ");
  const segments = [left, timeframe, keyStat, context].filter(
    (s): s is string => Boolean(s && s.trim().length > 0),
  );
  return segments.join(" | ");
}

/** Keep meta descriptions within a snippet-friendly length. */
export function toSnippetDescription(
  parts: Array<string | null | undefined>,
  maxLength = 158,
): string {
  const full = parts
    .filter((p): p is string => Boolean(p && p.trim().length > 0))
    .map((p) => p.trim().replace(/\s+/g, " "))
    .join(" ");

  if (full.length <= maxLength) return full;

  const cut = full.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,:;.\-–—\s]+$/g, "");
  return `${trimmed}.`;
}

