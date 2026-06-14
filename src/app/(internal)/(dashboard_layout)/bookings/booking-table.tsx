"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { formatCurrency } from "@/app/_lib/util/currency";
import {
  deleteBookingAction,
  scheduleEndOfStayAction,
  checkInOutAction,
} from "./booking-action";
import { BookingForm } from "./booking-form";
import { ActionMenu, Icons } from "@/app/_components/action-menu";
import { toast } from "react-toastify";

export interface BookingRow {
  id: number;
  room_id: number | null;
  start_date: string;
  end_date: string | null;
  fee: string;
  tenant_id: string | null;
  is_rolling: boolean;
  status_id: number | null;
  duration_id: number | null;
  second_resident_fee: string | null;
  rooms: {
    id: number;
    room_number: string;
    room_type_id: number | null;
    roomtypes: { id: number; type: string } | null;
  } | null;
  tenants: { id: string; name: string } | null;
  bookingstatuses: { id: number; status: string } | null;
  durations: { id: number; duration: string; month_count: number } | null;
  deposit: { id: number; amount: string; status: string } | null;
  addOns: Array<{
    id: string;
    addon_id: string;
    start_date: string;
    end_date: string | null;
    addOn: {
      id: string;
      name: string;
      pricing: Array<{
        interval_start: number;
        interval_end: number | null;
        price: number;
        is_full_payment: boolean;
      }>;
    };
  }>;
}

interface RoomOption {
  id: number;
  room_number: string;
  room_type_id: number | null;
  roomtypes: { id: number; type: string } | null;
}

interface TenantOption {
  id: string;
  name: string;
}

interface DurationOption {
  id: number;
  duration: string;
  month_count: number;
}

interface AddonOption {
  id: string;
  name: string;
  pricing: Array<{
    interval_start: number;
    interval_end: number | null;
    price: number;
    is_full_payment: boolean;
  }>;
}

interface RoomTypeDurationOption {
  room_type_id: number;
  duration_id: number;
  suggested_price: string | null;
}

interface BookingStatusOption {
  id: number;
  status: string;
}

interface Props {
  bookings: BookingRow[];
  rooms: RoomOption[];
  tenants: TenantOption[];
  durations: DurationOption[];
  addons: AddonOption[];
  roomTypeDurations: RoomTypeDurationOption[];
  bookingStatuses: BookingStatusOption[];
}

