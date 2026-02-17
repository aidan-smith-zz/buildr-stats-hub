-- CreateTable
CREATE TABLE "FixtureTeamStats" (
    "id" SERIAL NOT NULL,
    "fixtureId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "xg" DOUBLE PRECISION,
    "corners" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixtureTeamStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixtureTeamStats_fixtureId_teamId_key" ON "FixtureTeamStats"("fixtureId", "teamId");

-- CreateIndex
CREATE INDEX "FixtureTeamStats_fixtureId_idx" ON "FixtureTeamStats"("fixtureId");

-- AddForeignKey
ALTER TABLE "FixtureTeamStats" ADD CONSTRAINT "FixtureTeamStats_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureTeamStats" ADD CONSTRAINT "FixtureTeamStats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
