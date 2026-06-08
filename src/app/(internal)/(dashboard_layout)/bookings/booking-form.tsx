"use client";

import { useState, useMemo } from "react";
import { upsertBookingAction } from "./booking-action";
import { toast } from "react-toastify";
import type { BookingRow } from "./booking-table";

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
  booking: BookingRow | null;
  rooms: RoomOption[];
  tenants: TenantOption[];
  durations: DurationOption[];
  addons: AddonOption[];
  roomTypeDurations: RoomTypeDurationOption[];
  bookingStatuses: BookingStatusOption[];
  onSuccess: () => void;
}

export function BookingForm({
  booking,
  rooms,
  tenants,
  durations,
  addons,
  roomTypeDurations,
  bookingStatuses,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [tenantSearch, setTenantSearch] = useState("");

  // Form state
  const [roomId, setRoomId] = useState<number>(
    booking?.room_id ?? 0
  );
  const [tenantId, setTenantId] = useState(booking?.tenant_id ?? "");
  const [startDate, setStartDate] = useState(
    booking?.start_date ? booking.start_date.split("T")[0] : ""
  );
  const [durationId, setDurationId] = useState<number | null>(
    booking?.duration_id ?? null
  );
  const [isRolling, setIsRolling] = useState(booking?.is_rolling ?? false);
  const [fee, setFee] = useState(booking?.fee ? String(Number(booking.fee)) : "");
  const [secondResidentFee, setSecondResidentFee] = useState(
    booking?.second_resident_fee
      ? String(Number(booking.second_resident_fee))
      : ""
  );
  const [depositAmount, setDepositAmount] = useState(
    booking?.deposit ? String(Number(booking.deposit.amount)) : ""
  );
  const [statusId, setStatusId] = useState<number>(
    booking?.status_id ?? (bookingStatuses[0]?.id ?? 1)
  );
  const [selectedAddons, setSelectedAddons] = useState<
    Array<{ addon_id: string; start_date: string }>
  >(
    booking?.addOns?.map((a) => ({
      addon_id: a.addon_id,
      start_date: a.start_date.split("T")[0],
    })) ?? []
  );
  const [editAcknowledged, setEditAcknowledged] = useState(false);

  // Auto-suggest fee based on room type + duration
  const selectedRoom = rooms.find((r) => r.id === roomId);
  const suggestedFee = useMemo(() => {
    if (!selectedRoom?.room_type_id || !durationId) return null;
    const rtd = roomTypeDurations.find(
      (r) =>
        r.room_type_id === selectedRoom.room_type_id &&
        r.duration_id === durationId
    );
    return rtd?.suggested_price ? Number(rtd.suggested_price) : null;
  }, [selectedRoom, durationId, roomTypeDurations]);

  // Filter tenants by search
  const filteredTenants = useMemo(() => {
    if (!tenantSearch) return tenants;
    const lower = tenantSearch.toLowerCase();
    return tenants.filter((t) => t.name.toLowerCase().includes(lower));
  }, [tenants, tenantSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (booking && !editAcknowledged) {
      toast.error("Harap konfirmasi perubahan terlebih dahulu");
      return;
    }
    setLoading(true);

    try {
      const result = await upsertBookingAction({
        id: booking?.id,
        room_id: roomId,
        start_date: new Date(startDate),
        duration_id: isRolling ? null : durationId,
        fee: Number(fee),
        tenant_id: tenantId,
        is_rolling: isRolling,
        status_id: statusId,
        second_resident_fee: secondResidentFee
          ? Number(secondResidentFee)
          : null,
        deposit_amount: depositAmount ? Number(depositAmount) : undefined,
        addon_ids: selectedAddons.map((a) => ({
          addon_id: a.addon_id,
          start_date: new Date(a.start_date),
        })),
      });

      if (result.success) {
        toast.success(
          booking
            ? "Pemesanan berhasil diperbarui"
            : "Pemesanan berhasil ditambahkan"
        );
        onSuccess();
      } else {
        if (typeof result.error === "string") {
          toast.error(result.error);
        } else {
          const messages = Object.values(
            result.error?.fieldErrors || {}
          ).flat();
          toast.error((messages[0] as string) || "Validasi gagal");
        }
      }
    } catch {
      toast.error("Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const addAddon = () => {
    setSelectedAddons([
      ...selectedAddons,
      { addon_id: "", start_date: startDate || "" },
    ]);
  };

  const removeAddon = (index: number) => {
    setSelectedAddons(selectedAddons.filter((_, i) => i !== index));
  };

  const updateAddon = (
    index: number,
    field: "addon_id" | "start_date",
    value: string
  ) => {
    const updated = [...selectedAddons];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedAddons(updated);
  };

  const inputStyle = {
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-bg-card)",
    color: "var(--color-text-primary)",
  };

  const labelStyle = {
    color: "var(--color-text-primary)",
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 max-h-[70vh] overflow-y-auto pr-2"
    >
      {/* Edit mode warning */}
      {booking && (
        <div
          className="p-3 rounded-lg text-sm"
          style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
        >
          Mengubah pemesanan akan menghapus tagihan yang di-generate ulang dan
          merekalkulasi alokasi pembayaran. Tagihan manual (CREATED) akan
          dipertahankan.
        </div>
      )}

      {/* Tenant select (searchable) */}
      <div>
        <label className="block text-sm font-medium mb-1" style={labelStyle}>
          Penyewa <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          placeholder="Cari penyewa..."
          value={tenantSearch}
          onChange={(e) => setTenantSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border outline-none mb-1"
          style={inputStyle}
        />
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          required
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
          style={inputStyle}
          size={Math.min(filteredTenants.length + 1, 5)}
        >
          <option value="">Pilih penyewa</option>
          {filteredTenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Room select */}
      <div>
        <label className="block text-sm font-medium mb-1" style={labelStyle}>
          Kamar <span className="text-red-500">*</span>
        </label>
        <select
          value={roomId || ""}
          onChange={(e) => setRoomId(parseInt(e.target.value, 10))}
          required
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
          style={inputStyle}
        >
          <option value="">Pilih kamar</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.room_number}
              {r.roomtypes ? ` (${r.roomtypes.type})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Start date */}
      <div>
        <label className="block text-sm font-medium mb-1" style={labelStyle}>
          Tanggal Mulai <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
          style={inputStyle}
        />
      </div>

      {/* Rolling toggle */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" style={labelStyle}>
          Bergulir (Rolling)
        </label>
        <button
          type="button"
          onClick={() => {
            setIsRolling(!isRolling);
            if (!isRolling) setDurationId(null);
          }}
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          style={{
            backgroundColor: isRolling ? "var(--color-accent)" : "#D1D5DB",
          }}
        >
          <span
            className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            style={{
              transform: isRolling ? "translateX(24px)" : "translateX(4px)",
            }}
          />
        </button>
      </div>

      {/* Duration select (hidden if rolling) */}
      {!isRolling && (
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>
            Durasi <span className="text-red-500">*</span>
          </label>
          <select
            value={durationId ?? ""}
            onChange={(e) =>
              setDurationId(e.target.value ? parseInt(e.target.value, 10) : null)
            }
            required={!isRolling}
            className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
            style={inputStyle}
          >
            <option value="">Pilih durasi</option>
            {durations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.duration} ({d.month_count} bulan)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Fee */}
      <div>
        <label className="block text-sm font-medium mb-1" style={labelStyle}>
          Biaya per Bulan (Rp) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          required
          min={1}
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
          style={inputStyle}
        />
        {suggestedFee && (
          <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
            Harga disarankan:{" "}
            <button
              type="button"
              onClick={() => setFee(String(suggestedFee))}
              className="underline"
              style={{ color: "var(--color-accent)" }}
            >
              Rp{suggestedFee.toLocaleString("id-ID")}
            </button>
          </p>
        )}
      </div>

      {/* Deposit */}
      <div>
        <label className="block text-sm font-medium mb-1" style={labelStyle}>
          Deposit (Rp)
        </label>
        <input
          type="number"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          min={0}
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
          style={inputStyle}
        />
      </div>

      {/* Second Resident Fee */}
      <div>
        <label className="block text-sm font-medium mb-1" style={labelStyle}>
          Biaya Penghuni Kedua (Rp)
        </label>
        <input
          type="number"
          value={secondResidentFee}
          onChange={(e) => setSecondResidentFee(e.target.value)}
          min={0}
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
          style={inputStyle}
        />
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium mb-1" style={labelStyle}>
          Status <span className="text-red-500">*</span>
        </label>
        <select
          value={statusId}
          onChange={(e) => setStatusId(parseInt(e.target.value, 10))}
          required
          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
          style={inputStyle}
        >
          {bookingStatuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.status}
            </option>
          ))}
        </select>
      </div>

      {/* Add-ons section */}
      <div
        className="border rounded-xl p-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium" style={labelStyle}>
            Add-on
          </span>
          <button
            type="button"
            onClick={addAddon}
            className="px-3 py-1 text-xs font-medium rounded-lg"
            style={{
              backgroundColor: "var(--color-accent-light)",
              color: "var(--color-accent)",
            }}
          >
            + Tambah
          </button>
        </div>

        {selectedAddons.length === 0 && (
          <p
            className="text-sm italic"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Belum ada add-on
          </p>
        )}

        {selectedAddons.map((addon, index) => (
          <div
            key={index}
            className="flex gap-2 items-end mb-2"
          >
            <div className="flex-1">
              <select
                value={addon.addon_id}
                onChange={(e) => updateAddon(index, "addon_id", e.target.value)}
                required
                className="w-full px-2 py-2 text-sm rounded-lg border outline-none"
                style={inputStyle}
              >
                <option value="">Pilih add-on</option>
                {addons.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-36">
              <input
                type="date"
                value={addon.start_date}
                onChange={(e) =>
                  updateAddon(index, "start_date", e.target.value)
                }
                required
                className="w-full px-2 py-2 text-sm rounded-lg border outline-none"
                style={inputStyle}
              />
            </div>
            <button
              type="button"
              onClick={() => removeAddon(index)}
              className="px-2 py-2 text-xs font-medium rounded-lg"
              style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}
            >
              X
            </button>
          </div>
        ))}
      </div>

      {/* Edit acknowledgment checkbox */}
      {booking && (
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="edit-acknowledge"
            checked={editAcknowledged}
            onChange={(e) => setEditAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          <label
            htmlFor="edit-acknowledge"
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Saya memahami bahwa perubahan ini akan merekalkulasi tagihan dan
            alokasi pembayaran.
          </label>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || (!!booking && !editAcknowledged)}
          className="px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "white",
          }}
        >
          {loading ? "Menyimpan..." : booking ? "Perbarui" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