function StatusBadge({ status }: { status: string }) {
  let bg = "var(--color-accent-light)";
  let color = "var(--color-accent)";

  switch (status.toUpperCase()) {
    case "PENDING":
      bg = "#FEF3C7";
      color = "#D97706";
      break;
    case "ACTIVE":
      bg = "#D1FAE5";
      color = "#059669";
      break;
    case "COMPLETED":
      bg = "#F3F4F6";
      color = "#6B7280";
      break;
    case "CANCELLED":
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

export function BookingTable({
  bookings,
  rooms,
  tenants,
  durations,
  addons,
  roomTypeDurations,
  bookingStatuses,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<BookingRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BookingRow | null>(null);
  const [scheduleEndModal, setScheduleEndModal] = useState<BookingRow | null>(
    null
  );
  const [checkInOutModal, setCheckInOutModal] = useState<{
    booking: BookingRow;
    type: "CHECK_IN" | "CHECK_OUT";
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [endDateValue, setEndDateValue] = useState("");

  const openCreate = () => {
    setEditingRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: BookingRow) => {
    setEditingRow(row);
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setLoading(true);
    const result = await deleteBookingAction(deleteConfirm.id);
    setLoading(false);
    if (result.success) {
      toast.success("Pemesanan berhasil dihapus");
      setDeleteConfirm(null);
    } else {
      toast.error(result.error ?? "Gagal menghapus pemesanan");
      setDeleteConfirm(null);
    }
  };

  const handleScheduleEnd = async () => {
    if (!scheduleEndModal || !endDateValue) return;
    setLoading(true);
    const result = await scheduleEndOfStayAction(
      scheduleEndModal.id,
      new Date(endDateValue)
    );
    setLoading(false);
    if (result.success) {
      toast.success("Jadwal akhir penghunian berhasil disimpan");
      setScheduleEndModal(null);
      setEndDateValue("");
    } else {
      toast.error(result.error ?? "Gagal menjadwalkan akhir penghunian");
    }
  };

  const handleCheckInOut = async () => {
    if (!checkInOutModal) return;
    setLoading(true);
    const result = await checkInOutAction({
      booking_id: checkInOutModal.booking.id,
      event_type: checkInOutModal.type,
      event_date: new Date(),
      tenant_id: checkInOutModal.booking.tenant_id!,
    });
    setLoading(false);
    if (result.success) {
      toast.success(
        checkInOutModal.type === "CHECK_IN"
          ? "Check-in berhasil dicatat"
          : "Check-out berhasil dicatat"
      );
      setCheckInOutModal(null);
    } else {
      toast.error(result.error ?? "Gagal mencatat check-in/out");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    // start_date/end_date are @db.Date at midnight UTC; format in UTC so the
    // displayed calendar day matches what was stored regardless of client TZ.
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  const columns: ColumnDef<BookingRow, unknown>[] = [
    {
      id: "room",
      header: "Kamar",
      accessorFn: (row) => row.rooms?.room_number ?? "-",
    },
    {
      id: "tenant",
      header: "Penyewa",
      accessorFn: (row) => row.tenants?.name ?? "-",
    },
    {
      id: "start_date",
      header: "Mulai",
      accessorFn: (row) => row.start_date,
      cell: ({ row }) => formatDate(row.original.start_date),
    },
    {
      id: "end_date",
      header: "Selesai",
      cell: ({ row }) => {
        if (row.original.is_rolling && !row.original.end_date) {
          return (
            <span
              className="px-2 py-1 text-xs font-medium rounded-full"
              style={{ backgroundColor: "#DBEAFE", color: "#2563EB" }}
            >
              Bergulir
            </span>
          );
        }
        return formatDate(row.original.end_date);
      },
    },
    {
      id: "fee",
      header: "Biaya/Bulan",
      accessorFn: (row) => Number(row.fee),
      cell: ({ row }) => formatCurrency(row.original.fee),
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => row.bookingstatuses?.status ?? "-",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.bookingstatuses?.status ?? "UNKNOWN"}
        />
      ),
    },
    {
      id: "actions",
      header: "Aksi",
      enableSorting: false,
      cell: ({ row }) => {
        const items = [
          { label: "Edit", icon: Icons.edit, onClick: () => openEdit(row.original) },
          { label: "Check In", icon: Icons.checkIn, onClick: () => setCheckInOutModal({ booking: row.original, type: "CHECK_IN" }), variant: "success" as const },
          { label: "Check Out", icon: Icons.checkOut, onClick: () => setCheckInOutModal({ booking: row.original, type: "CHECK_OUT" }), variant: "warning" as const },
          ...(row.original.is_rolling && !row.original.end_date
            ? [{ label: "Akhiri", icon: Icons.endBooking, onClick: () => setScheduleEndModal(row.original), variant: "info" as const }]
            : []),
          { label: "Hapus", icon: Icons.delete, onClick: () => setDeleteConfirm(row.original), variant: "danger" as const },
        ];
        return <ActionMenu items={items} maxInline={2} />;
      },
    },
  ];

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
          Pemesanan
        </h1>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          + Tambah Pemesanan
        </button>
      </div>

      <DataTable
        columns={columns}
        data={bookings}
        searchPlaceholder="Cari pemesanan..."
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRow ? "Edit Pemesanan" : "Tambah Pemesanan"}
        size="lg"
      >
        <BookingForm
          booking={editingRow}
          rooms={rooms}
          tenants={tenants}
          durations={durations}
          addons={addons}
          roomTypeDurations={roomTypeDurations}
          bookingStatuses={bookingStatuses}
          onSuccess={() => setModalOpen(false)}
        />
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Hapus Pemesanan"
        size="sm"
      >
        <p
          className="text-sm mb-4"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Apakah Anda yakin ingin menghapus pemesanan kamar{" "}
          <strong>{deleteConfirm?.rooms?.room_number}</strong> untuk{" "}
          <strong>{deleteConfirm?.tenants?.name}</strong>? Semua tagihan dan
          pembayaran terkait akan ikut terhapus.
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

      {/* Schedule End Modal */}
      <Modal
        isOpen={!!scheduleEndModal}
        onClose={() => {
          setScheduleEndModal(null);
          setEndDateValue("");
        }}
        title="Jadwalkan Akhir Penghunian"
        size="sm"
      >
        <div className="space-y-4">
          <p
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Tentukan tanggal akhir penghunian untuk kamar{" "}
            <strong>{scheduleEndModal?.rooms?.room_number}</strong>.
          </p>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Tanggal Akhir
            </label>
            <input
              type="date"
              value={endDateValue}
              onChange={(e) => setEndDateValue(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
              }}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setScheduleEndModal(null);
                setEndDateValue("");
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
              onClick={handleScheduleEnd}
              disabled={loading || !endDateValue}
              className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Check In/Out Modal */}
      <Modal
        isOpen={!!checkInOutModal}
        onClose={() => setCheckInOutModal(null)}
        title={
          checkInOutModal?.type === "CHECK_IN" ? "Check-In" : "Check-Out"
        }
        size="sm"
      >
        <div className="space-y-4">
          <p
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {checkInOutModal?.type === "CHECK_IN"
              ? "Konfirmasi check-in untuk"
              : "Konfirmasi check-out untuk"}{" "}
            <strong>{checkInOutModal?.booking.tenants?.name}</strong> di kamar{" "}
            <strong>{checkInOutModal?.booking.rooms?.room_number}</strong>?
          </p>
          {checkInOutModal?.type === "CHECK_OUT" && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
            >
              Check-out akan mengakhiri pemesanan dan menghentikan tagihan
              berikutnya.
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setCheckInOutModal(null)}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              Batal
            </button>
            <button
              onClick={handleCheckInOut}
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{
                backgroundColor:
                  checkInOutModal?.type === "CHECK_IN" ? "#059669" : "#D97706",
              }}
            >
              {loading
                ? "Memproses..."
                : checkInOutModal?.type === "CHECK_IN"
                  ? "Check-In"
                  : "Check-Out"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
