"use server";

import { prisma } from "@/app/_lib/prisma";
import { uploadToS3, deleteFromS3 } from "@/app/_lib/s3";
import { generatePaymentBillMappingFromPaymentsAndBills } from "@/app/_lib/util/payment-allocation";
import { paymentSchema } from "@/app/_lib/zod/payment/zod";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";
import { logAudit } from "@/app/_lib/audit";

// BL-005: Transaction Splitting
export async function createOrUpdatePaymentTransactions(paymentId: number) {
  // Delete existing transactions linked to this payment
  await prisma.transaction.deleteMany({
    where: { related_id: { path: ["payment_id"], equals: paymentId } },
  });

  // Fetch payment with its bill allocations and bill items
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      paymentBills: {
        include: {
          bill: {
            include: {
              bill_item: true,
              bookings: { include: { rooms: true, deposit: true } },
            },
          },
        },
      },
      bookings: { include: { rooms: true, deposit: true } },
    },
  });

  if (!payment) return;

  // Verification gate: only create transactions for verified payments
  // status_id: 1=PENDING, 2=VERIFIED, 3=REJECTED; null=assumed verified (backwards compat)
  if (payment.status_id === 1 || payment.status_id === 3) {
    return;
  }

  const locationId = payment.bookings.rooms?.location_id;
  if (!locationId) return;

  let depositTotal = 0;
  let regularTotal = 0;
  let excessTotal = 0;
  let depositId: number | null = null;

  for (const pb of payment.paymentBills) {
    let pbRemaining = Number(pb.amount);

    // Find bill items with deposit_id in related_id (these are deposit items)
    const depositItems = pb.bill.bill_item.filter(
      (item) =>
        item.related_id &&
        typeof item.related_id === "object" &&
        (item.related_id as Record<string, unknown>).deposit_id
    );
    const regularItems = pb.bill.bill_item.filter(
      (item) =>
        !item.related_id ||
        typeof item.related_id !== "object" ||
        !(item.related_id as Record<string, unknown>).deposit_id
    );

    // Prioritize deposit items first
    for (const dItem of depositItems) {
      if (pbRemaining <= 0) break;
      const itemAmount = Number(dItem.amount);
      const allocated = Math.min(pbRemaining, itemAmount);
      depositTotal += allocated;
      depositId =
        (dItem.related_id as Record<string, unknown>).deposit_id as number;
      pbRemaining -= allocated;
    }

    // Remaining goes to regular
    for (const rItem of regularItems) {
      if (pbRemaining <= 0) break;
      const itemAmount = Number(rItem.amount);
      const allocated = Math.min(pbRemaining, itemAmount);
      regularTotal += allocated;
      pbRemaining -= allocated;
    }

    // If there's still remaining after all items, it's overpayment
    if (pbRemaining > 0) {
      excessTotal += pbRemaining;
    }
  }

  // Create "Deposit" INCOME transaction if depositTotal > 0
  if (depositTotal > 0 && depositId) {
    await prisma.transaction.create({
      data: {
        amount: depositTotal,
        description: "Deposit",
        date: payment.payment_date,
        category: "Deposit",
        type: "INCOME",
        location_id: locationId,
        related_id: { payment_id: paymentId, deposit_id: depositId },
      },
    });

    // BL-006: If deposit status is UNPAID, update to HELD
    const deposit = payment.bookings.deposit;
    if (deposit && deposit.status === "UNPAID") {
      await prisma.deposit.update({
        where: { id: deposit.id },
        data: { status: "HELD" },
      });
    }
  }

  // Create "Biaya Sewa" INCOME transaction if regularTotal > 0
  if (regularTotal > 0) {
    await prisma.transaction.create({
      data: {
        amount: regularTotal,
        description: "Biaya Sewa",
        date: payment.payment_date,
        category: "Sewa",
        type: "INCOME",
        location_id: locationId,
        related_id: { payment_id: paymentId },
      },
    });
  }

  // Create "Kelebihan Bayar" CREDIT transaction if there's overpayment
  // Overpayment is a liability (held for / owed to the tenant), not revenue.
  if (excessTotal > 0) {
    await prisma.transaction.create({
      data: {
        amount: excessTotal,
        description: "Kelebihan Bayar",
        date: payment.payment_date,
        category: "Kelebihan Bayar",
        type: "CREDIT",
        location_id: locationId,
        related_id: { payment_id: paymentId },
      },
    });
  }

  // BL-007: If no deposit transactions remain for a deposit, revert to UNPAID
  if (payment.bookings.deposit && !depositId) {
    const deposit = payment.bookings.deposit;
    const remainingDepositTx = await prisma.transaction.findMany({
      where: {
        related_id: { path: ["deposit_id"], equals: deposit.id },
        type: "INCOME",
      },
    });
    if (remainingDepositTx.length === 0 && deposit.status === "HELD") {
      await prisma.deposit.update({
        where: { id: deposit.id },
        data: { status: "UNPAID" },
      });
    }
  }
}

// BL-007 helper: Check if deposit should revert to UNPAID
async function checkDepositRevert(bookingId: number) {
  const deposit = await prisma.deposit.findUnique({
    where: { booking_id: bookingId },
  });
  if (!deposit || deposit.status !== "HELD") return;

  const depositTransactions = await prisma.transaction.findMany({
    where: {
      related_id: { path: ["deposit_id"], equals: deposit.id },
      type: "INCOME",
    },
  });

  if (depositTransactions.length === 0) {
    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: "UNPAID" },
    });
  }
}

