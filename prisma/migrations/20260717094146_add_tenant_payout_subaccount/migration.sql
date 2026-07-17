-- CreateEnum
CREATE TYPE "SubaccountStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING', 'ACTIVE', 'FAILED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "paystackSubaccountCode" TEXT,
ADD COLUMN     "settlementAccountName" TEXT,
ADD COLUMN     "settlementAccountNumber" TEXT,
ADD COLUMN     "settlementBankCode" TEXT,
ADD COLUMN     "settlementBankName" TEXT,
ADD COLUMN     "subaccountStatus" "SubaccountStatus" NOT NULL DEFAULT 'NOT_CONFIGURED';

-- CreateIndex
CREATE UNIQUE INDEX "tenants_paystackSubaccountCode_key" ON "tenants"("paystackSubaccountCode");

