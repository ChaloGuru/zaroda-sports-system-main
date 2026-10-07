-- Subscriptions are paid by M-Pesa through TUMA; these hold a TUMA
-- payment's details alongside the earlier Paystack ones.

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "callbackSecretHash" TEXT,
ADD COLUMN     "championshipId" TEXT,
ADD COLUMN     "checkoutRequestId" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "message" TEXT,
ADD COLUMN     "mpesaReceipt" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'PAYSTACK';


-- Cleanup: age limits are per school level (championship_age_limits); the
-- per-event column has been unused since migration 20261009000000.
ALTER TABLE "games" DROP COLUMN IF EXISTS "maxAge";
