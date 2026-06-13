"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import type { DepositStatus } from "@prisma/client";
import { checkPermission } from "@/app/_lib/rbac";
import { getScopedLocationIds } from "@/app/_lib/util/location-scope";
import { generatePaymentBillMappingFromPaymentsAndBills } from "@/app/_lib/util/payment-allocation";
import { createOrUpdatePaymentTransactions } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { logAudit } from "@/app/_lib/audit";

export async function updateDepositStatusAction(data: {
  deposit_id: number;
  status: DepositStatus;
  refunded_amount?: number;
}) {
  const { authorized } = await checkPermission("deposits.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };
  const deposit = await prisma.deposit.findUnique({
    where: { id: data.deposit_id },
    include: { booking: { include: { rooms: true } } },
  });
  if (!deposit) return { success: false, error: "Deposit not found" };

  // Location scope guard: scoped users may only mutate deposits in their locations.
  const locationId = deposit.booking?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

  // Validate transitions (only from HELD):
  // - HELD -> APPLIED: set applied_at, NO transaction (BL-009)
  // - HELD -> REFUNDED: refunded_amount must equal deposit.amount (full refund)
  // - HELD -> PARTIALLY_REFUNDED: refunded_amount must be < deposit.amount
  // - HELD -> FORFEITED: no transaction
  if (deposit.status !== "HELD") {
    return { success: false, error: "Can only transition from HELD status" };
  }

  // Validate refund amounts before mutating anything.
  if (data.status === "REFUNDED" || data.status === "PARTIALLY_REFUNDED") {
    if (!data.refunded_amount || data.refunded_amount <= 0) {
      return { success: false, error: "Refunded amount required" };
    }
    if (
      data.status === "REFUNDED" &&
      data.refunded_amount !== Number(deposit.amount)
    ) {
      return {
        success: false,
        error: "Full refund must equal deposit amount",
      };
    }
    if (
      data.status === "PARTIALLY_REFUNDED" &&
      data.refunded_amount >= Number(deposit.amount)
    ) {
      return {
        success: false,
        error: "Partial refund must be less than deposit amount",
      };
    }
  }

  let shouldReallocate = false;

  if (data.status === "APPLIED") {
    // Create a credit bill item on the latest bill to offset the deposit
    const latestBill = await prisma.bill.findFirst({
      where: { booking_id: deposit.booking.id },
      orderBy: { due_date: "desc" },
    });

    // The deposit-offset bill item and the status flip must commit together so
    // we can't mark a deposit APPLIED without the offsetting credit (or vice
    // versa). Payment reallocation runs afterwards (idempotent, derived).
    await prisma.$transaction(async (tx) => {
      if (latestBill) {
        await tx.billItem.create({
          data: {
            bill_id: latestBill.id,
            description: "Potongan Deposit",
            amount: -Number(deposit.amount),
            type: "CREATED",
            related_id: { deposit_id: deposit.id },
          },
        });
      }
      await tx.deposit.update({
        where: { id: data.deposit_id },
        data: { status: data.status, applied_at: new Date() },
      });
    });

    shouldReallocate = latestBill !== null;
  } else if (
    data.status === "REFUNDED" ||
    data.status === "PARTIALLY_REFUNDED"
  ) {
    // BL-008: the refund EXPENSE transaction and the deposit status update must
    // commit together, so a refund can't be recorded without the deposit being
    // marked refunded (or vice versa).
    const locationId = deposit.booking.rooms!.location_id!;
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          amount: data.refunded_amount!,
          description: "Deposit",
          date: new Date(),
          category: "Deposit",
          type: "EXPENSE",
          location_id: locationId,
          related_id: { deposit_id: data.deposit_id },
        },
      });
      await tx.deposit.update({
        where: { id: data.deposit_id },
        data: {
          status: data.status,
          refunded_at: new Date(),
          refunded_amount: data.refunded_amount,
        },
      });
    });
  } else {
    // FORFEITED (or any other HELD-permitted target): status flip only.
    await prisma.deposit.update({
      where: { id: data.deposit_id },
      data: { status: data.status },
    });
  }

  // Reallocate + rebuild transactions after the APPLIED credit item committed.
  if (shouldReallocate) {
    await generatePaymentBillMappingFromPaymentsAndBills(deposit.booking.id);
    const payments = await prisma.payment.findMany({
      where: { booking_id: deposit.booking.id },
    });
    for (const p of payments) {
      await createOrUpdatePaymentTransactions(p.id);
    }
  }

  revalidatePath("/deposits");
  await logAudit(`deposit.status_changed: id=${data.deposit_id}, status=${data.status}${data.refunded_amount ? `, refunded=${data.refunded_amount}` : ""}`);
  return { success: true };
}

export async function updateDepositAmountAction(
  depositId: number,
  amount: number,
) {
  const { authorized } = await checkPermission("deposits.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  // Location scope guard: scoped users may only mutate deposits in their locations.
  const dep = await prisma.deposit.findUnique({
    where: { id: depositId },
    select: { booking: { select: { rooms: { select: { location_id: true } } } } },
  });
  const locationId = dep?.booking?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

  if (amount <= 0) return { success: false, error: "Amount must be positive" };
  await prisma.deposit.update({
    where: { id: depositId },
    data: { amount },
  });
  revalidatePath("/deposits");
  return { success: true };
}
