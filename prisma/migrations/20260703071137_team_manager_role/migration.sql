-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TEAM_MANAGER';

-- AlterTable
ALTER TABLE "user_roles" ADD COLUMN     "organizationName" TEXT;
