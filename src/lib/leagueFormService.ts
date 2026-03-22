import { unstable_cache } from "next/cache";
import { getLeagueFormPageData } from "@/lib/insightsService";

/** Long-lived ISR-style cache (24h), aligned with other league hub loaders. */
export const getCachedLeagueFormPageData = unstable_cache(
  async (leagueId: number) => getLeagueFormPageData(leagueId),
  ["league-form-page"],
  {
    revalidate: 60 * 60 * 24, // 24 hours
  },
);
