-- System owner -> tenant messages by email and SMS: a delivery log, and a
-- batch id grouping one send's per-tenant copies.

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "admin_messages" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "message_deliveries" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "error" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_deliveries_messageId_idx" ON "message_deliveries"("messageId");

-- CreateIndex
CREATE INDEX "admin_messages_batchId_idx" ON "admin_messages"("batchId");

-- AddForeignKey
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "admin_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

