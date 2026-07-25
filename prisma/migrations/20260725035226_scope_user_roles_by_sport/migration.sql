-- CreateEnum
CREATE TYPE "AthleticsType" AS ENUM ('TRACK', 'FIELD');

-- AlterTable
ALTER TABLE "user_roles" ADD COLUMN     "athleticsType" "AthleticsType",
ADD COLUMN     "ballSport" "BallSport",
ADD COLUMN     "gameCategory" "GameCategory";
