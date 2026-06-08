import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { generateNextMonthlyBill } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const targetDate = new Date();

  const bookings = await prisma.booking.findMany({
    where: {
      is_rolling: true,
      end_date: null,
      status_id: 2, // ACTIVE
    },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true,
      durations: true,
      deposit: true,
      addOns: { include: { addOn: { include: { pricing: true } } } },
      bills: { include: { bill_item: true } },
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

  return NextResponse.json({ success: true, results });
}
