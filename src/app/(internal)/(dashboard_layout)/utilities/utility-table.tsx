"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

type SortKey = "reading_date" | "tenant_name" | "utility_type";
type SortDir = "asc" | "desc";

export function UtilityTable({ readings, bookings }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>("reading_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "↑" : "↓";
  }

  const sortedReadings = [...readings].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "reading_date") {
      cmp = a.reading_date.localeCompare(b.reading_date);
    } else if (sortKey === "tenant_name") {
      cmp = (a.tenant_name ?? "").localeCompare(b.tenant_name ?? "");
    } else if (sortKey === "utility_type") {
      cmp = a.utility_type.localeCompare(b.utility_type);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

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

      <div
        className="rounded-lg border overflow-x-auto"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border)",
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left border-b"
              style={{
                color: "var(--color-text-secondary)",
                backgroundColor: "var(--color-bg-card)",
                borderColor: "var(--color-border)",
              }}
            >
              <th className="px-4 py-3 font-medium cursor-pointer select-none" onClick={() => handleSort("reading_date")}>
                Tanggal {sortIndicator("reading_date")}
              </th>
              <th className="px-4 py-3 font-medium cursor-pointer select-none" onClick={() => handleSort("tenant_name")}>
                Penyewa / Kamar {sortIndicator("tenant_name")}
              </th>
              <th className="px-4 py-3 font-medium cursor-pointer select-none" onClick={() => handleSort("utility_type")}>
                Jenis {sortIndicator("utility_type")}
              </th>
              <th className="px-4 py-3 font-medium text-right">Sebelumnya</th>
              <th className="px-4 py-3 font-medium text-right">Sekarang</th>
              <th className="px-4 py-3 font-medium text-right">Pemakaian</th>
              <th className="px-4 py-3 font-medium text-right">Tarif</th>
              <th className="px-4 py-3 font-medium text-right">Jumlah</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sortedReadings.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Belum ada pembacaan meter.
                </td>
              </tr>
            )}
            {sortedReadings.map((r) => {
              const consumption =
                r.previous_value === null
                  ? null
                  : Math.max(0, r.reading_value - r.previous_value);
              const amount =
                consumption === null
                  ? null
                  : Math.round(consumption * r.rate_per_unit);
              return (
                <tr
                  key={r.id}
                  className="border-t"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  <td className="px-4 py-3">
                    {r.reading_date.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    {r.tenant_name ?? "-"}
                    {r.room_number ? ` / ${r.room_number}` : ""}
                  </td>
                  <td className="px-4 py-3">{utilityLabel(r.utility_type)}</td>
                  <td className="px-4 py-3 text-right">
                    {r.previous_value ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right">{r.reading_value}</td>
                  <td className="px-4 py-3 text-right">
                    {consumption ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(r.rate_per_unit)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {amount === null ? "-" : formatCurrency(amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={isPending}
                      className="text-sm font-medium disabled:opacity-50"
                      style={{ color: "#DC2626" }}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
