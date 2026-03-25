import { buildPredictionMarketMetadata, PredictionMarketPage } from "@/app/predictions/[date]/market-page-layout";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return buildPredictionMarketMetadata(date, "corners");
}

export default async function CornersPredictionsPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <PredictionMarketPage rawDate={date} market="corners" />;
}
