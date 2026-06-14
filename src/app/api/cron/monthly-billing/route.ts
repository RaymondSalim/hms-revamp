import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { generateNextMonthlyBill } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";
import { verifyCronSecret } from "@/app/_lib/util/cron-auth";

export const maxDuration = 60;

async function runMonthlyBilling() {
  const targetDate = new Date();

  const bookings = await prisma.booking.findMany({
    where: {
      is_rolling: true,
      end_date: null,
      status_id: 2, // ACTIVE
      deletedAt: null,
    },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true,
      durations: true,
      deposit: true,
      addOns: { include: { addOn: { include: { pricing: true } } } },
      bills: { where: { deletedAt: null }, include: { bill_item: true } },
    },
  });

  const results = [];

  for (const booking of bookings) {
    const bill = await generateNextMonthlyBill(booking as any, targetDate);
    if (bill) {
      results.push({
        bookingId: booking.id,
        roomName: booking.rooms?.room_number,
        fee: Number(booking.fee),
        status: "processed",
        billId: bill.id,
        billDescription: bill.description,
      });
    }
  }

  return { success: true, results };
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runMonthlyBilling();
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runMonthlyBilling();
  return NextResponse.json(result);
}
