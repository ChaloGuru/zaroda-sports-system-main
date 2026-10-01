-- CreateTable
CREATE TABLE "ksef_judge_invites" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "specialty" TEXT,
    "role" "KsefPanelRole" NOT NULL DEFAULT 'JUDGE',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_judge_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ksef_judge_invites_tokenHash_key" ON "ksef_judge_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "ksef_judge_invites_editionId_email_idx" ON "ksef_judge_invites"("editionId", "email");

-- AddForeignKey
ALTER TABLE "ksef_judge_invites" ADD CONSTRAINT "ksef_judge_invites_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "ksef_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_judge_invites" ADD CONSTRAINT "ksef_judge_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_judge_invites" ADD CONSTRAINT "ksef_judge_invites_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A judge's score for a criterion can never be negative or exceed that
-- criterion's maximum - enforced here as well as in the app.
CREATE OR REPLACE FUNCTION ksef_guard_score_range() RETURNS trigger AS $$
DECLARE
  max_score INTEGER;
BEGIN
  SELECT "maxScore" INTO max_score FROM "ksef_criteria" WHERE "id" = NEW."criterionId";
  IF NEW."score" < 0 OR NEW."score" > max_score THEN
    RAISE EXCEPTION 'KSEF score % is outside 0-% for this criterion', NEW."score", max_score;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ksef_scores_range_guard
BEFORE INSERT OR UPDATE ON "ksef_scores"
FOR EACH ROW EXECUTE FUNCTION ksef_guard_score_range();
