/**
 * True for `/fixtures/{YYYY-MM-DD}/{league}/{match}` and optional `/live` suffix.
 * Excludes date hubs (`/fixtures/{date}/form`, etc.) and aliases like `/fixtures/today/...`.
 */
export function isDeepFixtureMatchHref(href: string): boolean {
  let pathname = href.trim();
  if (!pathname) return false;
  const q = pathname.indexOf("?");
  if (q !== -1) pathname = pathname.slice(0, q);
  const hash = pathname.indexOf("#");
  if (hash !== -1) pathname = pathname.slice(0, hash);
  if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return false;
    }
  }
  if (!pathname.startsWith("/")) return false;
  return /^\/fixtures\/\d{4}-\d{2}-\d{2}\/[^/]+\/[^/]+(?:\/live)?\/?$/.test(pathname);
}

/** Ensures `nofollow` on internal links to deep match URLs (crawl-hint); passes through other `rel` tokens. */
export function relWithNofollowForDeepFixtureHref(href: string, rel?: string): string | undefined {
  if (!isDeepFixtureMatchHref(href)) {
    return rel?.trim() || undefined;
  }
  const existing = (rel ?? "").trim();
  if (/\bnofollow\b/i.test(existing)) {
    return existing || undefined;
  }
  return existing ? `${existing} nofollow` : "nofollow";
}
