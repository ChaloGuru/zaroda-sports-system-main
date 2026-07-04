-- AlterTable
ALTER TABLE "tournament_teams" ADD COLUMN     "promotedFromTeamId" TEXT;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_promotedFromTeamId_fkey" FOREIGN KEY ("promotedFromTeamId") REFERENCES "tournament_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
