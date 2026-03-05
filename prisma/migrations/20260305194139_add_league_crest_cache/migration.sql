-- CreateTable
CREATE TABLE "LeagueCrestCache" (
    "leagueId" INTEGER NOT NULL,
    "crestUrl" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueCrestCache_pkey" PRIMARY KEY ("leagueId")
);
