-- CreateTable
CREATE TABLE "MatchdayInsightsCache" (
    "dateKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchdayInsightsCache_pkey" PRIMARY KEY ("dateKey")
);
