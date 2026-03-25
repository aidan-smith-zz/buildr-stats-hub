import { buildPredictionMarketMetadata, PredictionMarketPage } from "@/app/predictions/[date]/market-page-layout";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return buildPredictionMarketMetadata(date, "btts");
}

export default async function BttsPredictionsPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <PredictionMarketPage rawDate={date} market="btts" />;
}
