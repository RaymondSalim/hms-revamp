-- Add CREDIT to TransactionType enum
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'CREDIT';

-- Backfill: existing overpayment INCOME transactions become CREDIT liabilities
-- NOTE: must be a separate statement from the ALTER TYPE (PG cannot use a newly-added
-- enum value in the same transaction as the ADD VALUE). psql runs these as separate
-- implicit transactions, which is fine. Verified working on PG16.
UPDATE "transactions" SET "type" = 'CREDIT' WHERE "category" = 'Kelebihan Bayar' AND "type" = 'INCOME';
