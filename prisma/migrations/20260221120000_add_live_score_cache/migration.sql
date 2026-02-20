-- CreateTable
CREATE TABLE "LiveScoreCache" (
    "fixtureId" INTEGER NOT NULL,
    "homeGoals" INTEGER NOT NULL DEFAULT 0,
    "awayGoals" INTEGER NOT NULL DEFAULT 0,
    "elapsedMinutes" INTEGER,
    "statusShort" TEXT NOT NULL DEFAULT '?',
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveScoreCache_pkey" PRIMARY KEY ("fixtureId")
);

-- AddForeignKey
ALTER TABLE "LiveScoreCache" ADD CONSTRAINT "LiveScoreCache_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
