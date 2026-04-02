import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Returns 429 for known non-search scraper / AI / SEO-tool user agents on expensive routes only.
 * Google crawlers are allowlisted so SEO is unaffected. Real browsers are never blocked.
 */

const TEAM_MARKETS_PATH = /^\/teams\/[^/]+\/markets\//i;
/** Match page and /live variant: /fixtures/YYYY-MM-DD/league/slug or .../slug/live */
const FIXTURE_MATCH_PATH =
  /^\/fixtures\/\d{4}-\d{2}-\d{2}\/[^/]+\/[^/]+(?:\/live)?\/?$/i;

/** Allow Google indexing & related crawlers (do not 429). */
function isGoogleFamilyCrawler(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return (
    ua.includes("googlebot") ||
    ua.includes("google-inspectiontool") ||
    ua.includes("googleother") ||
    ua.includes("mediapartners-google") ||
    ua.includes("adsbot-google") ||
    ua.includes("apis-google") ||
    ua.includes("feedfetcher-google") ||
    ua.includes("google-read-aloud") ||
    ua.includes("storebot-google")
  );
}

/** Curated: SEO tools, AI training crawlers, archives, aggressive bots — not major search engines. */
const BLOCKED_UA_SUBSTRINGS = [
  "ahrefsbot",
  "ahrefs",
  "semrushbot",
  "semrush",
  "mj12bot",
  "dotbot",
  "petalbot",
  "bytespider",
  "amazonbot",
  "ia_archiver",
  "gptbot",
  "chatgpt-user",
  "ccbot",
  "anthropic-ai",
  "claudebot",
  "claude-web",
  "dataforseo",
  "serpstat",
  "screaming frog",
  "screamingfrog",
  "sitebulb",
  "blexbot",
  "megaindex",
] as const;

function isBlockedScraperUa(userAgent: string | null): boolean {
  if (!userAgent) return false;
  if (isGoogleFamilyCrawler(userAgent)) return false;
  const ua = userAgent.toLowerCase();
  return BLOCKED_UA_SUBSTRINGS.some((s) => ua.includes(s));
}

function isTargetPath(pathname: string): boolean {
  if (TEAM_MARKETS_PATH.test(pathname)) return true;
  if (FIXTURE_MATCH_PATH.test(pathname)) return true;
  return false;
}

export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }
  const pathname = request.nextUrl.pathname;
  if (!isTargetPath(pathname)) {
    return NextResponse.next();
  }
  const ua = request.headers.get("user-agent");
  if (!isBlockedScraperUa(ua)) {
    return NextResponse.next();
  }
  return new NextResponse("Too Many Requests", {
    status: 429,
    headers: {
      "Retry-After": "86400",
      "Cache-Control": "private, no-store",
    },
  });
}

export const config = {
  matcher: ["/teams/:path*", "/fixtures/:path*"],
};
