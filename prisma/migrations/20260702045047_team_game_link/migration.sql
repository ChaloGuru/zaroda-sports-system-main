-- AlterTable
ALTER TABLE "tournament_teams" ADD COLUMN     "gameId" TEXT,
ALTER COLUMN "teamCode" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

