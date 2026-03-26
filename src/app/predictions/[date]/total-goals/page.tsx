import { buildPredictionMarketMetadata, PredictionMarketPage } from "@/app/predictions/[date]/market-page-layout";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return buildPredictionMarketMetadata(date, "total-goals");
}

export default async function TotalGoalsPredictionsPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <PredictionMarketPage rawDate={date} market="total-goals" />;
}
