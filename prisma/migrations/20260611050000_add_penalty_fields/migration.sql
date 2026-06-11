-- AlterTable: Penalty gains an optional bill reference (for idempotency on
-- automated late fees) and an optional penalty date.
ALTER TABLE "penalties" ADD COLUMN "bill_id" INTEGER;
ALTER TABLE "penalties" ADD COLUMN "penalty_date" DATE;

-- FK: penalty -> bill, set null on delete so a deleted bill does not cascade
-- away its penalty history.
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
