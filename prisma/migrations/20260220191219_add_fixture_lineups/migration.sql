-- CreateEnum
CREATE TYPE "LineupStatus" AS ENUM ('starting', 'substitute');

-- CreateTable
CREATE TABLE "FixtureLineup" (
    "id" SERIAL NOT NULL,
    "fixtureId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "lineupStatus" "LineupStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixtureLineup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixtureLineup_fixtureId_idx" ON "FixtureLineup"("fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "FixtureLineup_fixtureId_teamId_playerId_key" ON "FixtureLineup"("fixtureId", "teamId", "playerId");

-- AddForeignKey
ALTER TABLE "FixtureLineup" ADD CONSTRAINT "FixtureLineup_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureLineup" ADD CONSTRAINT "FixtureLineup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureLineup" ADD CONSTRAINT "FixtureLineup_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
