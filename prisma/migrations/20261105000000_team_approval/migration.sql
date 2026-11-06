-- Records who vetted and approved a team to play. Approval locks the team's list.

-- AlterTable
ALTER TABLE "tournament_teams" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT;
