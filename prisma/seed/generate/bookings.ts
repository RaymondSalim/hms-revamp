import { PrismaClient } from "@prisma/client";
import { Rng } from "../rng";
import { seedNow, monthsFrom, daysFrom } from "../anchor";
import { BOOKING_STATUS } from "@/app/_lib/util/status";
import type { SeedLocationsResult } from "./locations-rooms";
import type { BookingSpec } from "../fixtures";

/**
 * Generate bulk bookings across the distribution (~60% active, ~20% completed,
 * ~10% future, ~10% pending/cancelled). One booking per occupied room (don't
 * double-book a room for overlapping active periods). Assign tenants from
 * tenantIds deterministically.
 */
export async function seedBulkBookings(
  prisma: PrismaClient,
  rng: Rng,
  ctx: SeedLocationsResult,
  tenantIds: string[]
): Promise<BookingSpec[]> {
  const specs: BookingSpec[] = [];
  const usedRoomIds = new Set<number>();

  // Scenario distribution (scenario, weight, statusId)
  type ScenarioTuple = readonly [string, number, number];
  const scenarioWeights: ScenarioTuple[] = [
    ["active", 60, BOOKING_STATUS.ACTIVE],
    ["completed", 20, BOOKING_STATUS.COMPLETED],
    ["future", 10, BOOKING_STATUS.PENDING],
    ["pending", 5, BOOKING_STATUS.PENDING],
    ["cancelled", 5, BOOKING_STATUS.CANCELLED],
  ];

  // Payment intent distribution
  type PaymentIntentTuple = readonly [BookingSpec["paymentIntent"], number];
  const paymentIntentWeights: PaymentIntentTuple[] = [
    ["paid", 50],
    ["partial", 20],
    ["overdue_unpaid", 10],
    ["pending", 10],
    ["rejected", 5],
    ["bulk", 5],
  ];

  // Generate bookings for available rooms
  const availableRooms = await prisma.room.findMany({
    where: { id: { in: ctx.roomIds } },
    orderBy: { id: "asc" },
  });

  // Reserve A3 (Kemang/location 2) for E2E create-booking.spec.ts
  const a3Room = await prisma.room.findFirst({
    where: { room_number: "A3", location_id: 2 },
  });
  const reservedRoomIds = new Set<number>(a3Room ? [a3Room.id] : []);

  let tenantIndex = 0;

  for (const room of availableRooms) {
    // Skip if room is reserved (A3 for E2E) or already used (to avoid double-booking)
    if (reservedRoomIds.has(room.id) || usedRoomIds.has(room.id)) continue;

    // Pick a scenario
    const scenarioTuples: ReadonlyArray<readonly [string, number]> = scenarioWeights.map(
      ([scenario, weight]) => [scenario, weight]
    );
    const scenario = rng.weighted(scenarioTuples);
    // Find the statusId from the original array
    const scenarioEntry = scenarioWeights.find((s) => s[0] === scenario);
    const statusId = scenarioEntry![2];

    // Pick a payment intent
    const paymentIntent = rng.weighted(paymentIntentWeights)[0];

    // Compute dates based on scenario
    let startDate: Date;
    let endDate: Date | null;
    let isRolling = false;
    let checkedIn = false;

    switch (scenario) {
      case "active":
        startDate = monthsFrom(rng.int(-6, -1));
        endDate = monthsFrom(rng.int(1, 6));
        checkedIn = true;
        break;
      case "completed":
        startDate = monthsFrom(rng.int(-12, -6));
        endDate = monthsFrom(rng.int(-5, -1));
        checkedIn = true;
        break;
      case "future":
        startDate = monthsFrom(rng.int(1, 3));
        endDate = monthsFrom(rng.int(4, 9));
        checkedIn = false;
        break;
      case "pending":
        startDate = daysFrom(0);
        endDate = monthsFrom(rng.int(3, 6));
        checkedIn = false;
        break;
      case "cancelled":
        startDate = monthsFrom(rng.int(-6, -1));
        endDate = monthsFrom(rng.int(0, 3));
        checkedIn = false;
        break;
      default:
        startDate = seedNow();
        endDate = monthsFrom(6);
        break;
    }

    // Assign tenant
    const tenantId = tenantIds[tenantIndex % tenantIds.length];
    tenantIndex++;

    // Determine fee
    const durationId = ctx.durationIds[rng.int(0, ctx.durationIds.length - 1)];
    const roomTypeId = room.room_type_id ?? ctx.roomTypeIds[0];
    const locationId = room.location_id ?? ctx.locationIds[0];
    const fee = Number(await getFeeForRoom(prisma, roomTypeId, durationId, locationId));

    // Create the Booking
    const booking = await prisma.booking.create({
      data: {
        room_id: room.id,
        tenant_id: tenantId,
        start_date: startDate,
        end_date: endDate,
        duration_id: durationId,
        status_id: statusId,
        fee,
        is_rolling: isRolling,
      },
    });

    // Create Check-in Log if checked in
    if (checkedIn) {
      await prisma.checkInOutLog.create({
        data: {
          booking_id: booking.id,
          event_type: "CHECK_IN",
          event_date: startDate,
          tenant_id: tenantId,
        },
      });
    }

    // Build BookingSpec
    specs.push({
      bookingDbId: booking.id,
      tenantId,
      roomId: room.id,
      locationId,
      startDate,
      endDate,
      isRolling,
      statusId,
      fee,
      scenario,
      paymentIntent: paymentIntent as BookingSpec["paymentIntent"],
      checkedIn,
    });

    // Mark room as used if active
    if (statusId === BOOKING_STATUS.ACTIVE) {
      usedRoomIds.add(room.id);
    }
  }

  return specs;
}

/**
 * Helper to get the suggested price for a room type + duration + location.
 */
async function getFeeForRoom(
  prisma: PrismaClient,
  roomTypeId: number,
  durationId: number,
  locationId: number
): Promise<number> {
  const rtd = await prisma.roomTypeDuration.findFirst({
    where: {
      room_type_id: roomTypeId,
      duration_id: durationId,
      location_id: locationId,
    },
  });
  return Number(rtd?.suggested_price ?? 5000000); // fallback
}
