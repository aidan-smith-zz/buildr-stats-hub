import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { TodayFixturesList } from "@/app/_components/today-fixtures-list";

export const dynamic = "force-dynamic";

export default async function FixturesDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await params;
  const fixtures = await getOrRefreshTodayFixtures(new Date());
  return <TodayFixturesList fixtures={fixtures} showHero />;
}
