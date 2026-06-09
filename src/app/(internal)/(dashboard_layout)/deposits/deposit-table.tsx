"use client";

import { useState, useTransition } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { formatCurrency } from "@/app/_lib/util/currency";
import {
  updateDepositStatusAction,
  updateDepositAmountAction,
} from "./deposit-action";
import { ActionMenu, Icons } from "@/app/_components/action-menu";

type DepositStatus =
  | "UNPAID"
  | "HELD"
  | "APPLIED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "FORFEITED";

interface Deposit {
  id: number;
  booking_id: number;
  amount: string;
  status: DepositStatus;
  refunded_at: string | null;
  applied_at: string | null;
  refunded_amount: string | null;
  createdAt: string;
  updatedAt: string;
  booking: {
    id: number;
    tenants: { id: string; name: string } | null;
    rooms: { id: number; room_number: string; location_id: number } | null;
  };
}

const STATUS_BADGE_STYLES: Record<
  DepositStatus,
  { bg: string; color: string; label: string }
> = {
  UNPAID: { bg: "#f3f4f6", color: "#6b7280", label: "Unpaid" },
  HELD: { bg: "#dbeafe", color: "#1d4ed8", label: "Held" },
  APPLIED: { bg: "#dcfce7", color: "#16a34a", label: "Applied" },
  REFUNDED: { bg: "#f3e8ff", color: "#9333ea", label: "Refunded" },
  PARTIALLY_REFUNDED: { bg: "#ffedd5", color: "#ea580c", label: "Partially Refunded" },
  FORFEITED: { bg: "#fee2e2", color: "#dc2626", label: "Forfeited" },
};

function StatusBadge({ status }: { status: DepositStatus }) {
  const style = STATUS_BADGE_STYLES[status];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  );
}

