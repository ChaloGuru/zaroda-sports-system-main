-- Identity checks against borrowed birth certificates: face descriptors and
-- ID documents on learners, officials' challenges, and alerts for records
-- that don't add up across championships and seasons.

-- CreateEnum
CREATE TYPE "LearnerChallengeStatus" AS ENUM ('OPEN', 'CLEARED', 'UPHELD');

-- AlterTable
ALTER TABLE "learners" ADD COLUMN     "documentsVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "documentsVerifiedBy" TEXT,
ADD COLUMN     "faceDescriptor" BYTEA,
ADD COLUMN     "idDocument" BYTEA,
ADD COLUMN     "idDocumentKind" TEXT,
ADD COLUMN     "idDocumentUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "learner_challenges" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LearnerChallengeStatus" NOT NULL DEFAULT 'OPEN',
    "raisedBy" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_identity_alerts" (
    "id" TEXT NOT NULL,
    "learnerAId" TEXT NOT NULL,
    "learnerBId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_identity_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learner_challenges_learnerId_idx" ON "learner_challenges"("learnerId");

-- CreateIndex
CREATE INDEX "learner_identity_alerts_learnerBId_idx" ON "learner_identity_alerts"("learnerBId");

-- CreateIndex
CREATE UNIQUE INDEX "learner_identity_alerts_learnerAId_learnerBId_kind_key" ON "learner_identity_alerts"("learnerAId", "learnerBId", "kind");

-- CreateIndex
CREATE INDEX "learners_birthCertNumber_idx" ON "learners"("birthCertNumber");

-- CreateIndex
CREATE INDEX "learners_knecAssessmentNumber_idx" ON "learners"("knecAssessmentNumber");

-- CreateIndex
CREATE INDEX "learners_kemisUpi_idx" ON "learners"("kemisUpi");

-- AddForeignKey
ALTER TABLE "learner_challenges" ADD CONSTRAINT "learner_challenges_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_identity_alerts" ADD CONSTRAINT "learner_identity_alerts_learnerAId_fkey" FOREIGN KEY ("learnerAId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_identity_alerts" ADD CONSTRAINT "learner_identity_alerts_learnerBId_fkey" FOREIGN KEY ("learnerBId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

