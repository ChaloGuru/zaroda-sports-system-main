-- AlterTable
ALTER TABLE "ksef_school_registrations" ADD COLUMN     "divisions" "KsefDivision"[] DEFAULT ARRAY[]::"KsefDivision"[];

