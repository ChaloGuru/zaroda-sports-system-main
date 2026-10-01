-- AlterTable
ALTER TABLE "tournament_teams" ADD COLUMN     "schoolId" TEXT;

-- CreateIndex
CREATE INDEX "tournament_teams_schoolId_idx" ON "tournament_teams"("schoolId");

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Link existing teams to the championship school they're named after - in a
-- Primary/JS championship, the school's entry matching the team's game level.
UPDATE "tournament_teams" t
SET "schoolId" = s."id"
FROM "championship_schools" cs
JOIN "schools" s ON s."id" = cs."schoolId",
     "games" g
WHERE g."id" = t."gameId"
  AND cs."championshipId" = t."championshipId"
  AND lower(trim(s."name")) = lower(trim(t."name"))
  AND (s."schoolLevel" IS NULL OR s."schoolLevel" = g."schoolLevel");
