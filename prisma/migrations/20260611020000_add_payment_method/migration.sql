-- Payment method tracking
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'EWALLET');
ALTER TABLE "payments" ADD COLUMN "payment_method" "PaymentMethod";
