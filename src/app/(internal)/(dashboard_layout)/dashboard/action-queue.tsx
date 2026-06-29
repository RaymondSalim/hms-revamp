"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import type { ActionQueue as ActionQueueData, ActionQueueItem } from "@/app/_db/today-tasks";
import { useConfirm } from "@/app/_components/confirm-dialog";
import { usePermissions } from "@/app/_context/permissions-context";
import { businessToday } from "@/app/_lib/util/business-time";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";
import { setPaymentStatusAction } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { resendBillEmailAction } from "@/app/(internal)/(dashboard_layout)/bills/bill-action";
import { checkInOutAction } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";

const DISABLED_REASON = "Anda tidak memiliki izin untuk tindakan ini";

export function ActionQueue({ queue }: { queue: ActionQueueData }) {
  const confirm = useConfirm();
  const { can } = usePermissions();
  // Per-row pending key: `${kind}-${id}` while that row's action is in flight.
  const [pending, setPending] = useState<string | null>(null);

  const total =
    queue.payments.length + queue.bills.length + queue.checkins.length + queue.expiring.length;

  const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) => {
    setPending(key);
    try {
      const res = await fn();
      if (res.success) toast.success(okMsg);
      else toast.error(res.error ?? "Gagal memproses tindakan");
    } catch {
      toast.error("Gagal memproses tindakan");
    } finally {
      setPending(null);
    }
  };

  const verifyPayment = (item: ActionQueueItem) =>
    run(`payment-${item.id}`, () => setPaymentStatusAction(item.id, PAYMENT_STATUS.VERIFIED), "Pembayaran diverifikasi");

  const rejectPayment = async (item: ActionQueueItem) => {
    if (!(await confirm({ message: "Tolak pembayaran ini? Tindakan ini akan menghapus transaksi terkait.", danger: true, confirmLabel: "Tolak" }))) return;
    await run(`payment-${item.id}`, () => setPaymentStatusAction(item.id, PAYMENT_STATUS.REJECTED), "Pembayaran ditolak");
  };

  const remindBill = (item: ActionQueueItem) =>
    run(`bill-${item.id}`, () => resendBillEmailAction(item.id), "Email pengingat terkirim");

  const checkIn = async (item: ActionQueueItem) => {
    if (!(await confirm({ message: "Catat check-in untuk pemesanan ini?", confirmLabel: "Check-in" }))) return;
    await run(`checkin-${item.id}`, () =>
      checkInOutAction({
        booking_id: item.bookingId,
        event_type: "CHECK_IN",
        event_date: businessToday(),
        tenant_id: item.tenantId,
      }), "Check-in tercatat");
  };

  if (total === 0) {
    return (
      <div data-tour="action-queue">
        <SectionHeading />
        <div
          className="rounded-xl border p-6 text-sm"
          style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          Tidak ada tindakan tertunda — semua beres 🎉
        </div>
      </div>
    );
  }

  const canPay = can("payments.manage");
  const canBill = can("bills.manage");
  const canBook = can("bookings.manage");

  return (
    <div data-tour="action-queue">
      <SectionHeading />
      <div
        className="rounded-xl border divide-y"
        style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border)", boxShadow: "var(--shadow-sm)" }}
      >
        {queue.payments.map((item) => (
          <Row key={`payment-${item.id}`} item={item}>
            <ActionButton
              label="Verifikasi"
              variant="success"
              disabled={!canPay}
              disabledReason={DISABLED_REASON}
              loading={pending === `payment-${item.id}`}
              onClick={() => verifyPayment(item)}
            />
            <ActionButton
              label="Tolak"
              variant="danger"
              disabled={!canPay}
              disabledReason={DISABLED_REASON}
              loading={pending === `payment-${item.id}`}
              onClick={() => rejectPayment(item)}
            />
          </Row>
        ))}

        {queue.bills.map((item) => (
          <Row key={`bill-${item.id}`} item={item}>
            <ActionButton
              label="Ingatkan"
              variant="default"
              disabled={!canBill || item.canEmail === false}
              disabledReason={item.canEmail === false ? "Penyewa tidak memiliki email" : DISABLED_REASON}
              loading={pending === `bill-${item.id}`}
              onClick={() => remindBill(item)}
            />
          </Row>
        ))}

        {queue.checkins.map((item) => (
          <Row key={`checkin-${item.id}`} item={item}>
            <ActionButton
              label="Check-in"
              variant="default"
              disabled={!canBook}
              disabledReason={DISABLED_REASON}
              loading={pending === `checkin-${item.id}`}
              onClick={() => checkIn(item)}
            />
          </Row>
        ))}

        {queue.expiring.map((item) => (
          <Row key={`expiring-${item.id}`} item={item}>
            <Link
              href={item.href}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              Lihat
            </Link>
          </Row>
        ))}
      </div>
    </div>
  );
}

function SectionHeading() {
  return (
    <h2
      className="text-sm font-semibold uppercase tracking-wide mb-3"
      style={{ color: "var(--color-text-secondary)" }}
    >
      Perlu Tindakan
    </h2>
  );
}

function Row({ item, children }: { item: ActionQueueItem; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
          {item.primary}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
          {item.secondary}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  );
}

function ActionButton({
  label,
  variant,
  disabled,
  disabledReason,
  loading,
  onClick,
}: {
  label: string;
  variant: "default" | "success" | "danger";
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  onClick: () => void;
}) {
  const palette: Record<string, { bg: string; color: string }> = {
    default: { bg: "var(--color-accent-light)", color: "var(--color-accent)" },
    success: { bg: "#D1FAE5", color: "#059669" },
    danger: { bg: "#FEF2F2", color: "#DC2626" },
  };
  const style = palette[variant];
  const isOff = Boolean(disabled) || Boolean(loading);
  return (
    <button
      onClick={isOff ? undefined : onClick}
      disabled={isOff}
      title={disabled ? disabledReason : label}
      className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
      style={{
        backgroundColor: style.bg,
        color: style.color,
        opacity: isOff ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : loading ? "wait" : "pointer",
      }}
    >
      {loading ? "..." : label}
    </button>
  );
}
