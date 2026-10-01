-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "fieldAttempts" TEXT[] DEFAULT ARRAY[]::TEXT[];