export function DepositTable({ deposits }: { deposits: Deposit[] }) {
  const [statusModalDeposit, setStatusModalDeposit] = useState<Deposit | null>(
    null,
  );
  const [amountModalDeposit, setAmountModalDeposit] = useState<Deposit | null>(
    null,
  );

  const columns: ColumnDef<Deposit, unknown>[] = [
    {
      accessorKey: "booking",
      header: "Pemesanan",
      cell: ({ row }) => {
        const deposit = row.original;
        const room = deposit.booking.rooms?.room_number ?? "-";
        const tenant = deposit.booking.tenants?.name ?? "-";
        return (
          <div>
            <div
              className="font-medium text-sm"
              style={{ color: "var(--color-text-primary)" }}
            >
              {room}
            </div>
            <div
              className="text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {tenant}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "amount",
      header: "Jumlah",
      cell: ({ row }) => formatCurrency(row.original.amount),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "refunded_amount",
      header: "Jumlah Refund",
      cell: ({ row }) =>
        row.original.refunded_amount
          ? formatCurrency(row.original.refunded_amount)
          : "-",
    },
    {
      accessorKey: "applied_at",
      header: "Diterapkan",
      cell: ({ row }) =>
        row.original.applied_at
          ? new Date(row.original.applied_at).toLocaleDateString("id-ID")
          : "-",
    },
    {
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => {
        const deposit = row.original;
        const items = [
          ...(deposit.status === "HELD"
            ? [{ label: "Ubah Status", icon: Icons.status, onClick: () => setStatusModalDeposit(deposit) }]
            : []),
          ...((deposit.status === "UNPAID" || deposit.status === "HELD")
            ? [{ label: "Edit Jumlah", icon: Icons.money, onClick: () => setAmountModalDeposit(deposit), variant: "warning" as const }]
            : []),
        ];
        if (items.length === 0) return null;
        return <ActionMenu items={items} />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Deposit
        </h1>
      </div>

      <DataTable
        columns={columns}
        data={deposits}
        searchPlaceholder="Cari deposit..."
      />

      {statusModalDeposit && (
        <StatusUpdateModal
          deposit={statusModalDeposit}
          onClose={() => setStatusModalDeposit(null)}
        />
      )}

      {amountModalDeposit && (
        <AmountEditModal
          deposit={amountModalDeposit}
          onClose={() => setAmountModalDeposit(null)}
        />
      )}
    </div>
  );
}

function StatusUpdateModal({
  deposit,
  onClose,
}: {
  deposit: Deposit;
  onClose: () => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState<DepositStatus | "">("");
  const [refundedAmount, setRefundedAmount] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const allowedTransitions: DepositStatus[] = [
    "APPLIED",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
    "FORFEITED",
  ];

  const handleSubmit = () => {
    if (!selectedStatus) {
      setError("Pilih status terlebih dahulu");
      return;
    }

    startTransition(async () => {
      const result = await updateDepositStatusAction({
        deposit_id: deposit.id,
        status: selectedStatus as DepositStatus,
        refunded_amount: refundedAmount ? parseFloat(refundedAmount) : undefined,
      });
      if (result.success) {
        onClose();
      } else {
        setError(result.error ?? "Terjadi kesalahan");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6 space-y-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
          boxShadow: "var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.25))",
        }}
      >
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Ubah Status Deposit
        </h2>

        <div className="space-y-1">
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Status Saat Ini
          </p>
          <StatusBadge status={deposit.status} />
        </div>

        <div className="space-y-2">
          <label
            className="block text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Status Baru
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => {
              const val = e.target.value as DepositStatus | "";
              setSelectedStatus(val);
              setError("");
              if (val === "REFUNDED") {
                setRefundedAmount(deposit.amount);
              } else if (val !== "PARTIALLY_REFUNDED") {
                setRefundedAmount("");
              }
            }}
            className="w-full px-3 py-2 text-sm rounded-lg border"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg-card)",
              color: "var(--color-text-primary)",
            }}
          >
            <option value="">Pilih status...</option>
            {allowedTransitions.map((s) => (
              <option key={s} value={s}>
                {STATUS_BADGE_STYLES[s].label}
              </option>
            ))}
          </select>
        </div>

        {(selectedStatus === "REFUNDED" ||
          selectedStatus === "PARTIALLY_REFUNDED") && (
          <div className="space-y-2">
            <label
              className="block text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Jumlah Refund
            </label>
            <input
              type="number"
              value={refundedAmount}
              onChange={(e) => setRefundedAmount(e.target.value)}
              disabled={selectedStatus === "REFUNDED"}
              className="w-full px-3 py-2 text-sm rounded-lg border disabled:opacity-60"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
              }}
              placeholder="Masukkan jumlah refund"
            />
            {selectedStatus === "REFUNDED" && (
              <p
                className="text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Jumlah refund penuh otomatis terisi
              </p>
            )}
          </div>
        )}

        <div
          className="rounded-lg p-3 text-sm"
          style={{ backgroundColor: "#fffbeb", color: "#92400e" }}
        >
          <strong>Peringatan:</strong> Mengubah status deposit dapat memengaruhi
          alokasi pembayaran dan catatan keuangan. Tindakan ini tidak dapat dibatalkan.
        </div>

        {error && (
          <p className="text-sm" style={{ color: "#dc2626" }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !selectedStatus}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "white",
            }}
          >
            {isPending ? "Memperbarui..." : "Konfirmasi"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AmountEditModal({
  deposit,
  onClose,
}: {
  deposit: Deposit;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState<string>(deposit.amount);
  const [error, setError] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Jumlah harus berupa angka positif");
      return;
    }

    startTransition(async () => {
      const result = await updateDepositAmountAction(deposit.id, numAmount);
      if (result.success) {
        onClose();
      } else {
        setError(result.error ?? "Terjadi kesalahan");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6 space-y-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
          boxShadow: "var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.25))",
        }}
      >
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Edit Jumlah Deposit
        </h2>

        <div className="space-y-2">
          <label
            className="block text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Jumlah
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError("");
            }}
            className="w-full px-3 py-2 text-sm rounded-lg border"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg-card)",
              color: "var(--color-text-primary)",
            }}
            placeholder="Masukkan jumlah deposit"
          />
        </div>

        {error && (
          <p className="text-sm" style={{ color: "#dc2626" }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "white",
            }}
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
