-- CreateTable
CREATE TABLE "LeagueStandingsCache" (
    "leagueId" INTEGER NOT NULL,
    "season" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueStandingsCache_pkey" PRIMARY KEY ("leagueId","season")
);
