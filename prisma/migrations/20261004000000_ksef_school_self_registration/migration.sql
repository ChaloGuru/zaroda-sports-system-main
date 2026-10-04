-- CreateEnum
CREATE TYPE "KsefRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ksef_editions" ADD COLUMN     "registrationClosesAt" TIMESTAMP(3),
ADD COLUMN     "registrationToken" TEXT;

-- AlterTable
ALTER TABLE "ksef_projects" ADD COLUMN     "registrationId" TEXT;

-- CreateTable
CREATE TABLE "ksef_school_registrations" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "schoolId" TEXT,
    "schoolName" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "subcounty" TEXT NOT NULL,
    "zone" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" "KsefRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_school_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ksef_school_registrations_tokenHash_key" ON "ksef_school_registrations"("tokenHash");

-- CreateIndex
CREATE INDEX "ksef_school_registrations_editionId_status_idx" ON "ksef_school_registrations"("editionId", "status");

-- CreateIndex
CREATE INDEX "ksef_school_registrations_schoolId_idx" ON "ksef_school_registrations"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_school_registrations_editionId_contactEmail_key" ON "ksef_school_registrations"("editionId", "contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_editions_registrationToken_key" ON "ksef_editions"("registrationToken");

-- CreateIndex
CREATE INDEX "ksef_projects_registrationId_idx" ON "ksef_projects"("registrationId");

-- AddForeignKey
ALTER TABLE "ksef_projects" ADD CONSTRAINT "ksef_projects_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "ksef_school_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_school_registrations" ADD CONSTRAINT "ksef_school_registrations_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "ksef_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_school_registrations" ADD CONSTRAINT "ksef_school_registrations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_school_registrations" ADD CONSTRAINT "ksef_school_registrations_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

