-- BillingPolicy cascade resolution (system default -> location -> booking)
CREATE TABLE "billing_policies" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER,
    "booking_id" INTEGER,
    "late_fee_type" VARCHAR(20),
    "late_fee_amount" DECIMAL(10,2),
    "grace_period_days" INTEGER DEFAULT 0,
    "billing_cycle_day" INTEGER DEFAULT 0,
    "proration_method" VARCHAR(20),
    "rate_escalation_percentage" DECIMAL(5,2),
    "rate_escalation_frequency" INTEGER,
    "tax_rate" DECIMAL(5,2),
    "reminder_days_before" INTEGER DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_policies_location_id_booking_id_key" ON "billing_policies"("location_id", "booking_id");

ALTER TABLE "billing_policies" ADD CONSTRAINT "billing_policies_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_policies" ADD CONSTRAINT "billing_policies_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
