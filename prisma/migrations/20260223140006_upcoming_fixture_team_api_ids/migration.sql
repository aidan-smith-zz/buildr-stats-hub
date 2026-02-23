/*
  Warnings:

  - Added the required column `awayTeamApiId` to the `UpcomingFixture` table without a default value. This is not possible if the table is not empty.
  - Added the required column `homeTeamApiId` to the `UpcomingFixture` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UpcomingFixture" ADD COLUMN     "awayTeamApiId" TEXT NOT NULL,
ADD COLUMN     "homeTeamApiId" TEXT NOT NULL;
