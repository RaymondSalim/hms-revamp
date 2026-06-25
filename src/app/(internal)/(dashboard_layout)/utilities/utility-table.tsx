"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { ServerDataTable } from "@/app/_components/server-data-table";
import { Modal } from "@/app/_components/modal";
import { SearchableSelect } from "@/app/_components/searchable-select";
import { useConfirm } from "@/app/_components/confirm-dialog";
import { formatCurrency } from "@/app/_lib/util/currency";
import { toast } from "react-toastify";
import {
  createMeterReadingAction,
  deleteMeterReadingAction,
} from "./utility-action";

export interface MeterReadingRow {
  id: number;
  booking_id: number;
  utility_type: string;
  reading_date: string;
  reading_value: number;
  previous_value: number | null;
  rate_per_unit: number;
  photo_proof: string | null;
  tenant_name: string | null;
  room_number: string | null;
}

export interface BookingOption {
  id: number;
  tenant_name: string | null;
  room_number: string | null;
}

interface Props {
  readings: MeterReadingRow[];
  bookings: BookingOption[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  search: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none";
const inputStyle = {
  backgroundColor: "var(--color-bg-primary)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
};

function utilityLabel(t: string): string {
  return t === "electricity" ? "Listrik" : "Air";
}

function bookingLabel(b: BookingOption): string {
  const parts = [];
  if (b.room_number) parts.push(`Kamar ${b.room_number}`);
  if (b.tenant_name) parts.push(b.tenant_name);
  return parts.length ? parts.join(" - ") : `Booking #${b.id}`;
}

export function UtilityTable({
  readings,
  bookings,
  total,
  page,
  pageSize,
  pageCount,
  search,
  sortBy,
  sortDir,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [bookingId, setBookingId] = useState<string>(
    bookings[0] ? String(bookings[0].id) : ""
  );
  const [utilityType, setUtilityType] = useState("electricity");
  const [readingDate, setReadingDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [readingValue, setReadingValue] = useState("");
  const [ratePerUnit, setRatePerUnit] = useState("");
  const [photoProof, setPhotoProof] = useState("");

  function resetForm() {
    setBookingId(bookings[0] ? String(bookings[0].id) : "");
    setUtilityType("electricity");
    setReadingDate(new Date().toISOString().slice(0, 10));
    setReadingValue("");
    setRatePerUnit("");
    setPhotoProof("");
  }

  function handleSubmit() {
    if (!bookingId) {
      toast.error("Pilih pemesanan terlebih dahulu");
      return;
    }
    if (readingValue === "" || ratePerUnit === "") {
      toast.error("Isi nilai meter dan tarif");
      return;
    }

    startTransition(async () => {
      const result = await createMeterReadingAction({
        booking_id: Number(bookingId),
        utility_type: utilityType,
        reading_date: readingDate,
        reading_value: Number(readingValue),
        rate_per_unit: Number(ratePerUnit),
        photo_proof: photoProof || null,
      });
      if (result.success) {
        toast.success(result.note ?? "Pembacaan dicatat");
        setIsOpen(false);
        resetForm();
        router.refresh();
      } else {
        toast.error(result.error ?? "Gagal mencatat pembacaan");
      }
    });
  }

  async function handleDelete(id: number) {
    if (!(await confirm({ message: "Hapus pembacaan ini dan tagihan terkait?", danger: true }))) return;
    startTransition(async () => {
      const result = await deleteMeterReadingAction(id);
      if (result.success) {
        toast.success("Pembacaan dihapus");
        router.refresh();
      } else {
        toast.error(result.error ?? "Gagal menghapus");
      }
    });
  }

  const columns: ColumnDef<MeterReadingRow, unknown>[] = [
    {
      id: "reading_date",
      header: "Tanggal",
      accessorFn: (row) => row.reading_date,
      cell: ({ row }) => row.original.reading_date.slice(0, 10),
    },
    {
      id: "tenant",
      header: "Penyewa / Kamar",
      accessorFn: (row) => `${row.tenant_name ?? "-"} / ${row.room_number ?? "-"}`,
      cell: ({ row }) => (
        <span>
          {row.original.tenant_name ?? "-"}
          {row.original.room_number ? ` / ${row.original.room_number}` : ""}
        </span>
      ),
    },
    {
      id: "utility_type",
      header: "Jenis",
      accessorFn: (row) => row.utility_type,
      cell: ({ row }) => utilityLabel(row.original.utility_type),
    },
    {
      id: "previous_value",
      header: "Sebelumnya",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">{row.original.previous_value ?? "-"}</div>
      ),
    },
    {
      id: "reading_value",
      header: "Sekarang",
      accessorFn: (row) => row.reading_value,
      cell: ({ row }) => <div className="text-right">{row.original.reading_value}</div>,
    },
    {
      id: "consumption",
      header: "Pemakaian",
      enableSorting: false,
      cell: ({ row }) => {
        const consumption =
          row.original.previous_value === null
            ? null
            : Math.max(0, row.original.reading_value - row.original.previous_value);
        return <div className="text-right">{consumption ?? "-"}</div>;
      },
    },
    {
      id: "rate",
      header: "Tarif",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">{formatCurrency(row.original.rate_per_unit)}</div>
      ),
    },
    {
      id: "amount",
      header: "Jumlah",
      enableSorting: false,
      cell: ({ row }) => {
        const consumption =
          row.original.previous_value === null
            ? null
            : Math.max(0, row.original.reading_value - row.original.previous_value);
        const amount =
          consumption === null ? null : Math.round(consumption * row.original.rate_per_unit);
        return <div className="text-right">{amount === null ? "-" : formatCurrency(amount)}</div>;
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <button
            onClick={() => handleDelete(row.original.id)}
            disabled={isPending}
            className="text-sm font-medium disabled:opacity-50"
            style={{ color: "#DC2626" }}
          >
            Hapus
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Utilitas
        </h1>
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          Catat Pembacaan
        </button>
      </div>

      <ServerDataTable
        columns={columns}
        data={readings}
        total={total}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        sortableColumns={["reading_date", "utility_type", "reading_value", "tenant"]}
        searchPlaceholder="Cari penyewa atau kamar..."
      />

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Catat Pembacaan Meter"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1 text-sm">
            <span style={{ color: "var(--color-text-secondary)" }}>
              Pemesanan
            </span>
            <SearchableSelect
              options={bookings.map((b) => ({
                value: String(b.id),
                label: bookingLabel(b),
              }))}
              value={bookingId}
              onChange={(v) => setBookingId(v)}
              placeholder={bookings.length === 0 ? "(Tidak ada pemesanan aktif)" : "Cari pemesanan..."}
              isClearable={false}
            />
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: "var(--color-text-secondary)" }}>Jenis</span>
            <select
              className={inputClass}
              style={inputStyle}
              value={utilityType}
              onChange={(e) => setUtilityType(e.target.value)}
            >
              <option value="electricity">Listrik</option>
              <option value="water">Air</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: "var(--color-text-secondary)" }}>
              Tanggal Pembacaan
            </span>
            <input
              type="date"
              className={inputClass}
              style={inputStyle}
              value={readingDate}
              onChange={(e) => setReadingDate(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: "var(--color-text-secondary)" }}>
              Nilai Meter Sekarang
            </span>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              style={inputStyle}
              value={readingValue}
              onChange={(e) => setReadingValue(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: "var(--color-text-secondary)" }}>
              Tarif per Unit
            </span>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              style={inputStyle}
              value={ratePerUnit}
              onChange={(e) => setRatePerUnit(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: "var(--color-text-secondary)" }}>
              URL Bukti Foto (opsional)
            </span>
            <input
              type="text"
              className={inputClass}
              style={inputStyle}
              value={photoProof}
              onChange={(e) => setPhotoProof(e.target.value)}
            />
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
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
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isPending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