export async function upsertPaymentAction(data: {
  id?: number;
  booking_id: number;
  amount: number;
  payment_date: string | Date;
  status_id?: number;
  payment_proof?: string; // base64
  payment_proof_name?: string;
  allocation_mode: "auto" | "manual";
  payment_method?: "CASH" | "BANK_TRANSFER" | "EWALLET";
  manual_allocations?: Array<{ bill_id: number; amount: number }>;
}) {
  const { authorized } = await checkPermission("payments.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  // Validate with Zod
  const parsed = paymentSchema.safeParse({
    booking_id: data.booking_id,
    amount: data.amount,
    payment_date: data.payment_date,
    status_id: data.status_id,
    allocation_mode: data.allocation_mode,
    payment_method: data.payment_method,
    manual_allocations: data.manual_allocations,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validasi gagal" };
  }

  // Manual mode: validate sum equals amount
  if (data.allocation_mode === "manual" && data.manual_allocations) {
    const sum = data.manual_allocations.reduce((s, a) => s + a.amount, 0);
    if (Math.abs(sum - data.amount) > 0.01) {
      return {
        success: false,
        error: `Total alokasi manual (${sum}) tidak sama dengan jumlah pembayaran (${data.amount})`,
      };
    }
  }

  // Handle S3 upload for payment proof
  let proofKey: string | undefined;
  if (data.payment_proof && data.payment_proof_name) {
    const base64Data = data.payment_proof.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const timestamp = new Date().toISOString();
    const key = `booking-payments/${data.booking_id}/${timestamp}/${data.payment_proof_name}`;
    const mimeType = data.payment_proof.match(/^data:([^;]+);/)?.[1] ?? "application/octet-stream";
    await uploadToS3(key, buffer, mimeType);
    proofKey = key;
  }

  let paymentId: number;

  if (data.id) {
    // Update existing payment
    const existing = await prisma.payment.findUnique({ where: { id: data.id } });
    if (!existing) return { success: false, error: "Pembayaran tidak ditemukan" };

    // Delete old proof from S3 if we have a new one
    if (proofKey && existing.payment_proof) {
      await deleteFromS3(existing.payment_proof).catch(() => {});
    }

    await prisma.payment.update({
      where: { id: data.id },
      data: {
        amount: data.amount,
        payment_date: new Date(data.payment_date),
        status_id: data.status_id ?? 1,
        allocation_mode: data.allocation_mode,
        payment_method: data.payment_method ?? null,
        ...(proofKey && { payment_proof: proofKey }),
      },
    });
    paymentId = data.id;
  } else {
    // Create new payment
    const payment = await prisma.payment.create({
      data: {
        booking_id: data.booking_id,
        amount: data.amount,
        payment_date: new Date(data.payment_date),
        status_id: data.status_id ?? 1,
        payment_proof: proofKey,
        allocation_mode: data.allocation_mode,
        payment_method: data.payment_method ?? null,
      },
    });
    paymentId = payment.id;
  }

  // Handle allocation
  if (data.allocation_mode === "auto") {
    // Auto mode: regenerate all mappings for this booking
    await generatePaymentBillMappingFromPaymentsAndBills(data.booking_id);
  } else {
    // Manual mode: delete existing and create new PaymentBill records
    await prisma.paymentBill.deleteMany({ where: { payment_id: paymentId } });
    if (data.manual_allocations) {
      for (const alloc of data.manual_allocations) {
        if (alloc.amount > 0) {
          await prisma.paymentBill.create({
            data: {
              payment_id: paymentId,
              bill_id: alloc.bill_id,
              amount: alloc.amount,
            },
          });
        }
      }
    }
  }

  // Create/update transactions
  await createOrUpdatePaymentTransactions(paymentId);

  revalidatePath("/payments");
  await logAudit(`payment.${data.id ? "updated" : "created"}: id=${paymentId}, amount=${data.amount}, booking_id=${data.booking_id}`);
  return { success: true, paymentId };
}

export async function deletePaymentAction(paymentId: number) {
  const { authorized } = await checkPermission("payments.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { bookings: true },
  });

  if (!payment) return { success: false, error: "Pembayaran tidak ditemukan" };

  const bookingId = payment.booking_id;

  // Delete transactions linked to payment
  await prisma.transaction.deleteMany({
    where: { related_id: { path: ["payment_id"], equals: paymentId } },
  });

  // Delete old proof from S3
  if (payment.payment_proof) {
    await deleteFromS3(payment.payment_proof).catch(() => {});
  }

  // Delete payment (cascades PaymentBills)
  await prisma.payment.delete({ where: { id: paymentId } });

  // BL-007: Check deposit status revert
  await checkDepositRevert(bookingId);

  // Regenerate remaining payment mappings if any payments left
  const remainingPayments = await prisma.payment.findMany({
    where: { booking_id: bookingId },
  });

  if (remainingPayments.length > 0) {
    await generatePaymentBillMappingFromPaymentsAndBills(bookingId);
    // Rebuild transactions for remaining payments
    for (const p of remainingPayments) {
      await createOrUpdatePaymentTransactions(p.id);
    }
  }

  revalidatePath("/payments");
  await logAudit(`payment.deleted: id=${paymentId}, booking_id=${bookingId}`);
  return { success: true };
}
