-- Replace the per-account lockout columns with per-email+IP attempt tracking.
ALTER TABLE "users" DROP COLUMN "failedLoginAttempts",
DROP COLUMN "lockedUntil";

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_email_ip_createdAt_idx" ON "login_attempts"("email", "ip", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_createdAt_idx" ON "login_attempts"("createdAt");

-- Public team self-registrations now only create the team once payment is
-- confirmed; until then the registration details live on the payment row.
ALTER TABLE "team_fee_payments" ALTER COLUMN "teamId" DROP NOT NULL,
ADD COLUMN "pendingTeam" JSONB;
