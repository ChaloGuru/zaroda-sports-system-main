-- CreateTable
CREATE TABLE "championship_circulars" (
    "id" TEXT NOT NULL,
    "championshipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "championship_circulars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "championship_circulars_championshipId_idx" ON "championship_circulars"("championshipId");

-- AddForeignKey
ALTER TABLE "championship_circulars" ADD CONSTRAINT "championship_circulars_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "championships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_circulars" ADD CONSTRAINT "championship_circulars_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
