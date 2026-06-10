-- AlterTable
ALTER TABLE "payments" ADD COLUMN "allocation_mode" VARCHAR(10) NOT NULL DEFAULT 'auto';
