"use client";

import { useState, useEffect, useCallback } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { FileUpload } from "@/app/_components/file-upload";
import { formatCurrency } from "@/app/_lib/util/currency";
import { simulateUnpaidBillPaymentAction } from "@/app/(internal)/(dashboard_layout)/bills/bill-action";
import { upsertPaymentAction, deletePaymentAction } from "./payment-action";
import { ActionMenu, Icons } from "@/app/_components/action-menu";
import { SearchableSelect } from "@/app/_components/searchable-select";
import { toast } from "react-toastify";

// --- Type Definitions ---

interface PaymentRow {
  id: number;
  booking_id: number;
  amount: string;
  payment_date: string;
  payment_proof: string | null;
  status_id: number | null;
  payment_method?: "CASH" | "BANK_TRANSFER" | "EWALLET" | null;
  bookings: {
    id: number;
    tenants: { id: string; name: string } | null;
    rooms: { id: number; room_number: string } | null;
  };
  paymentBills: Array<{ id: number; bill_id: number; amount: string }>;
  paymentstatuses: { id: number; status: string } | null;
}

interface PaymentStatusOption {
  id: number;
  status: string;
}

interface BillOption {
  id: number;
  description: string;
  due_date: string;
  bill_item: Array<{ id: number; amount: string }>;
  paymentBills: Array<{ id: number; amount: string; payment_id: number }>;
}

interface BookingOption {
  id: number;
  tenants: { id: string; name: string } | null;
  rooms: { id: number; room_number: string } | null;
  bills: BillOption[];
}

interface Props {
  payments: PaymentRow[];
  paymentStatuses: PaymentStatusOption[];
  bookings: BookingOption[];
}

interface AllocationPreview {
  bill_id: number;
  amount: number;
  description: string;
}

// --- Helper Components ---

function StatusBadge({ status }: { status: string }) {
  let bg = "var(--color-accent-light)";
  let color = "var(--color-accent)";

  switch (status.toUpperCase()) {
    case "PENDING":
      bg = "#FEF3C7";
      color = "#D97706";
      break;
    case "VERIFIED":
      bg = "#D1FAE5";
      color = "#059669";
      break;
    case "REJECTED":
      bg = "#FEE2E2";
      color = "#DC2626";
      break;
  }

  return (
    <span
      className="px-2 py-1 text-xs font-medium rounded-full"
      style={{ backgroundColor: bg, color }}
    >
      {status}
    </span>
  );
}

// --- Main Component ---

