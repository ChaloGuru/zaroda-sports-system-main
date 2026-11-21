-- Team registration fees by M-Pesa through TUMA (replacing Paystack): a manager connects their own TUMA account,
-- and each fee payment keeps what TUMA's notification is checked against.
ALTER TABLE "tenants" ADD COLUMN "tumaEmail" TEXT;
ALTER TABLE "tenants" ADD COLUMN "tumaApiKeyEncrypted" TEXT;

ALTER TABLE "team_fee_payments" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'PAYSTACK';
ALTER TABLE "team_fee_payments" ADD COLUMN "phone" TEXT;
ALTER TABLE "team_fee_payments" ADD COLUMN "checkoutRequestId" TEXT;
ALTER TABLE "team_fee_payments" ADD COLUMN "callbackSecretHash" TEXT;
ALTER TABLE "team_fee_payments" ADD COLUMN "mpesaReceipt" TEXT;
ALTER TABLE "team_fee_payments" ADD COLUMN "message" TEXT;

-- A Paystack payout account no longer takes payments: the manager connects TUMA instead.
UPDATE "tenants" SET "subaccountStatus" = 'NOT_CONFIGURED' WHERE "tumaApiKeyEncrypted" IS NULL AND "subaccountStatus" <> 'NOT_CONFIGURED';
