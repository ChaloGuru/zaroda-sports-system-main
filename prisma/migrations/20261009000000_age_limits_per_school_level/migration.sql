-- Age limits are per school level (below), not per event. games."maxAge"
-- is no longer used but stays until the code that reads it is gone from
-- the live site; a later migration drops it.

-- CreateTable
CREATE TABLE "championship_age_limits" (
    "id" TEXT NOT NULL,
    "championshipId" TEXT NOT NULL,
    "schoolLevel" "SchoolLevel" NOT NULL,
    "maxAge" INTEGER NOT NULL,

    CONSTRAINT "championship_age_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "championship_age_limits_championshipId_schoolLevel_key" ON "championship_age_limits"("championshipId", "schoolLevel");

-- AddForeignKey
ALTER TABLE "championship_age_limits" ADD CONSTRAINT "championship_age_limits_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "championships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

