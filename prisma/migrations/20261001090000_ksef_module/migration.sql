-- CreateEnum
CREATE TYPE "KsefEditionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "KsefDivision" AS ENUM ('JUNIOR_SCHOOL', 'SENIOR_SCHOOL');

-- CreateEnum
CREATE TYPE "KsefProjectStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "KsefResultStatus" AS ENUM ('PENDING', 'QUALIFIED', 'NOT_QUALIFIED');

-- CreateTable
CREATE TABLE "ksef_editions" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "KsefEditionStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "levels" "Level"[] DEFAULT ARRAY['SUB_COUNTY', 'COUNTY', 'REGIONAL', 'NATIONAL']::"Level"[],
    "currentLevel" "Level" NOT NULL DEFAULT 'SUB_COUNTY',
    "qualifiersPerCategory" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_categories" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "division" "KsefDivision" NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_sub_categories" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_sub_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_criteria" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "division" "KsefDivision",
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxScore" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_edition_schools" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ksef_edition_schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_projects" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subCategoryId" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "abstract" TEXT,
    "documentUrl" TEXT,
    "status" "KsefProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "currentLevel" "Level" NOT NULL DEFAULT 'SUB_COUNTY',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_learners" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "grade" TEXT,
    "upiNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ksef_learners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_mentors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tscNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ksef_mentors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_judges" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialty" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ksef_judges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_judge_assignments" (
    "id" TEXT NOT NULL,
    "judgeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "level" "Level" NOT NULL,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_judge_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_scores" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_results" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "level" "Level" NOT NULL,
    "totalScore" DECIMAL(7,2),
    "judgeCount" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "status" "KsefResultStatus" NOT NULL DEFAULT 'PENDING',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ksef_editions_year_key" ON "ksef_editions"("year");

-- CreateIndex
CREATE INDEX "ksef_categories_editionId_idx" ON "ksef_categories"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_categories_editionId_division_name_key" ON "ksef_categories"("editionId", "division", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_sub_categories_categoryId_name_key" ON "ksef_sub_categories"("categoryId", "name");

-- CreateIndex
CREATE INDEX "ksef_criteria_editionId_idx" ON "ksef_criteria"("editionId");

-- CreateIndex
CREATE INDEX "ksef_edition_schools_schoolId_idx" ON "ksef_edition_schools"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_edition_schools_editionId_schoolId_key" ON "ksef_edition_schools"("editionId", "schoolId");

-- CreateIndex
CREATE INDEX "ksef_projects_editionId_idx" ON "ksef_projects"("editionId");

-- CreateIndex
CREATE INDEX "ksef_projects_schoolId_idx" ON "ksef_projects"("schoolId");

-- CreateIndex
CREATE INDEX "ksef_projects_categoryId_idx" ON "ksef_projects"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_projects_editionId_code_key" ON "ksef_projects"("editionId", "code");

-- CreateIndex
CREATE INDEX "ksef_learners_projectId_idx" ON "ksef_learners"("projectId");

-- CreateIndex
CREATE INDEX "ksef_mentors_projectId_idx" ON "ksef_mentors"("projectId");

-- CreateIndex
CREATE INDEX "ksef_judges_userId_idx" ON "ksef_judges"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_judges_editionId_userId_key" ON "ksef_judges"("editionId", "userId");

-- CreateIndex
CREATE INDEX "ksef_judge_assignments_projectId_level_idx" ON "ksef_judge_assignments"("projectId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_judge_assignments_judgeId_projectId_level_key" ON "ksef_judge_assignments"("judgeId", "projectId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_scores_assignmentId_criterionId_key" ON "ksef_scores"("assignmentId", "criterionId");

-- CreateIndex
CREATE INDEX "ksef_results_level_idx" ON "ksef_results"("level");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_results_projectId_level_key" ON "ksef_results"("projectId", "level");

-- AddForeignKey
ALTER TABLE "ksef_categories" ADD CONSTRAINT "ksef_categories_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "ksef_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_sub_categories" ADD CONSTRAINT "ksef_sub_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ksef_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_criteria" ADD CONSTRAINT "ksef_criteria_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "ksef_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_edition_schools" ADD CONSTRAINT "ksef_edition_schools_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "ksef_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_edition_schools" ADD CONSTRAINT "ksef_edition_schools_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_projects" ADD CONSTRAINT "ksef_projects_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "ksef_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_projects" ADD CONSTRAINT "ksef_projects_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_projects" ADD CONSTRAINT "ksef_projects_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ksef_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_projects" ADD CONSTRAINT "ksef_projects_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "ksef_sub_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_learners" ADD CONSTRAINT "ksef_learners_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ksef_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_mentors" ADD CONSTRAINT "ksef_mentors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ksef_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_judges" ADD CONSTRAINT "ksef_judges_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "ksef_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_judges" ADD CONSTRAINT "ksef_judges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_judge_assignments" ADD CONSTRAINT "ksef_judge_assignments_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "ksef_judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_judge_assignments" ADD CONSTRAINT "ksef_judge_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ksef_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_scores" ADD CONSTRAINT "ksef_scores_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ksef_judge_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_scores" ADD CONSTRAINT "ksef_scores_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "ksef_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ksef_results" ADD CONSTRAINT "ksef_results_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ksef_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