export function PaymentTable({ payments, paymentStatuses, bookings }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<PaymentRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PaymentRow | null>(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [formBookingId, setFormBookingId] = useState<number | "">("");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formDate, setFormDate] = useState<string>("");
  const [formStatusId, setFormStatusId] = useState<number>(1);
  const [formProofBase64, setFormProofBase64] = useState<string>("");
  const [formProofName, setFormProofName] = useState<string>("");
  const [formAllocMode, setFormAllocMode] = useState<"auto" | "manual">("auto");
  const [formPaymentMethod, setFormPaymentMethod] = useState<
    "CASH" | "BANK_TRANSFER" | "EWALLET" | ""
  >("");
  const [manualAllocations, setManualAllocations] = useState<
    Array<{ bill_id: number; amount: string }>
  >([]);
  const [allocPreview, setAllocPreview] = useState<AllocationPreview[]>([]);

  const resetForm = () => {
    setFormBookingId("");
    setFormAmount("");
    setFormDate("");
    setFormStatusId(1);
    setFormProofBase64("");
    setFormProofName("");
    setFormAllocMode("auto");
    setFormPaymentMethod("");
    setManualAllocations([]);
    setAllocPreview([]);
  };

  const openCreate = () => {
    resetForm();
    setEditingRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: PaymentRow) => {
    setEditingRow(row);
    setFormBookingId(row.booking_id);
    setFormAmount(String(Number(row.amount)));
    setFormDate(row.payment_date.split("T")[0]);
    setFormStatusId(row.status_id ?? 1);
    setFormProofBase64("");
    setFormProofName("");
    setFormAllocMode("auto");
    setFormPaymentMethod(row.payment_method ?? "");
    setManualAllocations([]);
    setAllocPreview([]);
    setModalOpen(true);
  };

  // Auto-allocation preview
  const fetchPreview = useCallback(async () => {
    if (
      formAllocMode !== "auto" ||
      !formBookingId ||
      !formAmount ||
      Number(formAmount) <= 0
    )
      return;

    try {
      const result = await simulateUnpaidBillPaymentAction(
        Number(formBookingId),
        Number(formAmount)
      );
      setAllocPreview(result);
    } catch {
      setAllocPreview([]);
    }
  }, [formAllocMode, formBookingId, formAmount]);

  useEffect(() => {
    if (formAllocMode === "auto" && formBookingId && formAmount) {
      const timeout = setTimeout(fetchPreview, 400);
      return () => clearTimeout(timeout);
    } else {
      setAllocPreview([]);
    }
  }, [formAllocMode, formBookingId, formAmount, fetchPreview]);

  // Initialize manual allocations when switching to manual mode or changing booking
  useEffect(() => {
    if (formAllocMode === "manual" && formBookingId) {
      const selectedBooking = bookings.find((b) => b.id === Number(formBookingId));
      if (selectedBooking) {
        const allocs = selectedBooking.bills.map((bill) => ({
          bill_id: bill.id,
          amount: "",
        }));
        setManualAllocations(allocs);
      }
    }
  }, [formAllocMode, formBookingId, bookings]);

  const handleSubmit = async () => {
    if (!formBookingId || !formAmount || !formDate) {
      toast.error("Lengkapi semua field yang diperlukan");
      return;
    }

    setLoading(true);
    const result = await upsertPaymentAction({
      id: editingRow?.id,
      booking_id: Number(formBookingId),
      amount: Number(formAmount),
      payment_date: formDate,
      status_id: formStatusId,
      payment_proof: formProofBase64 || undefined,
      payment_proof_name: formProofName || undefined,
      allocation_mode: formAllocMode,
      payment_method: formPaymentMethod || undefined,
      manual_allocations:
        formAllocMode === "manual"
          ? manualAllocations
              .filter((a) => Number(a.amount) > 0)
              .map((a) => ({ bill_id: a.bill_id, amount: Number(a.amount) }))
          : undefined,
    });
    setLoading(false);

    if (result.success) {
      toast.success(
        editingRow ? "Pembayaran berhasil diperbarui" : "Pembayaran berhasil ditambahkan"
      );
      setModalOpen(false);
      resetForm();
    } else {
      toast.error(result.error ?? "Gagal menyimpan pembayaran");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setLoading(true);
    const result = await deletePaymentAction(deleteConfirm.id);
    setLoading(false);
    if (result.success) {
      toast.success("Pembayaran berhasil dihapus");
      setDeleteConfirm(null);
    } else {
      toast.error(result.error ?? "Gagal menghapus pembayaran");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    // payment_date is a @db.Date at midnight UTC; format in UTC so the displayed
    // calendar day matches what was stored regardless of client TZ.
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  const columns: ColumnDef<PaymentRow, unknown>[] = [
    {
      id: "booking",
      header: "Pemesanan",
      accessorFn: (row) => {
        const room = row.bookings.rooms?.room_number ?? "-";
        const tenant = row.bookings.tenants?.name ?? "-";
        return `${room} - ${tenant}`;
      },
      cell: ({ row }) => (
        <div>
          <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>
            {row.original.bookings.rooms?.room_number ?? "-"}
          </div>
          <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            {row.original.bookings.tenants?.name ?? "-"}
          </div>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Jumlah",
      accessorFn: (row) => Number(row.amount),
      cell: ({ row }) => (
        <span className="font-medium">{formatCurrency(row.original.amount)}</span>
      ),
    },
    {
      id: "payment_date",
      header: "Tanggal",
      accessorFn: (row) => row.payment_date,
      cell: ({ row }) => formatDate(row.original.payment_date),
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => row.paymentstatuses?.status ?? "-",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.paymentstatuses?.status ?? "PENDING"}
        />
      ),
    },
    {
      id: "payment_method",
      header: "Metode",
      accessorFn: (row) => row.payment_method ?? "-",
      cell: ({ row }) => {
        const m = row.original.payment_method;
        const label =
          m === "CASH"
            ? "Tunai"
            : m === "BANK_TRANSFER"
              ? "Transfer Bank"
              : m === "EWALLET"
                ? "E-Wallet"
                : "-";
        return <span>{label}</span>;
      },
    },
    {
      id: "proof",
      header: "Bukti",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.payment_proof ? (
          <a
            href={`/api/s3/${encodeURIComponent(row.original.payment_proof)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline"
            style={{ color: "var(--color-accent)" }}
          >
            Lihat
          </a>
        ) : (
          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            -
          </span>
        ),
    },
    {
      id: "actions",
      header: "Aksi",
      enableSorting: false,
      cell: ({ row }) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Icons.edit, onClick: () => openEdit(row.original) },
            { label: "Hapus", icon: Icons.delete, onClick: () => setDeleteConfirm(row.original), variant: "danger" },
          ]}
        />
      ),
    },
  ];

  const selectedBooking = bookings.find((b) => b.id === Number(formBookingId));
  const manualTotal = manualAllocations.reduce(
    (sum, a) => sum + (Number(a.amount) || 0),
    0
  );

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-semibold"
          style={{
            fontFamily: "var(--font-display), serif",
            color: "var(--color-text-primary)",
          }}
        >
          Pembayaran
        </h1>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          + Tambah Pembayaran
        </button>
      </div>

      <DataTable
        columns={columns}
        data={payments}
        searchPlaceholder="Cari pembayaran..."
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={editingRow ? "Edit Pembayaran" : "Tambah Pembayaran"}
        size="lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Booking Select (searchable) */}
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Pemesanan
            </label>
            <SearchableSelect
              options={bookings.map((b) => ({
                value: String(b.id),
                label: `${b.rooms?.room_number ?? "?"} - ${b.tenants?.name ?? "?"}`,
              }))}
              value={formBookingId ? String(formBookingId) : ""}
              onChange={(v) => setFormBookingId(v ? Number(v) : "")}
              placeholder="Cari pemesanan..."
            />
          </div>

          {/* Amount */}
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Jumlah (Rp)
            </label>
            <input
              type="number"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="0"
              min="1"
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          {/* Payment Date */}
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Tanggal Pembayaran
            </label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          {/* Status */}
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Status
            </label>
            <select
              value={formStatusId}
              onChange={(e) => setFormStatusId(Number(e.target.value))}
              className="w-full pl-3 pr-9 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
              }}
            >
              {paymentStatuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.status}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method */}
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Metode Pembayaran
            </label>
            <select
              value={formPaymentMethod}
              onChange={(e) =>
                setFormPaymentMethod(
                  e.target.value as "CASH" | "BANK_TRANSFER" | "EWALLET" | ""
                )
              }
              className="w-full pl-3 pr-9 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
              }}
            >
              <option value="">Pilih metode...</option>
              <option value="CASH">Tunai</option>
              <option value="BANK_TRANSFER">Transfer Bank</option>
              <option value="EWALLET">E-Wallet</option>
            </select>
          </div>

          {/* Payment Proof Upload */}
          <FileUpload
            accept="image/*"
            label="Bukti Pembayaran"
            onFileSelect={(base64, fileName) => {
              setFormProofBase64(base64);
              setFormProofName(fileName);
            }}
          />

          {/* Allocation Mode Toggle */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Mode Alokasi
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormAllocMode("auto")}
                className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
                style={{
                  backgroundColor:
                    formAllocMode === "auto" ? "var(--color-accent)" : "transparent",
                  color: formAllocMode === "auto" ? "white" : "var(--color-text-primary)",
                  borderColor:
                    formAllocMode === "auto"
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                }}
              >
                Otomatis
              </button>
              <button
                type="button"
                onClick={() => setFormAllocMode("manual")}
                className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
                style={{
                  backgroundColor:
                    formAllocMode === "manual" ? "var(--color-accent)" : "transparent",
                  color: formAllocMode === "manual" ? "white" : "var(--color-text-primary)",
                  borderColor:
                    formAllocMode === "manual"
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                }}
              >
                Manual
              </button>
            </div>
          </div>

          {/* Auto Mode Preview */}
          {formAllocMode === "auto" && allocPreview.length > 0 && (
            <div
              className="rounded-lg border p-3 space-y-2"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
              }}
            >
              <p
                className="text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Simulasi Alokasi:
              </p>
              {allocPreview.map((a) => (
                <div
                  key={a.bill_id}
                  className="flex justify-between text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <span>{a.description}</span>
                  <span className="font-medium">{formatCurrency(a.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Manual Mode: Bill Allocations */}
          {formAllocMode === "manual" && selectedBooking && (
            <div
              className="rounded-lg border p-3 space-y-3"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
              }}
            >
              <p
                className="text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Alokasi Manual ke Tagihan:
              </p>
              {selectedBooking.bills.map((bill, idx) => {
                const total = bill.bill_item.reduce(
                  (s, i) => s + Number(i.amount),
                  0
                );
                const paid = bill.paymentBills.reduce(
                  (s, p) => s + Number(p.amount),
                  0
                );
                const outstanding = total - paid;

                return (
                  <div key={bill.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {bill.description}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Sisa: {formatCurrency(outstanding)}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={manualAllocations[idx]?.amount ?? ""}
                      onChange={(e) => {
                        const updated = [...manualAllocations];
                        updated[idx] = {
                          bill_id: bill.id,
                          amount: e.target.value,
                        };
                        setManualAllocations(updated);
                      }}
                      className="w-32 px-2 py-1.5 text-sm rounded-lg border outline-none"
                      style={{
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-bg-card)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                  </div>
                );
              })}
              <div
                className="flex justify-between pt-2 border-t text-sm"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span style={{ color: "var(--color-text-secondary)" }}>
                  Total Alokasi:
                </span>
                <span
                  className="font-medium"
                  style={{
                    color:
                      Math.abs(manualTotal - Number(formAmount || 0)) < 0.01
                        ? "#059669"
                        : "#DC2626",
                  }}
                >
                  {formatCurrency(manualTotal)} / {formatCurrency(formAmount)}
                </span>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Hapus Pembayaran"
        size="sm"
      >
        <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
          Apakah Anda yakin ingin menghapus pembayaran sebesar{" "}
          <strong>{formatCurrency(deleteConfirm?.amount)}</strong> untuk kamar{" "}
          <strong>{deleteConfirm?.bookings.rooms?.room_number}</strong>? Transaksi
          terkait akan ikut terhapus.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeleteConfirm(null)}
            className="px-4 py-2.5 text-sm font-medium rounded-lg border"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            Batal
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "#DC2626" }}
          >
            {loading ? "Menghapus..." : "Hapus"}
          </button>
        </div>
      </Modal>
    </>
  );
}
