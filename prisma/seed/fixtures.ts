import { PrismaClient, DepositStatus } from "@prisma/client";
import { seedNow, monthsFrom, daysFrom } from "./anchor";
import { BOOKING_STATUS, PAYMENT_STATUS } from "@/app/_lib/util/status";
import type { SeedLocationsResult } from "./generate/locations-rooms";

export interface BookingSpec {
  bookingDbId: number;       // the created Booking row's auto-inc id
  tenantId: string;
  roomId: number;
  locationId: number;
  startDate: Date;
  endDate: Date | null;      // null = rolling
  isRolling: boolean;
  statusId: number;          // use BOOKING_STATUS
  fee: number;
  scenario: string;          // "active","completed","future","pending","cancelled","rolling","overdue","pending_payment","rejected","partial"
  paymentIntent: "paid" | "partial" | "overdue_unpaid" | "pending" | "rejected" | "bulk" | "none";
  deposit?: { amount: number; status: string };
  checkedIn?: boolean;
}

interface AnchorSpec {
  scenario: string;
  offsets: {
    startMonths?: number;
    startDays?: number;
    endMonths?: number;
    endDays?: number;
  };
  statusId: number;
  paymentIntent: BookingSpec["paymentIntent"];
  isRolling?: boolean;
  depositStatus?: DepositStatus;
  checkedIn?: boolean;
  locationId?: number;  // if specified, create booking in this location
  tenantName?: string;  // if specified, create explicit named tenant
  roomNumber?: string;  // if specified, use/create this room
}

/**
 * Create ≥2-per-scenario anchor bookings (active, completed, future, pending,
 * cancelled, rolling, overdue, pending_payment, rejected, partial), including
 * named E2E anchors (Ahmad Wijaya + room A3 in Kemang, plus at least one
 * Sudirman booking with pending payment).
 */
