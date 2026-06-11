-- CreateTable
CREATE TABLE "meter_readings" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "utility_type" VARCHAR(50) NOT NULL,
    "reading_date" DATE NOT NULL,
    "reading_value" DECIMAL(12,2) NOT NULL,
    "previous_value" DECIMAL(12,2),
    "rate_per_unit" DECIMAL(10,2) NOT NULL,
    "photo_proof" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
