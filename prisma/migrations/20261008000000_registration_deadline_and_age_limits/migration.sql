-- AlterTable
ALTER TABLE "championships" ADD COLUMN     "ageCutoffDate" TIMESTAMP(3),
ADD COLUMN     "registrationClosesAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "maxAge" INTEGER;