export async function seedAnchorFixtures(
  prisma: PrismaClient,
  ctx: SeedLocationsResult
): Promise<BookingSpec[]> {
  // ═══════════════════════════════════════════════════════════════════════
  // Anchor Matrix: ≥2 per scenario
  // ═══════════════════════════════════════════════════════════════════════

  const anchorMatrix: AnchorSpec[] = [
    // ACTIVE ×4 (2 per location)
    {
      scenario: "active",
      offsets: { startMonths: -3, endMonths: 3 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "paid",
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
      locationId: 1,
    },
    {
      scenario: "active",
      offsets: { startMonths: -2, endMonths: 4 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "partial",
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
      locationId: 2,
      tenantName: "Ahmad Wijaya",
      roomNumber: "A3",
    },
    {
      scenario: "active",
      offsets: { startMonths: -4, endMonths: 2 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "paid",
      depositStatus: DepositStatus.APPLIED,
      checkedIn: true,
      locationId: 1,
    },
    {
      scenario: "active",
      offsets: { startMonths: -1, endMonths: 5 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "paid",
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
      locationId: 2,
    },

    // COMPLETED ×2
    {
      scenario: "completed",
      offsets: { startMonths: -8, endMonths: -1 },
      statusId: BOOKING_STATUS.COMPLETED,
      paymentIntent: "paid",
      depositStatus: DepositStatus.REFUNDED,
      checkedIn: true,
    },
    {
      scenario: "completed",
      offsets: { startMonths: -12, endMonths: -5 },
      statusId: BOOKING_STATUS.COMPLETED,
      paymentIntent: "paid",
      depositStatus: DepositStatus.REFUNDED,
      checkedIn: true,
    },

    // FUTURE ×2
    {
      scenario: "future",
      offsets: { startMonths: 1, endMonths: 7 },
      statusId: BOOKING_STATUS.PENDING,
      paymentIntent: "none",
      depositStatus: DepositStatus.HELD,
      checkedIn: false,
    },
    {
      scenario: "future",
      offsets: { startMonths: 2, endMonths: 8 },
      statusId: BOOKING_STATUS.PENDING,
      paymentIntent: "none",
      depositStatus: DepositStatus.HELD,
      checkedIn: false,
    },

    // PENDING ×2 (start = today, no check-in)
    {
      scenario: "pending",
      offsets: { startDays: 0, endMonths: 6 },
      statusId: BOOKING_STATUS.PENDING,
      paymentIntent: "none",
      depositStatus: DepositStatus.UNPAID,
      checkedIn: false,
    },
    {
      scenario: "pending",
      offsets: { startDays: 0, endMonths: 3 },
      statusId: BOOKING_STATUS.PENDING,
      paymentIntent: "none",
      depositStatus: DepositStatus.HELD,
      checkedIn: false,
    },

    // CANCELLED ×2
    {
      scenario: "cancelled",
      offsets: { startMonths: -6, endMonths: -1 },
      statusId: BOOKING_STATUS.CANCELLED,
      paymentIntent: "none",
      depositStatus: DepositStatus.PARTIALLY_REFUNDED,
      checkedIn: false,
    },
    {
      scenario: "cancelled",
      offsets: { startMonths: -3, endDays: 30 },
      statusId: BOOKING_STATUS.CANCELLED,
      paymentIntent: "rejected",
      depositStatus: DepositStatus.PARTIALLY_REFUNDED,
      checkedIn: false,
    },

    // ROLLING ×2
    {
      scenario: "rolling",
      offsets: { startMonths: -2 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "paid",
      isRolling: true,
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
    },
    {
      scenario: "rolling",
      offsets: { startMonths: -6 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "partial",
      isRolling: true,
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
    },

    // OVERDUE ×2 (active booking with overdue_unpaid payment intent)
    {
      scenario: "overdue",
      offsets: { startMonths: -5, endMonths: 1 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "overdue_unpaid",
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
    },
    {
      scenario: "overdue",
      offsets: { startMonths: -4, endMonths: 2 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "overdue_unpaid",
      depositStatus: DepositStatus.APPLIED,
      checkedIn: true,
    },

    // PENDING_PAYMENT ×2 (≥1 in Sudirman with pending intent)
    {
      scenario: "pending_payment",
      offsets: { startMonths: -3, endMonths: 3 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "pending",
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
      locationId: 1, // Sudirman
    },
    {
      scenario: "pending_payment",
      offsets: { startMonths: -2, endMonths: 4 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "pending",
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
    },

    // REJECTED ×2
    {
      scenario: "rejected",
      offsets: { startMonths: -1, endMonths: 5 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "rejected",
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
    },
    {
      scenario: "rejected",
      offsets: { startMonths: -3, endMonths: 3 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "rejected",
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
    },

    // PARTIAL ×2
    {
      scenario: "partial",
      offsets: { startMonths: -4, endMonths: 2 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "partial",
      depositStatus: DepositStatus.HELD,
      checkedIn: true,
    },
    {
      scenario: "partial",
      offsets: { startMonths: -2, endMonths: 4 },
      statusId: BOOKING_STATUS.ACTIVE,
      paymentIntent: "partial",
      depositStatus: DepositStatus.APPLIED,
      checkedIn: true,
    },
  ];

  // ═══════════════════════════════════════════════════════════════════════
  // Named E2E Anchors: Create explicit tenant + room (spare)
  // ═══════════════════════════════════════════════════════════════════════

  // Create a second named tenant for E2E spares
  const spareTenant = await prisma.tenant.create({
    data: {
      id: "3174012345670099",
      name: "Budi Suryanto",
      email: "budi.suryanto@gmail.com",
      phone: "+6281234567899",
      id_number: "3174012345670099",
      current_address: "Jl. Gatot Subroto No. 20, Jakarta",
      emergency_contact_name: "Suryanto Family",
      emergency_contact_phone: "+6281234567898",
      referral_source: "Website",
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Create Anchor Bookings
  // ═══════════════════════════════════════════════════════════════════════

  const specs: BookingSpec[] = [];
  const usedRoomIds = new Set<number>();

  for (const anchor of anchorMatrix) {
    // Compute dates
    const startDate =
      anchor.offsets.startMonths !== undefined
        ? monthsFrom(anchor.offsets.startMonths)
        : anchor.offsets.startDays !== undefined
        ? daysFrom(anchor.offsets.startDays)
        : seedNow();

    const endDate = anchor.isRolling
      ? null
      : anchor.offsets.endMonths !== undefined
      ? monthsFrom(anchor.offsets.endMonths)
      : anchor.offsets.endDays !== undefined
      ? daysFrom(anchor.offsets.endDays)
      : null;

    // Create or find tenant
    let tenantId: string;
    if (anchor.tenantName === "Ahmad Wijaya") {
      // Create the named E2E anchor tenant
      const ahmad = await prisma.tenant.upsert({
        where: { id: "3174012345670100" },
        update: {},
        create: {
          id: "3174012345670100",
          name: "Ahmad Wijaya",
          email: "ahmad.wijaya@gmail.com",
          phone: "+6281234567890",
          id_number: "3174012345670100",
          current_address: "Jl. Gatot Subroto No. 10, Jakarta",
          emergency_contact_name: "Nurul Wijaya",
          emergency_contact_phone: "+6281234567891",
          referral_source: "Website",
        },
      });
      tenantId = ahmad.id;
    } else {
      // Reuse the spare tenant for other anchors
      tenantId = spareTenant.id;
    }

    // Find or create room
    let roomId: number;
    let locationId: number;

    if (anchor.roomNumber === "A3" && anchor.locationId === 2) {
      // Ensure room A3 exists in Kemang (location 2)
      const a3 = await prisma.room.findFirst({
        where: { room_number: "A3", location_id: 2 },
      });

      if (!a3) {
        // Create it if it doesn't exist
        const roomTypeId = ctx.roomTypeIds[0]; // Studio
        const created = await prisma.room.create({
          data: {
            room_number: "A3",
            location_id: 2,
            room_type_id: roomTypeId,
            status_id: 1, // Available
          },
        });
        roomId = created.id;
        locationId = 2;
      } else {
        roomId = a3.id;
        locationId = a3.location_id ?? 2;
      }
    } else {
      // Pick a room from ctx (avoid double-booking for active bookings)
      const targetLocationId = anchor.locationId ?? ctx.locationIds[0];
      const availableRooms = ctx.roomIds.filter((id) => !usedRoomIds.has(id));

      // Get location for the room
      const roomCandidates = await prisma.room.findMany({
        where: {
          id: { in: availableRooms },
          location_id: targetLocationId,
        },
        take: 1,
      });

      if (roomCandidates.length === 0) {
        // Fallback to any available room if location-specific unavailable
        const fallback = await prisma.room.findFirst({
          where: { id: { in: availableRooms } },
        });
        roomId = fallback!.id;
        locationId = fallback!.location_id ?? ctx.locationIds[0];
      } else {
        roomId = roomCandidates[0].id;
        locationId = roomCandidates[0].location_id ?? targetLocationId;
      }
    }

    // Mark room as used if booking is active/rolling
    if (
      anchor.statusId === BOOKING_STATUS.ACTIVE &&
      !anchor.isRolling
    ) {
      usedRoomIds.add(roomId);
    }

    // Determine fee based on room type and duration
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    const durationId = ctx.durationIds[0]; // Default to 3 months
    const roomTypeId = room.room_type_id ?? ctx.roomTypeIds[0];
    const fee = Number(await getFeeForRoom(prisma, roomTypeId, durationId, locationId));

    // Create the Booking
    const booking = await prisma.booking.create({
      data: {
        room_id: roomId,
        tenant_id: tenantId,
        start_date: startDate,
        end_date: endDate,
        duration_id: durationId,
        status_id: anchor.statusId,
        fee,
        is_rolling: anchor.isRolling ?? false,
      },
    });

    // Create Deposit if specified
    if (anchor.depositStatus) {
      await prisma.deposit.create({
        data: {
          booking_id: booking.id,
          amount: fee,
          status: anchor.depositStatus,
          refunded_amount:
            anchor.depositStatus === DepositStatus.REFUNDED
              ? fee
              : anchor.depositStatus === DepositStatus.PARTIALLY_REFUNDED
              ? Math.floor(fee * 0.75)
              : undefined,
          refunded_at:
            anchor.depositStatus === DepositStatus.REFUNDED ||
            anchor.depositStatus === DepositStatus.PARTIALLY_REFUNDED
              ? monthsFrom(-1)
              : undefined,
        },
      });
    }

    // Create Check-in Log if specified
    if (anchor.checkedIn) {
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
      roomId,
      locationId,
      startDate,
      endDate,
      isRolling: anchor.isRolling ?? false,
      statusId: anchor.statusId,
      fee,
      scenario: anchor.scenario,
      paymentIntent: anchor.paymentIntent,
      deposit: anchor.depositStatus
        ? { amount: fee, status: anchor.depositStatus }
        : undefined,
      checkedIn: anchor.checkedIn,
    });
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
