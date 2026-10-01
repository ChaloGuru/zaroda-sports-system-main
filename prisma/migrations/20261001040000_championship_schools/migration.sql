-- CreateTable
CREATE TABLE "championship_schools" (
    "id" TEXT NOT NULL,
    "championshipId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "championship_schools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "championship_schools_schoolId_idx" ON "championship_schools"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "championship_schools_championshipId_schoolId_key" ON "championship_schools"("championshipId", "schoolId");

-- AddForeignKey
ALTER TABLE "championship_schools" ADD CONSTRAINT "championship_schools_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "championships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_schools" ADD CONSTRAINT "championship_schools_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep any school a championship already uses (via a bib range or a
-- participant) on that championship's new school list.
INSERT INTO "championship_schools" ("id", "championshipId", "schoolId")
SELECT gen_random_uuid()::text, used."championshipId", used."schoolId"
FROM (
    SELECT "championshipId", "schoolId" FROM "school_bib_ranges"
    UNION
    SELECT "championshipId", "schoolId" FROM "participants" WHERE "schoolId" IS NOT NULL
) AS used
ON CONFLICT ("championshipId", "schoolId") DO NOTHING;

-- Remove the hardcoded sample schools from prisma/seed.ts, unless something
-- already references them.
DELETE FROM "schools" s
WHERE (s."name", s."county") IN (
    ('Starehe Boys Centre', 'Nairobi'),
    ('Alliance High School', 'Kiambu'),
    ('Kisumu Girls High School', 'Kisumu'),
    ('Mombasa Secondary School', 'Mombasa'),
    ('Nakuru High School', 'Nakuru')
)
AND NOT EXISTS (SELECT 1 FROM "participants" p WHERE p."schoolId" = s."id")
AND NOT EXISTS (SELECT 1 FROM "school_bib_ranges" b WHERE b."schoolId" = s."id")
AND NOT EXISTS (SELECT 1 FROM "championship_schools" c WHERE c."schoolId" = s."id");
