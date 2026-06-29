import type { Decimal } from "@prisma/client/runtime/library";
import { now as clockNow } from "@/app/_lib/util/clock";

interface BillForSummary {
  bill_item: { amount: Decimal }[];
  paymentBills: { amount: Decimal }[];
  due_date: Date;
}

interface BookingForSummary {
  bills: BillForSummary[];
  payments: { amount: Decimal }[];
  deposit: { amount: Decimal; status: string } | null;
}

export interface FinancialSummary {
  outstanding: number;
  totalPaid: number;
  activeDeposits: number;
  overdueCount: number;
}

export function computeFinancialSummary(bookings: BookingForSummary[]): FinancialSummary {
  const now = clockNow();
  now.setHours(0, 0, 0, 0);

  let outstanding = 0;
  let totalPaid = 0;
  let activeDeposits = 0;
  let overdueCount = 0;

  for (const booking of bookings) {
    for (const bill of booking.bills) {
      const billed = bill.bill_item.reduce((sum, item) => sum + Number(item.amount), 0);
      const paid = bill.paymentBills.reduce((sum, pb) => sum + Number(pb.amount), 0);
      const remaining = billed - paid;

      if (remaining > 0) {
        outstanding += remaining;
        if (new Date(bill.due_date) < now) {
          overdueCount++;
        }
      }
    }

    for (const payment of booking.payments) {
      totalPaid += Number(payment.amount);
    }

    if (booking.deposit && booking.deposit.status === "HELD") {
      activeDeposits += Number(booking.deposit.amount);
    }
  }

  return { outstanding, totalPaid, activeDeposits, overdueCount };
}
