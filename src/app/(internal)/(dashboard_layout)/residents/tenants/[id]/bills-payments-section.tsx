"use client";

import { useState } from "react";
import { Decimal } from "@prisma/client/runtime/library";

interface BillItem {
  description: string;
  amount: string | number | Decimal;
}

interface PaymentBill {
  amount: string | number | Decimal;
}

interface Bill {
  id: number;
  invoice_number: string | null;
  description: string;
  due_date: string | Date;
  bill_item: BillItem[];
  paymentBills: PaymentBill[];
}

interface Payment {
  id: number;
  payment_date: string | Date;
  amount: string | number | Decimal;
  payment_method: string | null;
  paymentstatuses: { status: string } | null;
  paymentBills: { amount: string | number | Decimal }[];
}

interface BookingWithBills {
  id: number;
  rooms: { room_number: string } | null;
  bills: Bill[];
  payments: Payment[];
}

function formatCurrency(amount: string | number | Decimal) {
  return `Rp${Number(amount).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string | Date) {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function BillStatusBadge({ billed, paid, dueDate }: { billed: number; paid: number; dueDate: string | Date }) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;

  let label: string;
  let bg: string;
  let text: string;

  if (paid >= billed) {
    label = "Lunas";
    bg = "#D1FAE5";
    text = "#059669";
  } else if (due < now) {
    label = "Jatuh Tempo";
    bg = "#FEE2E2";
    text = "#DC2626";
  } else if (paid > 0) {
    label = "Sebagian";
    bg = "#FEF3C7";
    text = "#D97706";
  } else {
    label = "Belum Bayar";
    bg = "#E5E7EB";
    text = "#6B7280";
  }

  return (
    <span
      className="px-2 py-0.5 text-xs font-medium rounded-full"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}

function BookingBillsGroup({ booking }: { booking: BookingWithBills }) {
  const [showPayments, setShowPayments] = useState(false);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
    >
      {/* Booking header */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-card)" }}>
        <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
          Kamar {booking.rooms?.room_number || "-"} — Booking #{booking.id}
        </span>
      </div>

      {/* Bills table */}
      {booking.bills.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Invoice", "Deskripsi", "Jatuh Tempo", "Jumlah", "Dibayar", "Sisa", "Status"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2 text-left text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {booking.bills.map((bill) => {
                const billed = bill.bill_item.reduce((s, i) => s + Number(i.amount), 0);
                const paid = bill.paymentBills.reduce((s, p) => s + Number(p.amount), 0);
                const remaining = billed - paid;

                return (
                  <tr key={bill.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--color-text-primary)" }}>
                      {bill.invoice_number || "-"}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--color-text-primary)" }}>
                      {bill.description}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--color-text-primary)" }}>
                      {formatDate(bill.due_date)}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--color-text-primary)" }}>
                      {formatCurrency(billed)}
                    </td>
                    <td className="px-4 py-2" style={{ color: "#059669" }}>
                      {formatCurrency(paid)}
                    </td>
                    <td className="px-4 py-2" style={{ color: remaining > 0 ? "#D97706" : "var(--color-text-primary)" }}>
                      {formatCurrency(remaining)}
                    </td>
                    <td className="px-4 py-2">
                      <BillStatusBadge billed={billed} paid={paid} dueDate={bill.due_date} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-3 text-sm italic" style={{ color: "var(--color-text-secondary)" }}>
          Belum ada tagihan.
        </p>
      )}

      {/* Expandable payments */}
      {booking.payments.length > 0 && (
        <div style={{ borderTop: "1px solid var(--color-border)" }}>
          <button
            onClick={() => setShowPayments(!showPayments)}
            className="w-full px-4 py-2 text-left text-sm font-medium flex items-center gap-1"
            style={{ color: "var(--color-accent)" }}
          >
            <span style={{ transform: showPayments ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms" }}>
              ▶
            </span>
            Lihat Pembayaran ({booking.payments.length})
          </button>
          {showPayments && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {["Tanggal", "Jumlah", "Metode", "Status"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {booking.payments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="px-4 py-2" style={{ color: "var(--color-text-primary)" }}>
                        {formatDate(p.payment_date)}
                      </td>
                      <td className="px-4 py-2" style={{ color: "var(--color-text-primary)" }}>
                        {formatCurrency(Number(p.amount))}
                      </td>
                      <td className="px-4 py-2" style={{ color: "var(--color-text-primary)" }}>
                        {p.payment_method || "-"}
                      </td>
                      <td className="px-4 py-2" style={{ color: "var(--color-text-primary)" }}>
                        {p.paymentstatuses?.status || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BillsPaymentsSection({ bookings }: { bookings: BookingWithBills[] }) {
  const bookingsWithBills = bookings.filter((b) => b.bills.length > 0 || b.payments.length > 0);

  if (bookingsWithBills.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
          Tagihan & Pembayaran
        </h2>
        <p className="text-sm italic" style={{ color: "var(--color-text-secondary)" }}>
          Belum ada tagihan atau pembayaran.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
        Tagihan & Pembayaran
      </h2>
      <div className="space-y-4">
        {bookingsWithBills.map((b) => (
          <BookingBillsGroup key={b.id} booking={b} />
        ))}
      </div>
    </section>
  );
}
