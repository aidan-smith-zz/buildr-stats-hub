import { buildPredictionMarketMetadata, PredictionMarketPage } from "@/app/predictions/[date]/market-page-layout";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return buildPredictionMarketMetadata(date, "cards");
}

export default async function CardsPredictionsPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <PredictionMarketPage rawDate={date} market="cards" />;
}
