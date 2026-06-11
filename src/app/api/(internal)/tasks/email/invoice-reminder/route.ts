import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { sendBillReminderEmail } from "@/app/_lib/mailer";
import { addDays, startOfDay } from "date-fns";
import { verifyCronSecret } from "@/app/_lib/util/cron-auth";
import { resolveBillingPolicy } from "@/app/_lib/util/billing-policy";

export const maxDuration = 60;

// Generous upper bound for the initial DB query. Reminder lead times beyond
// this are unrealistic, so this bounds the query while still allowing each
// bill's per-policy `reminder_days_before` window to be applied afterwards.
const MAX_WINDOW_DAYS = 60;

/**
 * Sends payment reminder emails for unpaid bills coming due within each bill's
 * configured reminder lead time. Gated by the
 * MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED feature flag in the Setting table.
 *
 * The reminder lead time is resolved per-bill from the BillingPolicy cascade
 * (system -> location -> booking) `reminder_days_before` field rather than a
 * hardcoded value. The DB query is widened to a generous MAX_WINDOW_DAYS cap,
 * then each bill is filtered by its own resolved window.
 */
export async function runInvoiceReminders(today?: Date) {
  const setting = await prisma.setting.findUnique({
    where: { setting_key: "MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED" },
  });
  if (setting?.setting_value?.toLowerCase() !== "true") {
    return { success: true, stats: { sent: 0, target: 0 } };
  }

  const now = startOfDay(today ?? new Date());
  const maxWindow = addDays(now, MAX_WINDOW_DAYS);

  // Fetch upcoming (not-yet-overdue) bills within the maximum plausible window.
  const bills = await prisma.bill.findMany({
    where: { due_date: { gte: now, lte: maxWindow } },
    include: {
      bill_item: true,
      paymentBills: true,
      bookings: {
        include: { tenants: true, rooms: { include: { locations: true } } },
      },
    },
  });

  const toRemind = [];
  for (const bill of bills) {
    // Skip if tenant has no email to send to.
    if (!bill.bookings.tenants?.email) continue;

    // Skip if fully paid (no outstanding balance).
    const total = bill.bill_item.reduce((s, i) => s + Number(i.amount), 0);
    const paid = bill.paymentBills.reduce((s, p) => s + Number(p.amount), 0);
    if (total - paid <= 0) continue;

    // Resolve this bill's reminder lead time from its policy cascade.
    const policy = await resolveBillingPolicy(
      bill.booking_id,
      bill.bookings.rooms?.location_id ?? null
    );
    const reminderWindow = addDays(now, policy.reminder_days_before);

    // Only remind when the bill is due within ITS configured lead time.
    if (bill.due_date <= reminderWindow) {
      toRemind.push(bill);
    }
  }

  let sent = 0;
  for (const bill of toRemind) {
    try {
      await sendBillReminderEmail(bill);
      sent++;
    } catch {
      // Individual failures don't block the batch.
    }
  }

  return { success: true, stats: { sent, target: toRemind.length } };
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runInvoiceReminders();
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runInvoiceReminders();
  return NextResponse.json(result);
}
