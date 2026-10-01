-- CreateEnum
CREATE TYPE "KsefDiscrepancyBasis" AS ENUM ('POINTS', 'PERCENT');

-- CreateEnum
CREATE TYPE "KsefPanelRole" AS ENUM ('JUDGE', 'CHIEF_JUDGE', 'SRC_MEMBER');

-- CreateEnum
CREATE TYPE "KsefReviewStatus" AS ENUM ('OPEN', 'APPROVED');

-- CreateEnum
CREATE TYPE "KsefFinalScoreBasis" AS ENUM ('AVERAGE_OF_JUDGES', 'CHIEF_JUDGE_DETERMINED');

-- CreateEnum
CREATE TYPE "KsefComplaintStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'UPHELD', 'DISMISSED');

-- AlterTable
ALTER TABLE "ksef_editions" ADD COLUMN     "discrepancyBasis" "KsefDiscrepancyBasis" NOT NULL DEFAULT 'POINTS',
ADD COLUMN     "discrepancyThreshold" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "ksef_judges" ADD COLUMN     "role" "KsefPanelRole" NOT NULL DEFAULT 'JUDGE';

-- CreateTable
CREATE TABLE "ksef_discrepancy_reviews" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "level" "Level" NOT NULL,
    "status" "KsefReviewStatus" NOT NULL DEFAULT 'OPEN',
    "spread" DECIMAL(7,2) NOT NULL,
    "threshold" DECIMAL(6,2) NOT NULL,
    "basis" "KsefDiscrepancyBasis" NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalScoreBasis" "KsefFinalScoreBasis",
    "finalScore" DECIMAL(7,2),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_discrepancy_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_complaints" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "level" "Level" NOT NULL,
    "complainantName" TEXT NOT NULL,
    "complainantRole" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "documentUrl" TEXT,
    "status" "KsefComplaintStatus" NOT NULL DEFAULT 'SUBMITTED',
    "decision" TEXT,
    "raisedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_case_events" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT,
    "complaintId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ksef_case_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ksef_discrepancy_reviews_status_idx" ON "ksef_discrepancy_reviews"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_discrepancy_reviews_projectId_level_key" ON "ksef_discrepancy_reviews"("projectId", "level");

-- CreateIndex
CREATE INDEX "ksef_complaints_editionId_status_idx" ON "ksef_complaints"("editionId", "status");

-- CreateIndex
CREATE INDEX "ksef_complaints_projectId_idx" ON "ksef_complaints"("projectId");

-- CreateIndex
CREATE INDEX "ksef_case_events_reviewId_idx" ON "ksef_case_events"("reviewId");

-- CreateIndex
CREATE INDEX "ksef_case_events_complaintId_idx" ON "ksef_case_events"("complaintId");

-- AddForeignKey
ALTER TABLE "ksef_discrepancy_reviews" ADD CONSTRAINT "ksef_discrepancy_reviews_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ksef_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_discrepancy_reviews" ADD CONSTRAINT "ksef_discrepancy_reviews_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_complaints" ADD CONSTRAINT "ksef_complaints_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "ksef_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_complaints" ADD CONSTRAINT "ksef_complaints_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ksef_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_complaints" ADD CONSTRAINT "ksef_complaints_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_complaints" ADD CONSTRAINT "ksef_complaints_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_case_events" ADD CONSTRAINT "ksef_case_events_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ksef_discrepancy_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_case_events" ADD CONSTRAINT "ksef_case_events_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "ksef_complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_case_events" ADD CONSTRAINT "ksef_case_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity guards (not modelled in Prisma) -------------------------------
-- A judge's submitted score sheet is permanent: its scores can't be changed
-- or removed, and the sheet can't be un-submitted or its comment edited.
CREATE OR REPLACE FUNCTION ksef_guard_submitted_scores() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ksef_judge_assignments"
    WHERE "id" = OLD."assignmentId" AND "submittedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'KSEF scores on a submitted score sheet cannot be changed or deleted';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ksef_scores_guard
BEFORE UPDATE OR DELETE ON "ksef_scores"
FOR EACH ROW EXECUTE FUNCTION ksef_guard_submitted_scores();

CREATE OR REPLACE FUNCTION ksef_guard_submitted_sheet() RETURNS trigger AS $$
BEGIN
  IF OLD."submittedAt" IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'A submitted KSEF score sheet cannot be deleted';
    END IF;
    IF NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt"
       OR NEW."comment" IS DISTINCT FROM OLD."comment"
       OR NEW."judgeId" <> OLD."judgeId"
       OR NEW."projectId" <> OLD."projectId"
       OR NEW."level" <> OLD."level" THEN
      RAISE EXCEPTION 'A submitted KSEF score sheet cannot be changed';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ksef_judge_assignments_guard
BEFORE UPDATE OR DELETE ON "ksef_judge_assignments"
FOR EACH ROW EXECUTE FUNCTION ksef_guard_submitted_sheet();

-- The review/complaint timeline is append-only. The only permitted change is
-- the actor being cleared if their user account is ever removed.
CREATE OR REPLACE FUNCTION ksef_guard_case_events() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'KSEF review/complaint history cannot be deleted';
  END IF;
  IF NEW."action" <> OLD."action"
     OR NEW."note" IS DISTINCT FROM OLD."note"
     OR NEW."reviewId" IS DISTINCT FROM OLD."reviewId"
     OR NEW."complaintId" IS DISTINCT FROM OLD."complaintId"
     OR NEW."createdAt" <> OLD."createdAt"
     OR (NEW."actorId" IS NOT NULL AND NEW."actorId" IS DISTINCT FROM OLD."actorId") THEN
    RAISE EXCEPTION 'KSEF review/complaint history cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ksef_case_events_guard
BEFORE UPDATE OR DELETE ON "ksef_case_events"
FOR EACH ROW EXECUTE FUNCTION ksef_guard_case_events();
