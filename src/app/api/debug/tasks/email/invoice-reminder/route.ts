import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { addDays } from "date-fns";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const targetDate = new Date();
  const dueWindow = addDays(targetDate, 7);

  // Check feature flag
  const setting = await prisma.setting.findUnique({
    where: { setting_key: "MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED" },
  });
  const enabled = setting?.setting_value?.toLowerCase() === "true";

  const bills = await prisma.bill.findMany({
    where: { due_date: { gte: targetDate, lte: dueWindow } },
    include: {
      bill_item: true,
      paymentBills: true,
      bookings: {
        include: { tenants: true, rooms: { include: { locations: true } } },
      },
    },
  });

  const unpaidBills = bills.filter((bill) => {
    const total = bill.bill_item.reduce((s, i) => s + Number(i.amount), 0);
    const paid = bill.paymentBills.reduce((s, p) => s + Number(p.amount), 0);
    return total - paid > 0 && bill.bookings.tenants?.email;
  });

  return NextResponse.json({
    success: true,
    dryRun: true,
    featureEnabled: enabled,
    wouldSend: unpaidBills.length,
    bills: unpaidBills.map((bill) => ({
      billId: bill.id,
      description: bill.description,
      dueDate: bill.due_date,
      tenant: bill.bookings.tenants?.name,
      email: bill.bookings.tenants?.email,
      room: bill.bookings.rooms?.room_number,
      outstanding:
        bill.bill_item.reduce((s, i) => s + Number(i.amount), 0) -
        bill.paymentBills.reduce((s, p) => s + Number(p.amount), 0),
    })),
  });
}
