-- Schools sign themselves up with a KNEC code, which can only be used once,
-- and can only go to championships in their own jurisdiction.

-- AlterTable
ALTER TABLE "championships" ADD COLUMN     "jurisdiction" TEXT;

-- AlterTable
ALTER TABLE "championship_schools" ADD COLUMN     "schoolAccountId" TEXT;

-- CreateTable
CREATE TABLE "school_accounts" (
    "id" TEXT NOT NULL,
    "knecCode" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "baseName" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "subcounty" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_accounts_knecCode_key" ON "school_accounts"("knecCode");

-- CreateIndex
CREATE UNIQUE INDEX "school_accounts_userId_key" ON "school_accounts"("userId");

-- CreateIndex
CREATE INDEX "championship_schools_schoolAccountId_idx" ON "championship_schools"("schoolAccountId");

-- AddForeignKey
ALTER TABLE "school_accounts" ADD CONSTRAINT "school_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_schools" ADD CONSTRAINT "championship_schools_schoolAccountId_fkey" FOREIGN KEY ("schoolAccountId") REFERENCES "school_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
