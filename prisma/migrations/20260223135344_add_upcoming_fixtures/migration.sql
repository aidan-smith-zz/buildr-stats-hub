-- CreateTable
CREATE TABLE "UpcomingFixture" (
    "id" SERIAL NOT NULL,
    "dateKey" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "league" TEXT,
    "leagueId" INTEGER,
    "homeTeamName" TEXT NOT NULL,
    "homeTeamShortName" TEXT,
    "awayTeamName" TEXT NOT NULL,
    "awayTeamShortName" TEXT,
    "apiFixtureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpcomingFixture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UpcomingFixture_dateKey_idx" ON "UpcomingFixture"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "UpcomingFixture_dateKey_apiFixtureId_key" ON "UpcomingFixture"("dateKey", "apiFixtureId");
