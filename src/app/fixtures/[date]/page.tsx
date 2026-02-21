import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { todayDateKey } from "@/lib/slugs";
import { TodayFixturesList } from "@/app/_components/today-fixtures-list";

export const dynamic = "force-dynamic";

export default async function FixturesDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await params;
  const now = new Date();
  const fixtures = await getOrRefreshTodayFixtures(now);
  const todayKey = todayDateKey();
  return <TodayFixturesList fixtures={fixtures} showHero todayKey={todayKey} />;
}
