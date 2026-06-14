import { prisma } from "@/app/_lib/prisma";
import { roundMoney } from "@/app/_lib/util/money";

// BL-014: Deterministic Regeneration of Payment-Bill Mappings.
//
// Internal helper (NOT a server action). Called from guarded server actions and
// from the monthly-billing cron, so it must not enforce per-user permissions
// itself — callers are responsible for authorization.
export async function generatePaymentBillMappingFromPaymentsAndBills(
  bookingId: number
) {
  const allPayments = await prisma.payment.findMany({
    where: { booking_id: bookingId, deletedAt: null },
    orderBy: { payment_date: "asc" },
  });

  const bills = await prisma.bill.findMany({
    where: { booking_id: bookingId, deletedAt: null },
    include: { bill_item: true },
    orderBy: { due_date: "asc" },
  });

  // Only VERIFIED payments may reduce a bill's outstanding balance. status_id
  // 1=PENDING, 2=VERIFIED, 3=REJECTED; null=legacy/assumed-verified. This mirrors
  // the verification gate in createOrUpdatePaymentTransactions so a pending or
  // rejected payment can't make a bill look paid.
  const isVerified = (statusId: number | null) =>
    statusId === null || statusId === 2;

  // Separate manual and auto payments. All auto PaymentBill rows are deleted and
  // regenerated below; we only ever recreate them for verified auto payments, so
  // a pending/rejected auto payment ends up with no allocation.
  const autoPayments = allPayments.filter(
    (p) => p.allocation_mode !== "manual" && isVerified(p.status_id)
  );
  const allAutoPayments = allPayments.filter(
    (p) => p.allocation_mode !== "manual"
  );
  const manualPayments = allPayments.filter((p) => p.allocation_mode === "manual");

  // Only delete PaymentBill records for AUTO payments (including unverified ones,
  // so a payment that drops from VERIFIED back to PENDING loses its allocation).
  const autoPaymentIds = allAutoPayments.map((p) => p.id);
  if (autoPaymentIds.length > 0) {
    await prisma.paymentBill.deleteMany({
      where: { payment_id: { in: autoPaymentIds } },
    });
  }

  // Calculate how much each bill already has from manual allocations
  const manualBillAllocated = new Map<number, number>();
  if (manualPayments.length > 0) {
    const manualMappings = await prisma.paymentBill.findMany({
      where: { payment_id: { in: manualPayments.map((p) => p.id) } },
    });
    for (const m of manualMappings) {
      manualBillAllocated.set(
        m.bill_id,
        (manualBillAllocated.get(m.bill_id) || 0) + Number(m.amount)
      );
    }
  }

  // Track cumulative allocations per bill (starting from manual amounts)
  const billAllocated = new Map<number, number>(manualBillAllocated);

  for (const payment of autoPayments) {
    let remainingPayment = Number(payment.amount);

    for (const bill of bills) {
      if (remainingPayment <= 0) break;

      const billTotal = bill.bill_item.reduce(
        (s, i) => s + Number(i.amount),
        0
      );
      const alreadyAllocated = billAllocated.get(bill.id) || 0;
      const outstanding = billTotal - alreadyAllocated;

      if (outstanding <= 0) continue;

      const allocated = roundMoney(Math.min(remainingPayment, outstanding));
      await prisma.paymentBill.create({
        data: {
          payment_id: payment.id,
          bill_id: bill.id,
          amount: allocated,
        },
      });

      billAllocated.set(bill.id, alreadyAllocated + allocated);
      remainingPayment -= allocated;
    }
  }
}
