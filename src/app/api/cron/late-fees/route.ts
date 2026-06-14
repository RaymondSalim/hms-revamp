import { NextRequest, NextResponse } from "next/server";
import { addDays, isAfter } from "date-fns";
import { prisma } from "@/app/_lib/prisma";
import { verifyCronSecret } from "@/app/_lib/util/cron-auth";
import { logAudit } from "@/app/_lib/audit";
import {
  resolveBillingPolicy,
  computeLateFee,
} from "@/app/_lib/util/billing-policy";

export const maxDuration = 60;

/**
 * Daily scan of overdue bills that applies an automated late fee (Denda
 * Keterlambatan) to each qualifying bill. Gated by the
 * LATE_FEE_AUTOMATION_ENABLED feature flag in the Setting table.
 *
 * For each bill past its due date (plus the policy grace period) with an
 * outstanding balance, a Penalty row and a matching BillItem are created. A
 * bill is only ever charged once (idempotent on penalty.bill_id).
 */
export async function runLateFees(today?: Date) {
  const setting = await prisma.setting.findUnique({
    where: { setting_key: "LATE_FEE_AUTOMATION_ENABLED" },
  });
  if (setting?.setting_value?.toLowerCase() !== "true") {
    return { success: true, stats: { created: 0 } };
  }

  const now = today ?? new Date();

  const bills = await prisma.bill.findMany({
    where: { due_date: { lt: now }, deletedAt: null, bookings: { deletedAt: null } },
    include: {
      bill_item: true,
      paymentBills: true,
      bookings: { include: { rooms: true } },
    },
  });

  let created = 0;
  for (const bill of bills) {
    const policy = await resolveBillingPolicy(
      bill.booking_id,
      bill.bookings.rooms?.location_id ?? null
    );

    // No late fee configured at any policy layer.
    if (policy.late_fee_type === null) continue;

    // Grace period: skip while still within (due_date + grace_period_days).
    const effectiveOverdueDate = addDays(bill.due_date, policy.grace_period_days);
    if (!isAfter(now, effectiveOverdueDate)) continue;

    // Outstanding = sum of bill items minus sum of payment allocations.
    const itemsTotal = bill.bill_item.reduce(
      (sum, item) => sum + Number(item.amount),
      0
    );
    const paidTotal = bill.paymentBills.reduce(
      (sum, pb) => sum + Number(pb.amount),
      0
    );
    const outstanding = itemsTotal - paidTotal;
    if (outstanding <= 0) continue;

    // Idempotency: only ever charge a given bill once.
    const existing = await prisma.penalty.findFirst({
      where: { bill_id: bill.id },
    });
    if (existing) continue;

    const fee = computeLateFee(
      outstanding,
      policy.late_fee_type,
      policy.late_fee_amount
    );
    if (fee <= 0) continue;

    await prisma.$transaction([
      prisma.penalty.create({
        data: {
          description: "Denda Keterlambatan",
          amount: fee,
          booking_id: bill.booking_id,
          bill_id: bill.id,
          penalty_date: now,
        },
      }),
      prisma.billItem.create({
        data: {
          bill_id: bill.id,
          description: "Denda Keterlambatan",
          amount: fee,
          type: "GENERATED",
          related_id: { penalty: true },
        },
      }),
    ]);

    await logAudit(
      `late_fee.created: bill_id=${bill.id}, booking_id=${bill.booking_id}, amount=${fee}`
    );
    created++;
  }

  return { success: true, stats: { created, scanned: bills.length } };
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runLateFees();
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runLateFees();
  return NextResponse.json(result);
}
