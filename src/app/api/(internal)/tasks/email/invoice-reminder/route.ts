import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { sendBillReminderEmail } from "@/app/_lib/mailer";
import { addDays } from "date-fns";
import { verifyCronSecret } from "@/app/_lib/util/cron-auth";

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Feature flag check from settings
  const setting = await prisma.setting.findUnique({
    where: { setting_key: "MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED" },
  });
  if (setting?.setting_value?.toLowerCase() !== "true") {
    return NextResponse.json({ success: true, stats: { sent: 0, target: 0 } });
  }

  const targetDate = new Date();
  const dueWindow = addDays(targetDate, 7);

  // BL-026: Bills due within 7 days with outstanding balance > 0
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
    const total = bill.bill_item.reduce(
      (s, i) => s + Number(i.amount),
      0,
    );
    const paid = bill.paymentBills.reduce(
      (s, p) => s + Number(p.amount),
      0,
    );
    return total - paid > 0 && bill.bookings.tenants?.email;
  });

  let sent = 0;
  for (const bill of unpaidBills) {
    try {
      await sendBillReminderEmail(bill);
      sent++;
    } catch (e) {
      // Individual failures don't block batch
    }
  }

  return NextResponse.json({
    success: true,
    stats: { sent, target: unpaidBills.length },
  });
}
