import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { verifyCronSecret } from "@/app/_lib/util/cron-auth";
import { logAudit } from "@/app/_lib/audit";
import {
  computeExpectedStatus,
  BOOKING_STATUS,
} from "@/app/_lib/util/booking-status";

export const maxDuration = 60;

/**
 * Daily sync of booking.status_id based on start_date / end_date.
 * Gated by the BOOKING_STATUS_SYNC_ENABLED feature flag in the Setting table.
 * Skips CANCELLED bookings entirely (terminal state).
 */
export async function runBookingStatusSync() {
  const setting = await prisma.setting.findUnique({
    where: { setting_key: "BOOKING_STATUS_SYNC_ENABLED" },
  });
  if (setting?.setting_value?.toLowerCase() !== "true") {
    return { success: true, stats: { updated: 0, scanned: 0 } };
  }

  const today = new Date();

  const bookings = await prisma.booking.findMany({
    where: { status_id: { not: BOOKING_STATUS.CANCELLED } },
  });

  let updated = 0;
  for (const booking of bookings) {
    const expected = computeExpectedStatus(
      {
        status_id: booking.status_id,
        start_date: booking.start_date,
        end_date: booking.end_date,
      },
      today
    );

    if (expected !== null && expected !== booking.status_id) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status_id: expected },
      });
      await logAudit(
        `booking.status_synced: id=${booking.id}, ${booking.status_id}->${expected}`
      );
      updated++;
    }
  }

  return { success: true, stats: { updated, scanned: bookings.length } };
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runBookingStatusSync();
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runBookingStatusSync();
  return NextResponse.json(result);
}
