-- CreateEnum
CREATE TYPE "BallSport" AS ENUM ('FOOTBALL', 'BASKETBALL', 'VOLLEYBALL', 'HANDBALL', 'RUGBY', 'NETBALL');

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "sport" "BallSport";

