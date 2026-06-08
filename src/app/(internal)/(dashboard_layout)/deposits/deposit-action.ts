"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import type { DepositStatus } from "@prisma/client";

export async function updateDepositStatusAction(data: {
  deposit_id: number;
  status: DepositStatus;
  refunded_amount?: number;
}) {
  const deposit = await prisma.deposit.findUnique({
    where: { id: data.deposit_id },
    include: { booking: { include: { rooms: true } } },
  });
  if (!deposit) return { success: false, error: "Deposit not found" };

  // Validate transitions (only from HELD):
  // - HELD -> APPLIED: set applied_at, NO transaction (BL-009)
  // - HELD -> REFUNDED: refunded_amount must equal deposit.amount (full refund)
  // - HELD -> PARTIALLY_REFUNDED: refunded_amount must be < deposit.amount
  // - HELD -> FORFEITED: no transaction
  if (deposit.status !== "HELD") {
    return { success: false, error: "Can only transition from HELD status" };
  }

  const updateData: Record<string, unknown> = { status: data.status };

  if (data.status === "APPLIED") {
    updateData.applied_at = new Date();
  }

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

    updateData.refunded_at = new Date();
    updateData.refunded_amount = data.refunded_amount;

    // BL-008: Create EXPENSE transaction for refund
    const locationId = deposit.booking.rooms!.location_id!;
    await prisma.transaction.create({
      data: {
        amount: data.refunded_amount,
        description: "Deposit",
        date: new Date(),
        category: "Deposit",
        type: "EXPENSE",
        location_id: locationId,
        related_id: { deposit_id: data.deposit_id },
      },
    });
  }

  await prisma.deposit.update({
    where: { id: data.deposit_id },
    data: updateData,
  });

  revalidatePath("/deposits");
  return { success: true };
}

export async function updateDepositAmountAction(
  depositId: number,
  amount: number,
) {
  if (amount <= 0) return { success: false, error: "Amount must be positive" };
  await prisma.deposit.update({
    where: { id: depositId },
    data: { amount },
  });
  revalidatePath("/deposits");
  return { success: true };
}
