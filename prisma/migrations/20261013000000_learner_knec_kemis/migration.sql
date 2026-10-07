-- Optional KNEC assessment number and KEMIS UPI for learners, each unique
-- within a championship.

-- AlterTable
ALTER TABLE "learners" ADD COLUMN     "kemisUpi" TEXT,
ADD COLUMN     "knecAssessmentNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "learners_championshipId_knecAssessmentNumber_key" ON "learners"("championshipId", "knecAssessmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "learners_championshipId_kemisUpi_key" ON "learners"("championshipId", "kemisUpi");

