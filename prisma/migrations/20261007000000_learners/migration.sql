-- Learners: who a school's athlete is (photo, birth certificate entry number, date of birth, one
-- bib), separate from their event entries, so one learner can enter several
-- events and officials can check identity in the call room.

-- CreateTable
CREATE TABLE "learners" (
    "id" TEXT NOT NULL,
    "championshipId" TEXT NOT NULL,
    "schoolId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "birthCertNumber" TEXT,
    "bibNumber" INTEGER NOT NULL,
    "photo" BYTEA,
    "photoUpdatedAt" TIMESTAMP(3),
    "promotedFromLearnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learners_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "learnerId" TEXT;

-- Every existing school entry becomes its own learner (bibs were unique per
-- championship, so this is one-to-one). The learner reuses the entry's id.
INSERT INTO "learners" ("id", "championshipId", "schoolId", "firstName", "lastName", "gender", "dateOfBirth", "bibNumber", "createdAt", "updatedAt")
SELECT "id", "championshipId", "schoolId", "firstName", "lastName", "gender", "dateOfBirth", "bibNumber", "createdAt", CURRENT_TIMESTAMP
FROM "participants"
WHERE "schoolId" IS NOT NULL AND "tournamentTeamId" IS NULL;

UPDATE "participants" SET "learnerId" = "id"
WHERE "schoolId" IS NOT NULL AND "tournamentTeamId" IS NULL;

-- Learners promoted earlier carry the link to the learner they came from.
UPDATE "learners" l SET "promotedFromLearnerId" = p."promotedFromParticipantId"
FROM "participants" p
WHERE p."id" = l."id" AND p."promotedFromParticipantId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "learners" o WHERE o."id" = p."promotedFromParticipantId");

-- DropIndex
DROP INDEX "participants_championshipId_bibNumber_key";

-- CreateIndex
CREATE INDEX "learners_schoolId_idx" ON "learners"("schoolId");

-- CreateIndex
CREATE INDEX "learners_promotedFromLearnerId_idx" ON "learners"("promotedFromLearnerId");

-- CreateIndex
CREATE UNIQUE INDEX "learners_championshipId_bibNumber_key" ON "learners"("championshipId", "bibNumber");

-- CreateIndex
CREATE UNIQUE INDEX "learners_championshipId_birthCertNumber_key" ON "learners"("championshipId", "birthCertNumber");

-- CreateIndex
CREATE INDEX "participants_championshipId_bibNumber_idx" ON "participants"("championshipId", "bibNumber");

-- CreateIndex
CREATE INDEX "participants_learnerId_idx" ON "participants"("learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "participants_gameId_bibNumber_key" ON "participants"("gameId", "bibNumber");

-- CreateIndex
CREATE UNIQUE INDEX "participants_gameId_learnerId_key" ON "participants"("gameId", "learnerId");

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learners" ADD CONSTRAINT "learners_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "championships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learners" ADD CONSTRAINT "learners_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
