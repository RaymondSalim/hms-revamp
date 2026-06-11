-- AlterTable: Location gains an optional short code used in invoice numbers.
ALTER TABLE "locations" ADD COLUMN "code" VARCHAR(10);

-- AlterTable: Bill gains a unique, optional sequential invoice number.
ALTER TABLE "bills" ADD COLUMN "invoice_number" VARCHAR(50);
CREATE UNIQUE INDEX "bills_invoice_number_key" ON "bills"("invoice_number");

-- CreateTable: per-location/year/month monotonic counter for invoice numbers.
CREATE TABLE "invoice_sequences" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoice_sequences_location_id_year_month_key" ON "invoice_sequences"("location_id", "year", "month");
