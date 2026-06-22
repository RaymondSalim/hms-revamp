import { prisma } from "@/app/_lib/prisma";
import { generateNextMonthlyBill } from "@/app/_lib/services/bill-generation";
import { businessToday } from "@/app/_lib/util/business-time";
import { BOOKING_STATUS } from "@/app/_lib/util/status";
import { createCronHandler } from "@/app/_lib/util/cron-handler";

export const maxDuration = 60;

async function runMonthlyBilling() {
  // "Today" in business (WIB) calendar terms, so month-boundary billing fires on
  // the correct day even when the server clock is UTC.
  const targetDate = businessToday();

  const bookings = await prisma.booking.findMany({
    where: {
      is_rolling: true,
      end_date: null,
      status_id: BOOKING_STATUS.ACTIVE,
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

const handler = createCronHandler("monthly-billing", runMonthlyBilling);
export const GET = handler;
export const POST = handler;
