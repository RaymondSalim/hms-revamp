import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { getIndonesianMonthName } from "@/app/_lib/util/datetime";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetDate = searchParams.get("target_date")
    ? new Date(searchParams.get("target_date")!)
    : new Date();

  // Same query as monthly billing
  const bookings = await prisma.booking.findMany({
    where: { is_rolling: true, end_date: null, status_id: 2 },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true,
      durations: true,
      deposit: true,
      addOns: { include: { addOn: { include: { pricing: true } } } },
      bills: { include: { bill_item: true } },
    },
  });

  // Simulate (read-only) — show what WOULD be generated
  const results = bookings.map((booking) => {
    const existingBillMonths = booking.bills.map((b) => {
      const d = new Date(b.due_date);
      return `${d.getFullYear()}-${d.getMonth()}`;
    });

    const targetMonth = `${targetDate.getFullYear()}-${targetDate.getMonth()}`;
    const alreadyExists = existingBillMonths.includes(targetMonth);

    return {
      bookingId: booking.id,
      room: booking.rooms?.room_number,
      tenant: booking.tenants?.name,
      fee: Number(booking.fee),
      wouldGenerate: !alreadyExists,
      targetMonth: `${getIndonesianMonthName(targetDate.getMonth())} ${targetDate.getFullYear()}`,
      existingBillCount: booking.bills.length,
    };
  });

  return NextResponse.json({
    success: true,
    dryRun: true,
    targetDate: targetDate.toISOString(),
    totalBookings: bookings.length,
    wouldGenerate: results.filter((r) => r.wouldGenerate).length,
    results,
  });
}
