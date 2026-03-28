-- Penalty shootout totals (API-Football score.penalty) for PEN-decided matches
ALTER TABLE "LiveScoreCache" ADD COLUMN "penaltyHome" INTEGER;
ALTER TABLE "LiveScoreCache" ADD COLUMN "penaltyAway" INTEGER;
