-- CreateTable
CREATE TABLE "TeamFixtureCache" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "season" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "apiFixtureId" TEXT NOT NULL,
    "fixtureDate" TIMESTAMP(3) NOT NULL,
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "xg" DOUBLE PRECISION,
    "corners" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamFixtureCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamFixtureCache_teamId_season_league_apiFixtureId_key" ON "TeamFixtureCache"("teamId", "season", "league", "apiFixtureId");

-- CreateIndex
CREATE INDEX "TeamFixtureCache_teamId_season_league_idx" ON "TeamFixtureCache"("teamId", "season", "league");

-- AddForeignKey
ALTER TABLE "TeamFixtureCache" ADD CONSTRAINT "TeamFixtureCache_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
